import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

const getBearerToken = (request: Request): string | null => {
    const authHeader = request.headers.get('authorization') ?? ''
    if (!authHeader.toLowerCase().startsWith('bearer ')) return null
    return authHeader.slice(7).trim() || null
}

const SPRINT_SIZE = 6

type ProgressRow = {
    student_id: string | null
    day_number: number | null
    quiz_score: number | null
    'Practice Quiz Scores': unknown
}

type AllowedRow = {
    email: string
    Student_Name: string | null
    Student_id: string | null
}

type PracticeAttempt = {
    attempt: number
    score: number
    total: number
    percentage: number
    completed_at: string
}

function parsePracticeAttempts(value: unknown): PracticeAttempt[] {
    if (!Array.isArray(value)) return []
    return value
        .map((entry, idx) => {
            if (!entry || typeof entry !== 'object') return null
            const item = entry as Record<string, unknown>
            const score = Number(item.score ?? 0)
            const total = Number(item.total ?? 0)
            if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return null
            const attempt = Number(item.attempt ?? idx + 1)
            const percentage = Number(item.percentage ?? Math.round((score / total) * 100))
            return {
                attempt: Number.isFinite(attempt) && attempt > 0 ? Math.trunc(attempt) : idx + 1,
                score,
                total,
                percentage: Number.isFinite(percentage) ? percentage : Math.round((score / total) * 100),
                completed_at: typeof item.completed_at === 'string' ? item.completed_at : new Date().toISOString(),
            } satisfies PracticeAttempt
        })
        .filter((e): e is PracticeAttempt => e !== null)
}

export async function GET(request: Request) {
    const admin = getSupabaseAdmin()
    if (!admin) {
        return NextResponse.json({ error: 'Server auth is not configured.' }, { status: 500 })
    }

    const token = getBearerToken(request)
    if (!token) {
        return NextResponse.json({ error: 'Missing access token.' }, { status: 401 })
    }

    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) {
        return NextResponse.json({ error: userError?.message ?? 'Invalid session.' }, { status: 401 })
    }

    // Fetch all progress rows + allowed_emails (for student names)
    const [
        { data: progressData, error: progressError },
        { data: allowedData, error: allowedError },
    ] = await Promise.all([
        admin
            .from('student_day_progress')
            .select('student_id,day_number,quiz_score,"Practice Quiz Scores"')
            .order('day_number', { ascending: true }),
        admin
            .from('allowed_emails')
            .select('email,Student_Name,Student_id'),
    ])

    if (progressError) return NextResponse.json({ error: progressError.message }, { status: 500 })
    if (allowedError) return NextResponse.json({ error: allowedError.message }, { status: 500 })

    const progressRows = (progressData as ProgressRow[] | null) ?? []
    const allowedRows = (allowedData as AllowedRow[] | null) ?? []

    // Build email → name map from allowed_emails
    const nameByEmail: Record<string, string> = {}
    for (const row of allowedRows) {
        if (row.email) nameByEmail[row.email.trim().toLowerCase()] = row.Student_Name ?? ''
    }

    // Resolve auth UIDs → email → name by listing auth users
    const authUidToName: Record<string, string> = {}
    const studentIds = new Set<string>(
        progressRows.map(r => r.student_id).filter((id): id is string => typeof id === 'string' && id.length > 0)
    )

    if (studentIds.size > 0) {
        for (let page = 1; page <= 25; page++) {
            const { data: usersPage } = await admin.auth.admin.listUsers({ page, perPage: 200 })
            const users = usersPage?.users ?? []
            for (const u of users) {
                if (!studentIds.has(u.id)) continue
                const email = (u.email ?? '').trim().toLowerCase()
                authUidToName[u.id] = nameByEmail[email] || email.split('@')[0] || u.id
                studentIds.delete(u.id)
            }
            if (users.length < 200 || studentIds.size === 0) break
        }
    }

    // ── Day-wise leaderboard ─────────────────────────────────────────
    // Group first-attempt quiz_score per (student, day)
    // quiz_score in student_day_progress IS the first attempt score
    const dayMap = new Map<number, Map<string, number>>()
    for (const row of progressRows) {
        if (!row.student_id || row.day_number === null || row.quiz_score === null) continue
        const day = row.day_number
        if (!dayMap.has(day)) dayMap.set(day, new Map())
        const studentScores = dayMap.get(day)!
        // Take the stored quiz_score (it's the first-attempt score as per existing system)
        if (!studentScores.has(row.student_id)) {
            studentScores.set(row.student_id, row.quiz_score)
        }
    }

    const dayLeaderboard: Record<number, Array<{ rank: number; name: string; score: number }>> = {}
    for (const [day, studentScores] of dayMap.entries()) {
        const entries = Array.from(studentScores.entries())
            .map(([uid, score]) => ({ name: authUidToName[uid] || uid, score }))
            .sort((a, b) => b.score - a.score)

        let rank = 1
        dayLeaderboard[day] = entries.map((e, i) => {
            if (i > 0 && e.score < entries[i - 1].score) rank = i + 1
            return { rank, name: e.name, score: e.score }
        })
    }

    // ── Sprint-wise leaderboard ───────────────────────────────────────
    // Score = sum of first-attempt quiz scores in the sprint + practice box first attempt percentage
    const allDays = Array.from(dayMap.keys()).sort((a, b) => a - b)
    const maxDay = allDays[allDays.length - 1] ?? 0
    const numSprints = Math.ceil(maxDay / SPRINT_SIZE)

    const sprintLeaderboard: Record<number, Array<{ rank: number; name: string; score: number; quizScore: number; practiceScore: number }>> = {}

    for (let sprint = 1; sprint <= numSprints; sprint++) {
        const startDay = (sprint - 1) * SPRINT_SIZE + 1
        const endDay = sprint * SPRINT_SIZE
        const anchorDay = endDay // Practice box score stored on last day of sprint

        // Collect per-student quiz scores summed over sprint days
        const studentQuizTotals = new Map<string, { total: number; count: number }>()
        const studentPractice = new Map<string, number>() // first attempt practice %

        for (const row of progressRows) {
            if (!row.student_id || row.day_number === null) continue
            const day = row.day_number

            // Quiz scores (days in this sprint)
            if (day >= startDay && day <= endDay && row.quiz_score !== null) {
                const existing = studentQuizTotals.get(row.student_id) ?? { total: 0, count: 0 }
                existing.total += row.quiz_score
                existing.count += 1
                studentQuizTotals.set(row.student_id, existing)
            }

            // Practice box: first attempt on the anchor (last) day
            if (day === anchorDay) {
                const attempts = parsePracticeAttempts(row['Practice Quiz Scores'])
                if (attempts.length > 0 && !studentPractice.has(row.student_id)) {
                    // First attempt = attempts[0]
                    studentPractice.set(row.student_id, attempts[0].percentage)
                }
            }
        }

        // Union of all students who appear in either quiz or practice for this sprint
        const allStudentIds = new Set([...studentQuizTotals.keys(), ...studentPractice.keys()])

        const entries = Array.from(allStudentIds).map((uid) => {
            const quiz = studentQuizTotals.get(uid)
            const quizScore = quiz ? quiz.total : 0
            const practiceScore = studentPractice.get(uid) ?? 0
            // Combined score = sum of quiz scores (each out of 10, so max = days*10) + practice%
            const score = quizScore + practiceScore
            return {
                name: authUidToName[uid] || uid,
                score: Math.round(score * 10) / 10,
                quizScore,
                practiceScore,
            }
        }).sort((a, b) => b.score - a.score)

        let rank = 1
        sprintLeaderboard[sprint] = entries.map((e, i) => {
            if (i > 0 && e.score < entries[i - 1].score) rank = i + 1
            return { rank, ...e }
        })
    }

    // ── Determine available days and sprints ─────────────────────────
    const availableDays = Array.from(dayMap.keys()).sort((a, b) => a - b)
    const availableSprints = Array.from({ length: numSprints }, (_, i) => ({
        sprint: i + 1,
        startDay: i * SPRINT_SIZE + 1,
        endDay: (i + 1) * SPRINT_SIZE,
    }))

    return NextResponse.json({
        dayLeaderboard,
        sprintLeaderboard,
        availableDays,
        availableSprints,
    })
}

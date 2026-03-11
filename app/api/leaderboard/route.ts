import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

const getBearerToken = (request: Request): string | null => {
    const authHeader = request.headers.get('authorization') ?? ''
    if (!authHeader.toLowerCase().startsWith('bearer ')) return null
    return authHeader.slice(7).trim() || null
}

const SPRINT_SIZE = 6
const TOTAL_SPRINTS = 5 // Total sprints in the course (5 sprints × 6 days = 30 days)

// Points awarded per completed activity
const RECAP_POINTS = 10
const INTERVIEW_POINTS = 10
const SCENARIO_POINTS = 10
// Quiz points = number of correct answers (quiz_score stored directly as correct count)
// Practice Box points = first attempt raw score (attempts[0].score = correct count)

type ProgressRow = {
    student_id: string | null
    day_number: number | null
    recap_completed: boolean | null
    interview_completed: boolean | null
    scenario_completed: boolean | null
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

export type SprintEntry = {
    rank: number
    name: string
    score: number
    activityPoints: number
    quizPoints: number
    practicePoints: number
    completedDays: number
    isCurrentUser: boolean
}

type CurrentUserStats = {
    rank: number | null
    name: string
    score: number
    activityPoints: number
    quizPoints: number
    practicePoints: number
    completedDays: number
    hasData: boolean
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

    const currentUserId = userData.user.id

    // Fetch all progress rows + allowed_emails (for student names)
    const [
        { data: progressData, error: progressError },
        { data: allowedData, error: allowedError },
    ] = await Promise.all([
        admin
            .from('student_day_progress')
            .select('student_id,day_number,recap_completed,interview_completed,scenario_completed,quiz_score,"Practice Quiz Scores"')
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

    // ── Determine how many sprints to show ───────────────────────────
    const allDayNumbers = progressRows
        .map(r => r.day_number)
        .filter((d): d is number => typeof d === 'number' && d > 0)
    const maxDay = allDayNumbers.length > 0 ? Math.max(...allDayNumbers) : 0
    const numSprints = Math.ceil(maxDay / SPRINT_SIZE)
    const totalSprintsToShow = Math.max(numSprints, TOTAL_SPRINTS)

    // ── Sprint-wise leaderboard ───────────────────────────────────────
    //
    // De-duplication: student_day_progress has a unique (student_id, day_number)
    // constraint enforced by upsert. We still de-duplicate in code to be safe —
    // for each (student_id, day_number) we keep only ONE row (the first seen, which
    // is the earliest row since we order by day_number ASC).
    //
    // Scoring per day → Recap: +10 | Interview: +10 | Scenario: +10 | Quiz: quiz_score
    // Per sprint     → sum of daily points + Practice Box first-attempt raw score (.score)
    // Max per day = 40, Max per sprint = 240 + Practice Box (max 10) = 250
    //
    // FILTER: Only show students with score > 0 (students who never accumulated any points
    //         are excluded from the public leaderboard).

    const sprintLeaderboard: Record<number, SprintEntry[]> = {}
    const currentUserStatsBySprint: Record<number, CurrentUserStats> = {}

    for (let sprint = 1; sprint <= totalSprintsToShow; sprint++) {
        const startDay = (sprint - 1) * SPRINT_SIZE + 1
        const endDay = sprint * SPRINT_SIZE
        const anchorDay = endDay // Practice box score stored on the last day of the sprint

        // Per-student sprint accumulation (keyed by auth UID)
        const studentActivityPoints = new Map<string, number>()
        const studentQuizPoints = new Map<string, number>()
        const studentPracticePoints = new Map<string, number>()
        const studentCompletedDays = new Map<string, number>()
        // De-dup guard: track (uid, day) pairs we've already processed
        const processedDays = new Set<string>()

        for (const row of progressRows) {
            if (!row.student_id || row.day_number === null) continue
            const uid = row.student_id
            const day = row.day_number

            // ── Daily points (sprint days only, first row per student+day) ──
            if (day >= startDay && day <= endDay) {
                const key = `${uid}|${day}`
                if (!processedDays.has(key)) {
                    processedDays.add(key)

                    // Activity completion points
                    let dayActivityPts = 0
                    if (row.recap_completed) dayActivityPts += RECAP_POINTS
                    if (row.interview_completed) dayActivityPts += INTERVIEW_POINTS
                    if (row.scenario_completed) dayActivityPts += SCENARIO_POINTS

                    studentActivityPoints.set(uid, (studentActivityPoints.get(uid) ?? 0) + dayActivityPts)

                    // Quiz points = correct answers stored in quiz_score
                    if (row.quiz_score !== null) {
                        studentQuizPoints.set(uid, (studentQuizPoints.get(uid) ?? 0) + row.quiz_score)
                    }

                    // Count completed days (all 4 activities done in this day)
                    const fullyDone = row.recap_completed && row.interview_completed && row.scenario_completed && row.quiz_score !== null
                    if (fullyDone) {
                        studentCompletedDays.set(uid, (studentCompletedDays.get(uid) ?? 0) + 1)
                    }
                }
            }

            // ── Practice Box: first attempt raw score on the anchor day ──
            // parsePracticeAttempts returns attempts ordered as stored; attempts[0] is first attempt
            if (day === anchorDay && !studentPracticePoints.has(uid)) {
                const attempts = parsePracticeAttempts(row['Practice Quiz Scores'])
                if (attempts.length > 0) {
                    studentPracticePoints.set(uid, attempts[0].score)
                }
            }
        }

        // Union of all student UIDs that have any data for this sprint
        const allStudentIds = new Set([
            ...studentActivityPoints.keys(),
            ...studentQuizPoints.keys(),
            ...studentPracticePoints.keys(),
        ])

        const allEntries = Array.from(allStudentIds).map((uid) => {
            const activityPoints = studentActivityPoints.get(uid) ?? 0
            const quizPoints = studentQuizPoints.get(uid) ?? 0
            const practicePoints = studentPracticePoints.get(uid) ?? 0
            const score = Math.round((activityPoints + quizPoints + practicePoints) * 10) / 10
            const completedDays = studentCompletedDays.get(uid) ?? 0
            return { uid, name: authUidToName[uid] || uid, score, activityPoints, quizPoints, practicePoints, completedDays }
        }).sort((a, b) => b.score - a.score)

        // ── Find current user's raw stats (before filtering) for the stats panel ──
        const currentUserEntry = allEntries.find(e => e.uid === currentUserId)
        const currentUserRankInAll = allEntries.findIndex(e => e.uid === currentUserId)

        // ── FILTER: only students with score > 0 appear in the public leaderboard ──
        const filteredEntries = allEntries.filter(e => e.score > 0)

        // Re-rank filtered list (sequential, no gaps)
        const rankedFiltered: SprintEntry[] = filteredEntries.map((e, i) => ({
            rank: i + 1,
            name: e.name,
            score: e.score,
            activityPoints: e.activityPoints,
            quizPoints: e.quizPoints,
            practicePoints: e.practicePoints,
            completedDays: e.completedDays,
            isCurrentUser: e.uid === currentUserId,
        }))

        sprintLeaderboard[sprint] = rankedFiltered

        // Current user's filtered rank (null if they have 0 pts and were filtered out)
        const filteredRank = rankedFiltered.findIndex(e => e.isCurrentUser)
        currentUserStatsBySprint[sprint] = {
            rank: filteredRank !== -1 ? filteredRank + 1 : null,
            name: currentUserEntry?.name ?? authUidToName[currentUserId] ?? '',
            score: currentUserEntry?.score ?? 0,
            activityPoints: currentUserEntry?.activityPoints ?? 0,
            quizPoints: currentUserEntry?.quizPoints ?? 0,
            practicePoints: currentUserEntry?.practicePoints ?? 0,
            completedDays: currentUserEntry?.completedDays ?? 0,
            // hasData = student has at least any score > 0 among all entries
            hasData: currentUserRankInAll !== -1 && (currentUserEntry?.score ?? 0) > 0,
        }
    }

    // ── Determine available sprints ──────────────────────────────────
    const availableSprints = Array.from({ length: totalSprintsToShow }, (_, i) => ({
        sprint: i + 1,
        startDay: i * SPRINT_SIZE + 1,
        endDay: (i + 1) * SPRINT_SIZE,
    }))

    return NextResponse.json({
        sprintLeaderboard,
        availableSprints,
        currentUserStatsBySprint,
    })
}

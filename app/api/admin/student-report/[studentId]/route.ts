import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

type ProfileRoleRow = {
    role: string | null
}

type AllowedEmailRow = {
    email: string
    Student_Name: string | null
    Student_id: string | null
}

type ProgressRow = {
    student_id: string | null
    day_number: number | null
    recap_completed: boolean | null
    interview_completed: boolean | null
    scenario_completed: boolean | null
    quiz_completed: boolean | null
    quiz_score: number | null
    created_at: string | null
    'Practice Quiz Scores': unknown
}

type PracticeAttempt = {
    attempt: number
    score: number
    total: number
    percentage: number
    completed_at: string
}

const getBearerToken = (request: Request): string | null => {
    const authHeader = request.headers.get('authorization') ?? ''
    if (!authHeader.toLowerCase().startsWith('bearer ')) return null
    return authHeader.slice(7).trim() || null
}

const toPercent = (val: number, total: number) =>
    total > 0 ? Number(((val / total) * 100).toFixed(1)) : 0

const SPRINT_SIZE = 6

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

export async function GET(
    request: Request,
    { params }: { params: Promise<{ studentId: string }> }
) {
    const admin = getSupabaseAdmin()
    if (!admin) {
        return NextResponse.json(
            { error: 'Server auth is not configured.' },
            { status: 500 }
        )
    }

    const token = getBearerToken(request)
    if (!token) {
        return NextResponse.json({ error: 'Missing access token.' }, { status: 401 })
    }

    // Verify caller is an admin
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) {
        return NextResponse.json(
            { error: userError?.message ?? 'Invalid session.' },
            { status: 401 }
        )
    }

    const { data: profileData, error: profileError } = await admin
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .maybeSingle()
    if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    const profile = (profileData as ProfileRoleRow | null) ?? null
    if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    const { studentId } = await params
    if (!studentId) {
        return NextResponse.json({ error: 'Student ID is required.' }, { status: 400 })
    }

    // Resolve student email from auth
    let studentEmail = studentId
    try {
        const { data: authUser } = await admin.auth.admin.getUserById(studentId)
        if (authUser?.user?.email) studentEmail = authUser.user.email
    } catch { /* fallback to ID */ }

    // Resolve student name & registered ID from allowed_emails
    let studentName = 'Unknown'
    let studentRegisteredId = ''
    const { data: allowedData } = await admin
        .from('allowed_emails')
        .select('email, Student_Name, Student_id')
        .eq('email', studentEmail.toLowerCase())
        .maybeSingle()

    if (allowedData) {
        const row = allowedData as AllowedEmailRow
        studentName = row.Student_Name ?? 'Unknown'
        studentRegisteredId = row.Student_id ?? ''
    }

    // Fetch all progress rows (now includes Practice Quiz Scores)
    const { data: progressData, error: progressError } = await admin
        .from('student_day_progress')
        .select(
            'student_id,day_number,recap_completed,interview_completed,scenario_completed,quiz_completed,quiz_score,created_at,"Practice Quiz Scores"'
        )
        .eq('student_id', studentId)
        .order('day_number', { ascending: true })

    if (progressError) {
        return NextResponse.json({ error: progressError.message }, { status: 500 })
    }

    const rows = (progressData as ProgressRow[] | null) ?? []

    // ── Aggregate day-level statistics ────────────────────────────────
    let totalQuizAttempts = 0
    let quizScoreTotal = 0
    let fullyCompletedDays = 0
    let latestDay = 0

    rows.forEach((row) => {
        const day = row.day_number ?? 0
        if (day > latestDay) latestDay = day
        if (typeof row.quiz_score === 'number') {
            totalQuizAttempts += 1
            quizScoreTotal += row.quiz_score
        }
        if (
            row.recap_completed &&
            row.interview_completed &&
            row.scenario_completed &&
            row.quiz_completed
        ) fullyCompletedDays += 1
    })

    const totalDays = rows.length
    const avgQuizScore =
        totalQuizAttempts > 0
            ? Number((quizScoreTotal / totalQuizAttempts).toFixed(2))
            : 0

    const totalRecap = rows.filter((r) => r.recap_completed).length
    const totalInterview = rows.filter((r) => r.interview_completed).length
    const totalScenario = rows.filter((r) => r.scenario_completed).length
    const totalQuiz = rows.filter((r) => r.quiz_completed).length

    // ── Build sprint-level Practice Box data ─────────────────────────
    // Sprint anchor = last day of the sprint (e.g. Day 6 for Sprint 1)
    // Practice Quiz Scores are stored on that anchor row
    const maxDay = latestDay > 0 ? latestDay : (rows[rows.length - 1]?.day_number ?? 0)
    const numSprints = maxDay > 0 ? Math.ceil(maxDay / SPRINT_SIZE) : 0

    const sprintRows: Array<{
        sprint: number
        startDay: number
        endDay: number
        attempts: PracticeAttempt[]
        firstAttemptScore: number | null
        firstAttemptTotal: number | null
        firstAttemptPct: number | null
        bestPct: number | null
        totalAttempts: number
    }> = []

    for (let sprint = 1; sprint <= numSprints; sprint++) {
        const startDay = (sprint - 1) * SPRINT_SIZE + 1
        const endDay = sprint * SPRINT_SIZE
        const anchorDay = endDay

        // Find the row for the anchor day (where Practice Quiz Scores are stored)
        const anchorRow = rows.find((r) => r.day_number === anchorDay)
        const attempts = parsePracticeAttempts(anchorRow?.['Practice Quiz Scores'])

        const firstAttempt = attempts.length > 0 ? attempts[0] : null
        const bestAttempt = attempts.length > 0
            ? attempts.reduce((best, a) => a.percentage > best.percentage ? a : best, attempts[0])
            : null

        sprintRows.push({
            sprint,
            startDay,
            endDay,
            attempts,
            firstAttemptScore: firstAttempt ? firstAttempt.score : null,
            firstAttemptTotal: firstAttempt ? firstAttempt.total : null,
            firstAttemptPct: firstAttempt ? firstAttempt.percentage : null,
            bestPct: bestAttempt ? bestAttempt.percentage : null,
            totalAttempts: attempts.length,
        })
    }

    return NextResponse.json({
        studentInfo: {
            name: studentName,
            registeredId: studentRegisteredId,
            email: studentEmail,
            authUid: studentId,
        },
        summary: {
            totalDaysStarted: totalDays,
            latestDayReached: latestDay,
            fullyCompletedDays,
            quizzesAttempted: totalQuizAttempts,
            averageQuizScore: avgQuizScore,
        },
        completionPct: {
            recap: toPercent(totalRecap, totalDays),
            interview: toPercent(totalInterview, totalDays),
            scenario: toPercent(totalScenario, totalDays),
            quiz: toPercent(totalQuiz, totalDays),
            fullDay: toPercent(fullyCompletedDays, totalDays),
        },
        dayRows: rows.map((row) => ({
            day: row.day_number,
            recapCompleted: row.recap_completed ?? false,
            interviewCompleted: row.interview_completed ?? false,
            scenarioCompleted: row.scenario_completed ?? false,
            quizCompleted: row.quiz_completed ?? false,
            quizScore: row.quiz_score,
            fullDayCompleted:
                !!(row.recap_completed &&
                    row.interview_completed &&
                    row.scenario_completed &&
                    row.quiz_completed),
            date: row.created_at ? row.created_at.slice(0, 10) : null,
        })),
        sprintRows,
        generatedAt: new Date().toISOString(),
    })
}

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

type QuestionPayload = {
    type: string
    day_number: number
    prompt: string
    options: string[] | null
    correct_answer: string | null
    difficulty: string | null
    active: boolean
}

const getBearerToken = (request: Request): string | null => {
    const authHeader = request.headers.get('authorization') ?? ''
    if (!authHeader.toLowerCase().startsWith('bearer ')) return null
    return authHeader.slice(7).trim() || null
}

export async function POST(request: Request) {
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
    if ((profileData as { role?: string } | null)?.role !== 'admin') {
        return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    const questions = (body as { questions?: unknown })?.questions
    if (!Array.isArray(questions) || questions.length === 0) {
        return NextResponse.json(
            { error: 'questions array is required.' },
            { status: 400 }
        )
    }

    const validTypes = ['interview', 'scenario', 'quiz']
    const rows: QuestionPayload[] = []

    for (let i = 0; i < questions.length; i++) {
        const q = questions[i] as Record<string, unknown>

        if (!q.prompt || typeof q.prompt !== 'string' || !q.prompt.trim()) {
            return NextResponse.json(
                { error: `Question ${i + 1}: prompt is required.` },
                { status: 400 }
            )
        }
        if (!validTypes.includes(String(q.type))) {
            return NextResponse.json(
                { error: `Question ${i + 1}: invalid type.` },
                { status: 400 }
            )
        }
        const dayNum = Number(q.day_number)
        if (!Number.isFinite(dayNum) || dayNum <= 0) {
            return NextResponse.json(
                { error: `Question ${i + 1}: valid day number is required.` },
                { status: 400 }
            )
        }
        if (q.type === 'quiz') {
            const opts = q.options as string[] | null
            if (!Array.isArray(opts) || opts.length < 2) {
                return NextResponse.json(
                    { error: `Question ${i + 1}: quiz requires at least 2 options.` },
                    { status: 400 }
                )
            }
        }

        rows.push({
            type: String(q.type),
            day_number: dayNum,
            prompt: String(q.prompt).trim(),
            options: q.type === 'quiz' ? (q.options as string[]) : null,
            correct_answer:
                typeof q.correct_answer === 'string' && q.correct_answer.trim()
                    ? q.correct_answer.trim()
                    : null,
            difficulty:
                typeof q.difficulty === 'string' && q.difficulty.trim()
                    ? q.difficulty.trim()
                    : null,
            active: Boolean(q.active ?? true),
        })
    }

    const { data, error } = await admin
        .from('questions')
        .insert(rows)
        .select('id,type,day_number,prompt,correct_answer,active')

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
        ok: true,
        saved: data?.length ?? 0,
        questions: data,
    })
}

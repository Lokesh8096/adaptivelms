import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

const getBearerToken = (request: Request): string | null => {
    const authHeader = request.headers.get('authorization') ?? ''
    if (!authHeader.toLowerCase().startsWith('bearer ')) return null
    return authHeader.slice(7).trim() || null
}

const VALID_TYPES = new Set(['interview', 'scenario', 'quiz'])

export async function POST(request: Request) {
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

    // Admin check
    const { data: profileData, error: profileError } = await admin
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .maybeSingle()
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })
    if ((profileData as { role?: string } | null)?.role !== 'admin') {
        return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    let body: unknown
    try { body = await request.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    const questions = (body as { questions?: unknown })?.questions
    if (!Array.isArray(questions) || questions.length === 0) {
        return NextResponse.json({ error: 'questions array is required.' }, { status: 400 })
    }

    const toInsert: Array<{
        type: string
        day_number: number
        prompt: string
        correct_answer: string | null
        difficulty: string | null
        active: boolean
        options: string[] | null
    }> = []

    let invalidCount = 0

    for (const raw of questions) {
        const row = raw as Record<string, unknown>

        const type = (typeof row.type === 'string' ? row.type : '').trim().toLowerCase()
        const prompt = (typeof row.prompt === 'string' ? row.prompt : '').trim()
        // Support both model_answer (CSV header) and correct_answer
        const modelAnswer = typeof row.model_answer === 'string'
            ? row.model_answer.trim()
            : typeof row.correct_answer === 'string'
                ? row.correct_answer.trim()
                : ''
        const difficultyRaw = typeof row.difficulty === 'string' ? row.difficulty.trim() : ''
        const dayNum = Number(row.day_number)
        // Parse active: accept "true"/"false" strings or booleans
        const activeRaw = row.active
        const active = activeRaw === false || activeRaw === 'false' ? false : true

        // Skip invalid rows
        if (!VALID_TYPES.has(type)) { invalidCount++; continue }
        if (!prompt) { invalidCount++; continue }
        if (!Number.isFinite(dayNum) || dayNum <= 0) { invalidCount++; continue }

        toInsert.push({
            type,
            day_number: dayNum,
            prompt,
            correct_answer: modelAnswer || null,
            difficulty: difficultyRaw || null,
            active,
            options: null, // CSV format doesn't include options column; quiz answers only
        })
    }

    if (toInsert.length === 0) {
        return NextResponse.json({
            ok: true,
            inserted: 0,
            invalid: invalidCount,
            message: `No valid questions to insert. ${invalidCount} invalid row(s) skipped.`,
        })
    }

    const { data, error: insertError } = await admin
        .from('questions')
        .insert(toInsert)
        .select('id,type,day_number,prompt,correct_answer,active')

    if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    const inserted = data?.length ?? 0
    return NextResponse.json({
        ok: true,
        inserted,
        invalid: invalidCount,
        questions: data,
        message: `${inserted} question${inserted !== 1 ? 's' : ''} uploaded successfully.${invalidCount > 0 ? ` ${invalidCount} invalid row(s) skipped.` : ''}`,
    })
}

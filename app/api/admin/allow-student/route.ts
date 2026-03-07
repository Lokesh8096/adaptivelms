import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

const normalizeEmail = (value: unknown): string =>
    typeof value === 'string' ? value.trim().toLowerCase() : ''

const isGmail = (email: string): boolean =>
    /^[^\s@]+@gmail\.com$/i.test(email)

export async function POST(request: Request) {
    const admin = getSupabaseAdmin()
    if (!admin) {
        return NextResponse.json(
            { error: 'Server auth is not configured.' },
            { status: 500 }
        )
    }

    let payload: unknown = null
    try {
        payload = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    const p = payload as {
        name?: unknown
        student_id?: unknown
        email?: unknown
    } | null

    const name = typeof p?.name === 'string' ? p.name.trim() : ''
    const studentId = typeof p?.student_id === 'string' ? p.student_id.trim() : ''
    const email = normalizeEmail(p?.email)

    // Validate name
    if (!name) {
        return NextResponse.json({ error: 'Student name is required.' }, { status: 400 })
    }

    // Validate student_id
    if (!studentId) {
        return NextResponse.json({ error: 'Student ID is required.' }, { status: 400 })
    }

    // Validate email
    if (!email) {
        return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
    }
    if (!isGmail(email)) {
        return NextResponse.json(
            { error: 'Email must be a Gmail address (@gmail.com).' },
            { status: 400 }
        )
    }

    // Check Student_id uniqueness — column name is case-sensitive in DB
    const { data: existingById, error: idCheckError } = await admin
        .from('allowed_emails')
        .select('Student_id')
        .eq('Student_id', studentId)
        .maybeSingle()

    if (idCheckError) {
        return NextResponse.json({ error: idCheckError.message }, { status: 500 })
    }
    if (existingById) {
        return NextResponse.json(
            { error: `Student ID "${studentId}" is already registered.` },
            { status: 409 }
        )
    }

    // Upsert — email is the unique conflict key; column names are case-sensitive
    const { error: upsertError } = await admin
        .from('allowed_emails')
        .upsert(
            {
                email,
                Student_Name: name,
                Student_id: studentId,
                is_used: true,
            },
            { onConflict: 'email' }
        )

    if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, message: 'Student saved successfully.' })
}

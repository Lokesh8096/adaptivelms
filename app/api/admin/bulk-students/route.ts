import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

const getBearerToken = (request: Request): string | null => {
    const authHeader = request.headers.get('authorization') ?? ''
    if (!authHeader.toLowerCase().startsWith('bearer ')) return null
    return authHeader.slice(7).trim() || null
}

const isGmail = (email: string): boolean => /^[^\s@]+@gmail\.com$/i.test(email)

type StudentCsvRow = {
    name: string
    student_id: string
    email: string
}

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

    const students = (body as { students?: unknown })?.students
    if (!Array.isArray(students) || students.length === 0) {
        return NextResponse.json({ error: 'students array is required.' }, { status: 400 })
    }

    // Fetch existing student IDs and emails to detect duplicates
    const { data: existingRows } = await admin
        .from('allowed_emails')
        .select('email, Student_id')

    const existingEmails = new Set<string>(
        (existingRows ?? []).map((r: { email: string }) => r.email.trim().toLowerCase())
    )
    const existingIds = new Set<string>(
        (existingRows ?? [])
            .map((r: { Student_id: string | null }) => r.Student_id?.trim() ?? '')
            .filter(Boolean)
    )

    const toInsert: Array<{
        email: string
        Student_Name: string
        Student_id: string
        is_used: boolean
    }> = []

    let invalidCount = 0
    let skippedCount = 0
    const skippedReasons: string[] = []

    for (const raw of students) {
        const row = raw as Record<string, unknown>
        const name = (typeof row.name === 'string' ? row.name : '').trim()
        const studentId = (typeof row.student_id === 'string' ? row.student_id : '').trim()
        const email = (typeof row.email === 'string' ? row.email : '').trim().toLowerCase()

        // Validate
        if (!name || !studentId || !email) { invalidCount++; continue }
        if (!isGmail(email)) { invalidCount++; continue }

        // Skip duplicates silently
        if (existingIds.has(studentId)) {
            skippedCount++
            skippedReasons.push(`Student ID "${studentId}" already exists`)
            continue
        }
        if (existingEmails.has(email)) {
            skippedCount++
            skippedReasons.push(`Email "${email}" already exists`)
            continue
        }

        // Track in-batch deduplication
        existingIds.add(studentId)
        existingEmails.add(email)

        toInsert.push({
            email,
            Student_Name: name,
            Student_id: studentId,
            is_used: true,
        })
    }

    if (toInsert.length === 0) {
        return NextResponse.json({
            ok: true,
            inserted: 0,
            skipped: skippedCount,
            invalid: invalidCount,
            message: `No new students to insert. ${skippedCount} duplicate(s) skipped, ${invalidCount} invalid row(s) ignored.`,
        })
    }

    const { error: insertError } = await admin
        .from('allowed_emails')
        .insert(toInsert)

    if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({
        ok: true,
        inserted: toInsert.length,
        skipped: skippedCount,
        invalid: invalidCount,
        message: `${toInsert.length} student${toInsert.length !== 1 ? 's' : ''} uploaded successfully. ${skippedCount > 0 ? `${skippedCount} duplicate(s) skipped.` : ''} ${invalidCount > 0 ? `${invalidCount} invalid row(s) ignored.` : ''}`.trim(),
    })
}

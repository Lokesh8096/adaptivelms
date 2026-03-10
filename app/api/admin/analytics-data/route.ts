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

const getBearerToken = (request: Request): string | null => {
  const authHeader = request.headers.get('authorization') ?? ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) return null
  return authHeader.slice(7).trim() || null
}

const LIST_USERS_PAGE_SIZE = 200
const LIST_USERS_MAX_PAGES = 25

const normalizeEmail = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''

export async function GET(request: Request) {
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

  const profile = (profileData as ProfileRoleRow | null) ?? null
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const [
    { data: progress, error: progressError },
    { data: questions, error: questionError },
    { data: allowedEmails, error: allowedError },
  ] = await Promise.all([
    admin
      .from('student_day_progress')
      .select(
        'student_id,day_number,recap_completed,interview_completed,scenario_completed,quiz_completed,quiz_score,recap_checked,interview_checked,scenario_checked,created_at'
      )
      .order('day_number', { ascending: true }),
    admin
      .from('questions')
      .select('day_number,type,active')
      .eq('active', true),
    admin
      .from('allowed_emails')
      .select('email,Student_Name,Student_id'),
  ])

  if (progressError) {
    return NextResponse.json({ error: progressError.message }, { status: 500 })
  }
  if (questionError) {
    return NextResponse.json({ error: questionError.message }, { status: 500 })
  }
  if (allowedError) {
    return NextResponse.json({ error: allowedError.message }, { status: 500 })
  }

  // Build email → registered student ID map from allowed_emails
  const registeredIdByEmail: Record<string, string> = {}
  const registeredNameByEmail: Record<string, string> = {}
    ; (allowedEmails as AllowedEmailRow[] | null ?? []).forEach((row) => {
      const email = normalizeEmail(row.email)
      if (email) {
        registeredIdByEmail[email] = row.Student_id ?? ''
        registeredNameByEmail[email] = row.Student_Name ?? ''
      }
    })

  // Collect all auth UIDs that appear in progress rows
  const progressRows = (progress as Array<{ student_id: string | null }> | null) ?? []
  const unresolvedIds = new Set(
    progressRows
      .map((row) => row.student_id)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
  )

  // Maps: authUid → email, authUid → registeredStudentId
  const studentEmailById: Record<string, string> = {}
  const registeredIdByAuthUid: Record<string, string> = {}

  // Paginate through auth users to resolve all IDs
  const allAuthUsers: Array<{ id: string; email?: string }> = []
  for (let page = 1; page <= LIST_USERS_MAX_PAGES; page += 1) {
    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({
      page,
      perPage: LIST_USERS_PAGE_SIZE,
    })

    if (usersError) {
      console.error('Failed to list users for email map', usersError)
      break
    }

    const users = usersData.users ?? []
    allAuthUsers.push(...users.map((u) => ({ id: u.id, email: u.email })))

    users.forEach((user) => {
      const email = normalizeEmail(user.email) || user.email || user.id
      studentEmailById[user.id] = email
      const regId = registeredIdByEmail[normalizeEmail(user.email ?? '')]
      if (regId) registeredIdByAuthUid[user.id] = regId
      unresolvedIds.delete(user.id)
    })

    if (users.length < LIST_USERS_PAGE_SIZE) break
  }

  // Build the full registered students list (auth-uid → registeredStudentId)
  // so inactive students (no progress rows) can still appear in the frontend
  const allRegisteredStudents: Array<{ authUid: string; registeredId: string; name: string; email: string }> = []
  allAuthUsers.forEach((u) => {
    const email = normalizeEmail(u.email ?? '')
    const regId = registeredIdByEmail[email]
    // Only include students that are in the allowed_emails list (skip admins/others)
    if (regId !== undefined) {
      allRegisteredStudents.push({
        authUid: u.id,
        registeredId: regId,
        name: registeredNameByEmail[email] ?? '',
        email: normalizeEmail(u.email ?? '') || u.id,
      })
    }
  })

  return NextResponse.json({
    progressRows: (progress as unknown[] | null) ?? [],
    questionRows: (questions as unknown[] | null) ?? [],
    studentEmailById,
    registeredIdByAuthUid,
    allRegisteredStudents,
  })
}

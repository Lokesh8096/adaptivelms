import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

type ProfileRoleRow = {
  role: string | null
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

  const [{ data: progress, error: progressError }, { data: questions, error: questionError }] =
    await Promise.all([
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
    ])

  if (progressError) {
    return NextResponse.json({ error: progressError.message }, { status: 500 })
  }
  if (questionError) {
    return NextResponse.json({ error: questionError.message }, { status: 500 })
  }

  const progressRows = (progress as Array<{ student_id: string | null }> | null) ?? []
  const unresolvedIds = new Set(
    progressRows
      .map((row) => row.student_id)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
  )
  const studentEmailById: Record<string, string> = {}

  if (unresolvedIds.size > 0) {
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
      users.forEach((user) => {
        if (!unresolvedIds.has(user.id)) return
        studentEmailById[user.id] = normalizeEmail(user.email) || user.email || user.id
        unresolvedIds.delete(user.id)
      })

      if (users.length < LIST_USERS_PAGE_SIZE || unresolvedIds.size === 0) {
        break
      }
    }
  }

  return NextResponse.json({
    progressRows: (progress as unknown[] | null) ?? [],
    questionRows: (questions as unknown[] | null) ?? [],
    studentEmailById,
  })
}

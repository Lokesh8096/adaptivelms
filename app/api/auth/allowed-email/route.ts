import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

const normalizeEmail = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''

type AllowedEmailRow = {
  email: string
  is_used: boolean | null
}

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

  const normalizedEmail = normalizeEmail(
    (payload as { email?: unknown } | null)?.email
  )

  if (!normalizedEmail) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('allowed_emails')
    .select('email,is_used')
    .ilike('email', normalizedEmail)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const row = (data as AllowedEmailRow | null) ?? null

  return NextResponse.json({
    allowed: Boolean(row),
    isUsed: Boolean(row?.is_used),
  })
}

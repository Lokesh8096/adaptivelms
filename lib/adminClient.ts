import { supabase } from '@/lib/supabase'

type ErrorBody = {
  error?: string
}

export const fetchAdminJson = async <T>(path: string): Promise<T> => {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) {
    throw new Error(sessionError.message)
  }

  const accessToken = sessionData.session?.access_token
  if (!accessToken) {
    throw new Error('No active session found.')
  }

  const response = await fetch(path, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  })

  const body = (await response.json().catch(() => null)) as ErrorBody | null
  if (!response.ok) {
    throw new Error(body?.error ?? 'Admin data request failed.')
  }

  return body as T
}

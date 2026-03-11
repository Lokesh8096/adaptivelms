'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAccessContext, normalizeEmail } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    let active = true

    const checkExistingSession = async () => {
      const access = await getAccessContext()
      if (!active || !access.user) return

      if (access.role === 'admin') {
        router.replace('/admin')
        return
      }

      if (!access.allowedEmail) {
        await supabase.auth.signOut()
        if (active) {
          setErrorMessage('This email is not allowed to access student dashboard.')
        }
        return
      }

      if (active) router.replace('/dashboard')
    }

    checkExistingSession()

    return () => {
      active = false
    }
  }, [router])

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)

    const normalizedEmail = normalizeEmail(email)
    if (!normalizedEmail) {
      setErrorMessage('Email is required.')
      return
    }
    if (!password) {
      setErrorMessage('Password is required.')
      return
    }

    setLoading(true)

    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

    if (signInError || !signInData.user) {
      setLoading(false)
      setErrorMessage(signInError?.message ?? 'Login failed.')
      return
    }

    const access = await getAccessContext()
    if (!access.user) {
      setLoading(false)
      setErrorMessage('Login failed.')
      return
    }

    if (access.role === 'admin') {
      setLoading(false)
      router.replace('/admin')
      return
    }

    if (!access.allowedEmail) {
      await supabase.auth.signOut()
      setLoading(false)
      setErrorMessage('This email is not allowed to access student dashboard.')
      return
    }

    setLoading(false)
    router.replace('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <form
        onSubmit={handleLogin}
        className="surface-card-strong w-full max-w-lg space-y-4 p-6 md:p-8 reveal-up"
      >
        <h1 className="text-3xl font-bold">Student Login</h1>
        <p className="text-sm muted-text">
          Login with your allowed email and password.
        </p>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
        <div style={{ position: 'relative' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            style={{ width: '100%', paddingRight: '2.5rem', boxSizing: 'border-box' }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            style={{
              position: 'absolute',
              right: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              color: '#555',
              opacity: 0.8,
            }}
          >
            {showPassword ? (
              /* Eye-off icon */
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              /* Eye icon */
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>

        {errorMessage && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="quick-btn w-full disabled:opacity-60"
          style={{ cursor: 'pointer' }}
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>

        <div className="flex flex-wrap items-center gap-2 text-sm muted-text">
          <span>New student?</span>
          <Link href="/register" className="nav-btn">
            Register
          </Link>
          <Link href="/change-password" className="nav-btn">
            Change Password
          </Link>
          <Link href="/" className="nav-btn">
            Home
          </Link>
        </div>
      </form>
    </div>
  )
}

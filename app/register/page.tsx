'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
// import PublicHeader from '@/components/public-header'
import { checkAllowedEmail, normalizeEmail } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const eyeIconStyle: React.CSSProperties = {
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
    color: 'var(--muted)',
    opacity: 0.8,
  }

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    const normalizedEmail = normalizeEmail(email)
    if (!normalizedEmail) {
      setErrorMessage('Email is required.')
      return
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setErrorMessage('Password and confirm password must match.')
      return
    }

    setLoading(true)

    const allowedCheck = await checkAllowedEmail(normalizedEmail)
    if (allowedCheck.error) {
      setLoading(false)
      setErrorMessage(allowedCheck.error)
      return
    }

    if (!allowedCheck.allowed) {
      setLoading(false)
      setErrorMessage('This email is not allowed. Contact admin.')
      return
    }

    const registerResponse = await fetch('/api/auth/student-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password }),
    })
    const registerBody = (await registerResponse.json().catch(() => null)) as
      | { error?: string }
      | null

    if (!registerResponse.ok) {
      setLoading(false)
      const fallbackError =
        registerResponse.status === 409
          ? 'This email is already registered. Please login or use Forgot Password.'
          : 'Registration failed.'
      setErrorMessage(registerBody?.error ?? fallbackError)
      return
    }

    const { data: signInData } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    if (signInData.session) {
      setLoading(false)
      router.replace('/dashboard')
      return
    }

    setLoading(false)
    setSuccessMessage('Registration completed. Please login.')
  }

  return (
    <div className="min-h-screen">
      {/* <PublicHeader /> */}

      <main className="mx-auto flex max-w-7xl items-center justify-center px-4 py-10 md:px-6 md:py-14">
        <form
          onSubmit={handleRegister}
          className="surface-card-strong w-full max-w-lg space-y-4 p-6 md:p-8"
        >
          <h1 className="text-3xl font-bold">Student Registration</h1>
          <p className="text-sm muted-text">
            Only emails in allowed list can register.
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
              className="btn-eye-toggle"
              style={eyeIconStyle}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm Password"
              required
              style={{ width: '100%', paddingRight: '2.5rem', boxSizing: 'border-box' }}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              className="btn-eye-toggle"
              style={eyeIconStyle}
            >
              {showConfirmPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
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
          {successMessage && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
              {successMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="quick-btn w-full disabled:opacity-60"
          >
            {loading ? 'Creating account...' : 'Register'}
          </button>

          <p className="text-sm muted-text">
            Already registered?{' '}
            <Link href="/login" className="text-blue-600 underline">
              Login here
            </Link>
          </p>
        </form>
      </main>
    </div>
  )
}

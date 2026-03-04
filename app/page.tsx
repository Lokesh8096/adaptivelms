'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ThemeToggle from '@/components/theme-toggle'
import { getAccessContext } from '@/lib/auth'

const footerLinks = [
  {
    label: 'Facebook',
    href: 'https://www.facebook.com/NxtWave-106729994530632/',
    viewBox: '0 0 24 24',
    path: 'M12 2.04c-5.5 0-9.96 4.46-9.96 9.96 0 4.96 3.66 9.06 8.44 9.86v-6.98H7.9v-2.88h2.58V9.41c0-2.55 1.52-3.96 3.84-3.96 1.11 0 2.27.2 2.27.2v2.5h-1.28c-1.26 0-1.65.78-1.65 1.58v1.9h2.8l-.45 2.88h-2.35v6.98c4.78-.8 8.44-4.9 8.44-9.86 0-5.5-4.46-9.96-9.96-9.96z',
  },
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/ccbp_nxtwave/',
    viewBox: '0 0 24 24',
    path: 'M12 0c-3.26 0-3.67.013-4.947.072-1.275.059-2.448.371-3.415 1.338C2.67 2.377 2.358 3.55 2.299 4.827.24 6.107.227 6.516.227 12c0 5.484.013 5.893.072 7.173.059 1.277.371 2.45 1.338 3.417.967.967 2.14 1.279 3.417 1.338 1.28.059 1.689.072 7.173.072 5.484 0 5.893-.013 7.173-.072 1.277-.059 2.45-.371 3.417-1.338.967-.967 1.279-2.14 1.338-3.417.059-1.28.072-1.689.072-7.173 0-5.484-.013-5.893-.072-7.173-.059-1.277-.371-2.45-1.338-3.417C19.398.443 18.225.131 16.948.072 15.668.013 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z',
  },
  {
    label: 'Twitter (X)',
    href: 'https://twitter.com/nxtwave_tech',
    viewBox: '0 0 24 24',
    path: 'M18.244 2.25h3.308l-7.227 8.26 8.51 11.24h-6.66l-5.215-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23z',
  },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/nxtwavetech',
    viewBox: '0 0 24 24',
    path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.369-1.85 3.6 0 4.266 2.368 4.266 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zm-1.777 13.019H7.11V9H3.56v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.727v20.545C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.273V1.727C24 .774 23.2 0 22.222 0h.003z',
  },
  {
    label: 'YouTube',
    href: 'https://www.youtube.com/c/NxtWaveTech',
    viewBox: '0 0 24 24',
    path: 'M23.498 6.186a3.02 3.02 0 0 0-2.122-2.136C19.505 3.5 12 3.5 12 3.5s-7.505 0-9.377.55A3.02 3.02 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.02 3.02 0 0 0 2.121 2.136C4.495 20.5 12 20.5 12 20.5s7.505 0 9.377-.55a3.02 3.02 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.75 15.02V8.98L15.5 12l-5.75 3.02z',
  },
  {
    label: 'Support Email',
    href: 'mailto:support-intensive@nxtwave.tech',
    viewBox: '0 0 24 24',
    path: 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z',
  },
]

export default function HomePage() {
  const router = useRouter()
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    let active = true

    const redirectLoggedInUsers = async () => {
      try {
        const access = await getAccessContext()
        if (!active) return

        if (!access.user) {
          setCheckingSession(false)
          return
        }

        if (access.role === 'admin') {
          router.replace('/admin')
          return
        }

        if (access.allowedEmail) {
          router.replace('/dashboard')
          return
        }

        setCheckingSession(false)
      } catch (error) {
        console.error('Failed to verify home access', error)
        if (active) setCheckingSession(false)
      }
    }

    redirectLoggedInUsers()
    return () => {
      active = false
    }
  }, [router])

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="muted-text">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-[var(--home-text)] bg-[linear-gradient(135deg,var(--home-bg-start),var(--home-bg-mid),var(--home-bg-end))]">
      <header className="border-b border-[color:var(--home-border)] px-6 py-4 backdrop-blur-lg md:px-8">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-wide">Adaptive LMS</h1>


          <ThemeToggle />
        </div>
      </header>

      <section className="flex min-h-[85vh] items-center justify-center px-6 text-center">
        <div className="max-w-3xl">
          <p className="mb-4 text-sm uppercase tracking-widest text-[var(--home-label)]">
            Build Job-Ready Skills
          </p>

          <h2 className="mb-6 text-4xl font-bold leading-tight md:text-5xl">
            Designed to transform you into a{' '}
            <span className="text-[var(--home-highlight)]">highly skilled software professional</span>
          </h2>

          <p className="mb-10 text-lg text-[var(--home-muted)]">
            Learn day by day, and track your
            progress with a clean dashboard.
          </p>

          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/register"
              className="rounded-xl bg-[var(--home-primary)] px-6 py-3 font-medium shadow-lg shadow-indigo-500/20 transition hover:bg-[var(--home-primary-hover)]"
            >
              Student Register
            </Link>

            <Link
              href="/login"
              className="rounded-xl bg-[var(--home-glass)] px-6 py-3 font-medium text-[var(--home-text)] transition hover:bg-[var(--home-glass-hover)]"
            >
              Student Login
            </Link>

            <Link
              href="/dashboard"
              className="rounded-xl bg-[var(--home-success)] px-6 py-3 font-medium shadow-lg shadow-emerald-500/20 transition hover:bg-[var(--home-success-hover)]"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[color:var(--home-border)]">
        <div className="mx-auto max-w-7xl px-6 py-6 md:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--home-text)]">Connect with NxtWave</p>
              <p className="mt-1 text-xs text-[var(--home-muted)]">
                Follow our official channels or reach support quickly.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-start gap-3 sm:justify-end">
              {footerLinks.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  target={item.href.startsWith('http') ? '_blank' : undefined}
                  rel={item.href.startsWith('http') ? 'noreferrer' : undefined}
                  aria-label={item.label}
                  title={item.label}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--home-border)] bg-[var(--home-glass)] text-[var(--home-text)] transition hover:border-[var(--home-highlight)] hover:text-[var(--home-highlight)]"
                >
                  <svg
                    viewBox={item.viewBox}
                    className="h-5 w-5"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d={item.path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-1 text-xs text-[var(--home-muted)] sm:flex-row sm:items-center sm:justify-between ">
            <a href="mailto:support-intensive@nxtwave.tech" >
              Support Email:<strong> support-intensive@nxtwave.tech</strong>
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { ReactNode, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import ThemeToggle from '@/components/theme-toggle'
import { getAccessContext } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

const adminLinks = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/students', label: 'Students' },
  { href: '/admin/export', label: 'Export' },
]

export default function AdminLayout({
  children,
}: {
  children: ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [checkingAccess, setCheckingAccess] = useState(true)
  const [guardError, setGuardError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const checkAdminAccess = async () => {
      try {
        const access = await getAccessContext()

        if (!access.user) {
          if (active) router.replace('/login')
          return
        }

        if (access.role !== 'admin') {
          if (active) router.replace('/dashboard')
          return
        }

        if (active) {
          setGuardError(null)
          setCheckingAccess(false)
        }
      } catch (error) {
        console.error('Failed to validate admin access', error)
        if (active) {
          setGuardError('Unable to verify admin access. Please try again.')
          setCheckingAccess(false)
        }
      }
    }

    checkAdminAccess()
    return () => {
      active = false
    }
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  if (checkingAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="muted-text">Checking admin access...</p>
      </div>
    )
  }

  if (guardError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="surface-card max-w-md p-4 text-sm text-red-700">
          {guardError}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--bg-soft)]">
        <div className="mx-auto max-w-7xl px-4 py-5 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-5">
              <Link href="/admin" className="text-lg font-extrabold tracking-wide">
                Admin LMS
              </Link>
              <nav className="hidden items-center gap-2 md:flex">
                {adminLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`nav-btn ${
                      pathname === link.href ? 'active' : ''
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button onClick={handleLogout} className="quick-btn secondary text-sm">
                Logout
              </button>
            </div>
          </div>

          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 md:hidden">
            {adminLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`nav-btn ${
                  pathname === link.href ? 'active' : ''
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="top-announcement">
          <div className="mx-auto max-w-7xl px-4 py-2 text-sm md:px-6">
            Admin Dashboard: manage access, monitor progress, and export analytics.
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">{children}</main>
    </div>
  )
}

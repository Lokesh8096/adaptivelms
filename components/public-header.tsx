'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/theme-toggle'
import { getAccessContext } from '@/lib/auth'

export default function PublicHeader() {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let active = true

    const loadRole = async () => {
      const access = await getAccessContext()
      if (!active) return
      setIsAdmin(access.role === 'admin')
    }

    loadRole()
    return () => {
      active = false
    }
  }, [])

  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg-soft)]">
      <div className="mx-auto max-w-7xl px-4 py-5 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="text-xl font-extrabold tracking-wide">
            Adaptive LMS
          </Link>

          <nav className="flex flex-wrap items-center gap-2 text-sm md:text-base">
            <Link href="/" className="nav-btn active">
              Home
            </Link>
            <Link href="/register" className="nav-btn">
              Programs
            </Link>
            <Link href="/dashboard" className="nav-btn">
              Learning
            </Link>
            {isAdmin && (
              <Link href="/admin" className="nav-btn">
                Admin
              </Link>
            )}
            <Link href="/login" className="nav-btn">
              Login
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </div>

      <div className="top-announcement">
        <div className="mx-auto max-w-7xl px-4 py-2 text-sm md:px-6 md:text-base">
          New: Build job-ready skills with guided day-wise learning and instant analytics.
        </div>
      </div>
    </header>
  )
}

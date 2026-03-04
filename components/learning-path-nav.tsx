'use client'

import Link from 'next/link'
import { useState } from 'react'

type SectionKey = 'recap' | 'interview' | 'scenario' | 'quiz'

type ProgressState = {
  recapCompleted: boolean
  interviewCompleted: boolean
  scenarioCompleted: boolean
  quizCompleted: boolean
}

type LearningPathNavProps = {
  dayNumber: number
  currentSection: SectionKey | null
  progress: ProgressState
}

const sectionMeta: Array<{ key: SectionKey; label: string; hrefSuffix: string }> = [
  { key: 'recap', label: 'Recap', hrefSuffix: '/recap' },
  { key: 'interview', label: 'Interview', hrefSuffix: '/interview' },
  { key: 'scenario', label: 'Scenario', hrefSuffix: '/scenario' },
  { key: 'quiz', label: 'Quiz', hrefSuffix: '/quiz' },
]

const getIsLocked = (key: SectionKey, progress: ProgressState): boolean => {
  if (key === 'recap') return false
  if (key === 'interview') return !progress.recapCompleted
  if (key === 'scenario') return !progress.interviewCompleted
  return !progress.scenarioCompleted
}

const getIsCompleted = (key: SectionKey, progress: ProgressState): boolean => {
  if (key === 'recap') return progress.recapCompleted
  if (key === 'interview') return progress.interviewCompleted
  if (key === 'scenario') return progress.scenarioCompleted
  return progress.quizCompleted
}

const getStatusLabel = (
  isLocked: boolean,
  isCompleted: boolean,
  isCurrent: boolean
): string => {
  if (isCurrent) return 'Current'
  if (isCompleted) return 'Done'
  if (isLocked) return 'Locked'
  return 'Next'
}

export default function LearningPathNav({
  dayNumber,
  currentSection,
  progress,
}: LearningPathNavProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {open && (
        <section className="surface-card path-panel p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide muted-text">
              Day {dayNumber} Sections
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="nav-btn"
            >
              Hide
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {sectionMeta.map((section) => {
              const isLocked = getIsLocked(section.key, progress)
              const isCompleted = getIsCompleted(section.key, progress)
              const isCurrent = currentSection === section.key
              const statusLabel = getStatusLabel(isLocked, isCompleted, isCurrent)
              const href = `/dashboard/day/${dayNumber}${section.hrefSuffix}`

              return (
                <Link
                  key={section.key}
                  href={href}
                  className={`interactive-card rounded-xl p-3 ${
                    isLocked ? 'pointer-events-none opacity-45' : ''
                  } ${isCurrent ? 'ring-2 ring-[var(--primary)]' : ''} ${
                    isCompleted ? 'bg-green-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{section.label}</p>
                    <span className="text-xs font-semibold muted-text">{statusLabel}</span>
                  </div>
                </Link>
              )
            })}
          </div>

          <Link
            href={`/dashboard/day/${dayNumber}`}
            className="mt-3 inline-block text-xs nav-link"
          >
            Open Day Overview
          </Link>
        </section>
      )}

      <div className="path-fab">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="quick-btn secondary"
        >
          {open ? 'Close Sections' : `Day ${dayNumber} Sections`}
        </button>
      </div>
    </>
  )
}

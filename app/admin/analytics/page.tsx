'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  buildDayAnalytics,
  buildInsights,
  buildOverview,
  buildSprintAnalytics,
  toPercent,
  type AdminProgressRow,
  type AdminQuestionRow,
  type DayAnalyticsRow,
  type InsightItem,
  type SprintAnalyticsRow,
} from '@/lib/adminAnalytics'
import { fetchAdminJson } from '@/lib/adminClient'

type AnalyticsApiResponse = {
  progressRows: AdminProgressRow[]
  questionRows: AdminQuestionRow[]
  studentEmailById: Record<string, string>
}

/* ─── Tiny reusable components ────────────────────────────────────── */

function MiniBar({ pct, color = '#6366f1', h = 7 }: { pct: number; color?: string; h?: number }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 99, height: h, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 99, transition: 'width .5s ease' }} />
    </div>
  )
}

function StatCard({ label, value, sub, accent = '#6366f1' }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="surface-card p-4" style={{ borderTop: `3px solid ${accent}` }}>
      <p style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>{label}</p>
      <p style={{ fontSize: '2rem', fontWeight: 800, color: accent, lineHeight: 1.1, marginTop: '0.25rem' }}>{value}</p>
      {sub && <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.25rem' }}>{sub}</p>}
    </div>
  )
}

function DayCard({ day }: { day: DayAnalyticsRow }) {
  const pct = day.fullCompletionPct
  const color = pct >= 70 ? '#059669' : pct >= 40 ? '#d97706' : '#6366f1'
  return (
    <div className="surface-card p-3 space-y-2" style={{ minWidth: 120, flex: '1 0 120px', borderRadius: '0.75rem' }}>
      <div style={{ fontWeight: 700, fontSize: '0.78rem' }}>Day {day.dayNumber}</div>
      <div style={{ fontSize: '0.68rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--muted)' }}>Students</span>
          <span style={{ fontWeight: 600 }}>{day.studentsStarted}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--muted)' }}>Completed</span>
          <span style={{ fontWeight: 700, color }}>{pct}%</span>
        </div>
        <MiniBar pct={pct} color={color} h={5} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.15rem' }}>
          <span style={{ color: 'var(--muted)' }}>Avg Quiz</span>
          <span style={{ fontWeight: 600 }}>{day.averageQuizScore || '–'}</span>
        </div>
      </div>
    </div>
  )
}

function SprintCard({ sprint }: { sprint: SprintAnalyticsRow }) {
  const [open, setOpen] = useState(true)
  const pct = sprint.completionPct
  const color = pct >= 70 ? '#059669' : pct >= 40 ? '#d97706' : '#6366f1'

  // Average section pcts across days in this sprint
  const sectionPcts = useMemo(() => {
    const total = sprint.dayRows.reduce((s, d) => s + d.studentsStarted, 0)
    const sum = (key: 'recapDone' | 'interviewDone' | 'scenarioDone' | 'quizDone') =>
      sprint.dayRows.reduce((s, d) => s + d[key], 0)
    return {
      recap: toPercent(sum('recapDone'), total),
      interview: toPercent(sum('interviewDone'), total),
      scenario: toPercent(sum('scenarioDone'), total),
      quiz: toPercent(sum('quizDone'), total),
    }
  }, [sprint])

  return (
    <div className="surface-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: open ? '1px solid var(--border)' : 'none' }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ padding: '0.2rem 0.7rem', borderRadius: 99, background: color, color: '#fff', fontSize: '0.72rem', fontWeight: 700 }}>
              Sprint {sprint.sprintNumber}
            </span>
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Days {sprint.startDay}–{sprint.endDay}</span>
          </div>
          <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.45rem', flexWrap: 'wrap' }}>
            {[
              ['Started', sprint.studentsStarted],
              ['Completed', sprint.studentsCompleted],
              ['Completion', `${sprint.completionPct}%`],
              ['Avg Quiz', sprint.averageQuizScore || '–'],
              ['Quiz Attempts', sprint.totalQuizAttempts],
            ].map(([k, v]) => (
              <span key={k as string} style={{ fontSize: '0.72rem' }}>
                <span style={{ color: 'var(--muted)' }}>{k}: </span>
                <span style={{ fontWeight: 700, color: k === 'Completion' ? color : undefined }}>{v as string | number}</span>
              </span>
            ))}
          </div>
        </div>
        <span style={{ color: 'var(--muted)', fontSize: '0.9rem', flexShrink: 0, marginLeft: '0.5rem' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '1rem 1.25rem' }}>
          {/* Sprint progress bar */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              <span style={{ color: 'var(--muted)' }}>Sprint Completion</span>
              <span style={{ color }}>{pct}%</span>
            </div>
            <MiniBar pct={pct} color={color} h={9} />
          </div>

          {/* Section breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.6rem', marginBottom: '1rem' }}>
            {(['Recap', 'Interview', 'Scenario', 'Quiz'] as const).map((sec) => {
              const key = sec.toLowerCase() as keyof typeof sectionPcts
              const v = sectionPcts[key]
              const c = v >= 70 ? '#059669' : v >= 40 ? '#d97706' : '#6366f1'
              return (
                <div key={sec} style={{ fontSize: '0.7rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontWeight: 600 }}>
                    <span style={{ color: 'var(--muted)' }}>{sec}</span>
                    <span style={{ color: c }}>{v}%</span>
                  </div>
                  <MiniBar pct={v} color={c} h={5} />
                </div>
              )
            })}
          </div>

          {/* Day mini-cards */}
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            {sprint.dayRows.map((day) => <DayCard key={day.dayNumber} day={day} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function InsightBadge({ item }: { item: InsightItem }) {
  const map = {
    warning: { bg: 'rgba(245,158,11,0.09)', border: '#f59e0b', icon: '⚠️' },
    success: { bg: 'rgba(5,150,105,0.09)', border: '#059669', icon: '✅' },
    info: { bg: 'rgba(99,102,241,0.09)', border: '#6366f1', icon: 'ℹ️' },
  }
  const c = map[item.type]
  return (
    <div style={{ background: c.bg, borderLeft: `3px solid ${c.border}`, borderRadius: '0.5rem', padding: '0.6rem 1rem', fontSize: '0.82rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
      <span>{c.icon}</span>
      <span>{item.message}</span>
    </div>
  )
}

/* ─── Main page ────────────────────────────────────────────────────── */

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [progressRows, setProgressRows] = useState<AdminProgressRow[]>([])
  const [questionRows, setQuestionRows] = useState<AdminQuestionRow[]>([])

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setErrorMessage(null)
      try {
        const data = await fetchAdminJson<AnalyticsApiResponse>('/api/admin/analytics-data')
        if (!active) return
        setProgressRows(data.progressRows ?? [])
        setQuestionRows(data.questionRows ?? [])
      } catch (err) {
        if (!active) return
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load analytics.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [])

  const overview = useMemo(() => buildOverview(progressRows), [progressRows])
  const byDay = useMemo(() => buildDayAnalytics(progressRows, questionRows), [progressRows, questionRows])
  const sprints = useMemo(() => buildSprintAnalytics(progressRows, byDay), [progressRows, byDay])
  const insights = useMemo(() => buildInsights(byDay), [byDay])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '2rem', color: 'var(--muted)' }}>
      <span style={{ display: 'inline-block', width: '1.2rem', height: '1.2rem', border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      Loading analytics…
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (errorMessage) return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3">{errorMessage}</div>
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="surface-card p-5 md:p-6">
        <h1 className="text-2xl font-bold md:text-3xl">Analytics Dashboard</h1>
        <p className="mt-2 text-sm muted-text">
          Real-time LMS performance · Sprint-wise progress · Day-level insights
        </p>
      </div>

      {/* ── Global Stats ────────────────────────────── */}
      <section>
        <SectionLabel>Global Overview</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: '0.75rem' }}>
          <StatCard label="Total Students" value={overview.totalStudents} sub="unique learners" accent="#6366f1" />
          <StatCard label="Active Today" value={overview.activeStudentsToday} sub="based on activity" accent="#0ea5e9" />
          <StatCard label="Avg Completion" value={`${overview.avgCompletionRate}%`} sub="per-student average" accent="#059669" />
          <StatCard label="Avg Quiz Score" value={overview.averageQuizScore} sub="across all quizzes" accent="#f59e0b" />
          <StatCard label="Quiz Attempts" value={overview.totalQuizAttempts} sub="total submissions" accent="#8b5cf6" />
        </div>
      </section>

      {/* ── Sprint Analytics ─────────────────────────── */}
      <section>
        <SectionLabel>Sprint Analytics — {sprints.length} Sprint{sprints.length !== 1 ? 's' : ''} Active (6 days each)</SectionLabel>
        <div className="space-y-4">
          {sprints.length === 0
            ? <p className="muted-text text-sm surface-card p-4">No sprint data yet. Add student progress to see sprint stats.</p>
            : sprints.map((s) => <SprintCard key={s.sprintNumber} sprint={s} />)
          }
        </div>
      </section>

      {/* ── Day Activity Chart ───────────────────────── */}
      {byDay.length > 0 && (
        <section className="surface-card p-5">
          <SectionLabel>Day Activity — Full Completion % by Day</SectionLabel>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', minHeight: '130px', overflowX: 'auto', paddingBottom: '0.5rem' }}>
            {byDay.map((day) => {
              const pct = day.fullCompletionPct
              const h = Math.max(10, (pct / 100) * 120)
              const color = pct >= 70 ? '#059669' : pct >= 40 ? '#d97706' : '#6366f1'
              return (
                <div key={day.dayNumber} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: '1 0 32px', minWidth: 32 }}
                  title={`Day ${day.dayNumber}: ${pct}% (${day.studentsStarted} students started)`}>
                  <span style={{ fontSize: '0.58rem', fontWeight: 700, color }}>{pct}%</span>
                  <div style={{ width: '100%', height: `${h}px`, background: `linear-gradient(180deg,${color}cc,${color})`, borderRadius: '4px 4px 0 0', transition: 'height .4s ease' }} />
                  <span style={{ fontSize: '0.6rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>D{day.dayNumber}</span>
                </div>
              )
            })}
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
            🟣 &lt;40% &nbsp; 🟡 40–70% &nbsp; 🟢 ≥70% completion
          </p>
        </section>
      )}

      {/* ── Progress Distribution ────────────────────── */}
      {overview.totalStudents > 0 && (
        <section className="surface-card p-5">
          <SectionLabel>Progress Distribution</SectionLabel>
          <ProgressDistribution progressRows={progressRows} totalStudents={overview.totalStudents} />
        </section>
      )}

      {/* ── Insights ─────────────────────────────────── */}
      <section>
        <SectionLabel>Insights &amp; Alerts</SectionLabel>
        {insights.length === 0
          ? <p className="muted-text text-sm surface-card p-4">No notable insights yet — keep going! 🎉</p>
          : <div className="space-y-2">{insights.map((item, i) => <InsightBadge key={i} item={item} />)}</div>
        }
      </section>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

/* ─── Helper sub-components ────────────────────────────────────────── */

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: '0.65rem' }}>
      {children}
    </h2>
  )
}

function ProgressDistribution({ progressRows, totalStudents }: { progressRows: AdminProgressRow[]; totalStudents: number }) {
  const stats = useMemo(() => {
    const byStudent = new Map<string, { total: number; done: number }>()
    progressRows.forEach((row) => {
      if (!row.student_id) return
      const s = byStudent.get(row.student_id) ?? { total: 0, done: 0 }
      s.total += 1
      if (row.recap_completed && row.interview_completed && row.scenario_completed && row.quiz_completed) s.done += 1
      byStudent.set(row.student_id, s)
    })
    let allComplete = 0, inProgress = 0
    byStudent.forEach(({ total, done }) => {
      if (done === total && total > 0) allComplete++
      else inProgress++
    })
    return { allComplete, inProgress, notStarted: Math.max(0, totalStudents - byStudent.size) }
  }, [progressRows, totalStudents])

  const total = stats.allComplete + stats.inProgress + stats.notStarted || 1
  const bars = [
    { label: 'Fully Completed', count: stats.allComplete, color: '#059669' },
    { label: 'In Progress', count: stats.inProgress, color: '#f59e0b' },
    { label: 'Not Started', count: stats.notStarted, color: '#e5e7eb' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', height: '28px', borderRadius: '8px', overflow: 'hidden', marginBottom: '0.75rem' }}>
        {bars.map((b) => (
          <div key={b.label} style={{ width: `${(b.count / total) * 100}%`, background: b.color, transition: 'width .5s ease', minWidth: b.count > 0 ? 4 : 0 }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
        {bars.map((b) => (
          <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: b.color, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: 'var(--muted)' }}>{b.label}:</span>
            <span style={{ fontWeight: 700 }}>{b.count}</span>
            <span style={{ color: 'var(--muted)' }}>({toPercent(b.count, total)}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

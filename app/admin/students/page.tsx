'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildStudentAnalytics, type AdminProgressRow } from '@/lib/adminAnalytics'
import { fetchAdminJson } from '@/lib/adminClient'
import { supabase } from '@/lib/supabase'

// ── API response types ───────────────────────────────────────────────
type RegisteredStudent = {
  authUid: string
  registeredId: string
  name: string
  email: string
}

type AnalyticsApiResponse = {
  progressRows: AdminProgressRow[]
  studentEmailById: Record<string, string>
  registeredIdByAuthUid: Record<string, string>
  allRegisteredStudents: RegisteredStudent[]
}

// ── Report types ─────────────────────────────────────────────────────
type DayRow = {
  day: number | null
  recapCompleted: boolean
  interviewCompleted: boolean
  scenarioCompleted: boolean
  quizCompleted: boolean
  quizScore: number | null
  fullDayCompleted: boolean
  date: string | null
}

type SprintRow = {
  sprint: number
  startDay: number
  endDay: number
  firstAttemptScore: number | null
  firstAttemptTotal: number | null
  firstAttemptPct: number | null
  bestPct: number | null
  totalAttempts: number
}

type ReportData = {
  studentInfo: {
    name: string
    registeredId: string
    email: string
    authUid: string
  }
  summary: {
    totalDaysStarted: number
    latestDayReached: number
    fullyCompletedDays: number
    quizzesAttempted: number
    averageQuizScore: number
  }
  completionPct: {
    recap: number
    interview: number
    scenario: number
    quiz: number
    fullDay: number
  }
  dayRows: DayRow[]
  sprintRows?: SprintRow[]
  generatedAt: string
}

// ── Merged student row for the table ─────────────────────────────────
type StudentTableRow = {
  authUid: string
  registeredId: string
  name: string
  email: string
  daysStarted: number
  latestDay: number
  recapPct: number
  interviewPct: number
  scenarioPct: number
  quizPct: number
  fullCompletionPct: number
  fullyCompletedDays: number
  averageQuizScore: number
}

// ── Column filter state ───────────────────────────────────────────────
type ColFilters = {
  daysStarted: string
  latestDay: string
  fullyCompletedDays: string
  recapPct: string
  interviewPct: string
  scenarioPct: string
  quizPct: string
}

const DEFAULT_COL_FILTERS: ColFilters = {
  daysStarted: '',
  latestDay: '',
  fullyCompletedDays: '',
  recapPct: '',
  interviewPct: '',
  scenarioPct: '',
  quizPct: '',
}

const PCT_OPTIONS = ['', '25', '50', '75', '100']

// -- PDF HTML builder -----------------------------------------------------
function buildPdfHtml(data: ReportData): string {
  const { studentInfo, summary, completionPct, dayRows, generatedAt } = data
  const generatedDate = new Date(generatedAt).toLocaleString()
  const yesCell = (val: boolean) =>
    val ? `<td class="yes">YES</td>` : `<td class="no">NO</td>`

  const dayRowsHtml = dayRows
    .map(
      (row) => `
      <tr>
        <td>Day ${row.day ?? '-'}</td>
        ${yesCell(row.recapCompleted)}
        ${yesCell(row.interviewCompleted)}
        ${yesCell(row.scenarioCompleted)}
        ${yesCell(row.quizCompleted)}
        <td>${row.quizScore !== null && row.quizScore !== undefined ? row.quizScore : '-'}</td>
        ${yesCell(row.fullDayCompleted)}
        <td>${row.date ?? '-'}</td>
      </tr>`
    )
    .join('')

  const quizRows = dayRows
    .filter((r) => r.quizScore !== null && r.quizScore !== undefined)
    .map(
      (r) => `
      <tr>
        <td>Day ${r.day ?? '-'}</td>
        <td>${r.quizScore}</td>
        <td>
          <div class="bar-wrap">
            <div class="bar" style="width:${Math.min(100, (r.quizScore! / 10) * 100)}%"></div>
          </div>
        </td>
      </tr>`
    )
    .join('')

  const sprintRows = data.sprintRows ?? []
  const sprintRowsHtml = sprintRows.map((s) => {
    const hasData = s.totalAttempts > 0
    const pct = s.firstAttemptPct ?? 0
    const barWidth = Math.min(100, pct)
    const badgeClass = !hasData ? 'badge-grey' : pct >= 70 ? 'badge-green' : 'badge-red'
    const badgeLabel = !hasData ? 'Not Attempted' : pct >= 70 ? 'Pass' : 'Below Pass'
    return `<tr>
      <td><strong>Sprint ${s.sprint}</strong></td>
      <td>Day ${s.startDay} - Day ${s.endDay}</td>
      <td>${hasData && s.firstAttemptScore !== null && s.firstAttemptTotal !== null
        ? `${s.firstAttemptScore}/${s.firstAttemptTotal}`
        : '<span class="na">-</span>'}</td>
      <td>${hasData && s.firstAttemptPct !== null ? `${s.firstAttemptPct}%` : '<span class="na">-</span>'}</td>
      <td>${hasData && s.bestPct !== null ? `${s.bestPct}%` : '<span class="na">-</span>'}</td>
      <td style="text-align:center">${s.totalAttempts}</td>
      <td>
        ${hasData
        ? `<div style="display:flex;align-items:center;gap:6px">
               <div class="bar-wrap" style="flex:1"><div class="bar sprint-bar" style="width:${barWidth}%"></div></div>
               <span style="font-size:10px;font-weight:700;color:#7c3aed;min-width:30px;text-align:right">${pct}%</span>
             </div>
             <span class="badge ${badgeClass}">${badgeLabel}</span>`
        : '<span class="na">-</span>'}
      </td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Student Report - ${studentInfo.name || studentInfo.registeredId}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #1a1a2e; font-size: 13px; line-height: 1.5; }
    .cover { background: linear-gradient(135deg,#4f46e5 0%,#7c3aed 60%,#a855f7 100%); color:#fff; padding:36px 40px 28px; border-radius:0 0 12px 12px; }
    .cover h1 { font-size:24px; font-weight:800; letter-spacing:-0.5px; }
    .cover .subtitle { opacity:.85; margin-top:4px; font-size:12px; }
    .cover .meta { margin-top:20px; display:flex; gap:32px; flex-wrap:wrap; }
    .cover .meta-item label { font-size:10px; opacity:.7; display:block; text-transform:uppercase; letter-spacing:.5px; }
    .cover .meta-item span { font-size:14px; font-weight:600; }
    .content { padding:28px 40px; }
    .section-title { font-size:13px; font-weight:700; color:#4f46e5; text-transform:uppercase; letter-spacing:.8px; border-left:3px solid #4f46e5; padding-left:10px; margin:28px 0 14px; }
    .section-title.purple { color:#7c3aed; border-left-color:#7c3aed; }
    .stat-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
    .stat-card { border:1px solid #e5e7eb; border-radius:8px; padding:14px 16px; background:#f9fafb; }
    .stat-card .label { font-size:10px; color:#6b7280; text-transform:uppercase; letter-spacing:.5px; }
    .stat-card .value { font-size:22px; font-weight:800; color:#4f46e5; margin-top:4px; }
    .completion-grid { display:flex; flex-direction:column; gap:10px; }
    .completion-row { display:flex; align-items:center; gap:12px; }
    .completion-row .ck-label { width:100px; font-size:11px; color:#374151; font-weight:600; flex-shrink:0; }
    .completion-row .track { flex:1; height:10px; background:#e5e7eb; border-radius:99px; overflow:hidden; }
    .completion-row .fill { height:100%; border-radius:99px; background:linear-gradient(90deg,#4f46e5,#7c3aed); }
    .completion-row .pct { width:44px; text-align:right; font-size:11px; font-weight:700; color:#4f46e5; }
    table { width:100%; border-collapse:collapse; font-size:12px; }
    thead tr { background:#4f46e5; color:#fff; }
    thead tr.sprint-head { background:linear-gradient(135deg,#7c3aed,#a855f7); }
    thead th { padding:8px 10px; text-align:left; font-weight:600; font-size:11px; }
    tbody tr:nth-child(even) { background:#f5f3ff; }
    tbody td { padding:7px 10px; border-bottom:1px solid #e5e7eb; color:#374151; }
    td.yes { color:#059669; font-weight:700; text-align:center; }
    td.no  { color:#dc2626; font-weight:700; text-align:center; }
    span.na { color:#9ca3af; font-style:italic; }
    .bar-wrap { background:#e5e7eb; border-radius:99px; height:8px; width:100%; overflow:hidden; }
    .bar { height:100%; border-radius:99px; background:linear-gradient(90deg,#4f46e5,#7c3aed); }
    .sprint-bar { background:linear-gradient(90deg,#7c3aed,#a855f7); }
    .badge { display:inline-block; padding:2px 8px; border-radius:99px; font-size:10px; font-weight:700; margin-top:3px; }
    .badge-green { background:#d1fae5; color:#065f46; }
    .badge-red { background:#fee2e2; color:#991b1b; }
    .badge-grey { background:#f3f4f6; color:#6b7280; }
    .footer { margin-top:36px; padding-top:14px; border-top:1px solid #e5e7eb; font-size:10px; color:#9ca3af; text-align:center; }
    @media print {
      body, .cover, thead tr, thead tr.sprint-head { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .stat-card { break-inside:avoid; }
      tr { page-break-inside:avoid; }
    }
  </style>
</head>
<body>
  <div class="cover">
    <h1>Student Progress Report</h1>
    <p class="subtitle">Adaptive LMS - Admin Generated Report</p>
    <div class="meta">
      <div class="meta-item"><label>Student Name</label><span>${studentInfo.name || '-'}</span></div>
      <div class="meta-item"><label>Student ID</label><span>${studentInfo.registeredId || '-'}</span></div>
      <div class="meta-item"><label>Email</label><span>${studentInfo.email}</span></div>
      <div class="meta-item"><label>Report Generated</label><span>${generatedDate}</span></div>
    </div>
  </div>
  <div class="content">
    <div class="section-title">Summary Statistics</div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Days Started</div><div class="value">${summary.totalDaysStarted}</div></div>
      <div class="stat-card"><div class="label">Latest Day Reached</div><div class="value">${summary.latestDayReached}</div></div>
      <div class="stat-card"><div class="label">Quizzes Attempted</div><div class="value">${summary.quizzesAttempted}</div></div>
      <div class="stat-card"><div class="label">Avg Quiz Score</div><div class="value">${summary.averageQuizScore}</div></div>
      <div class="stat-card"><div class="label">Fully Completed Days</div><div class="value">${summary.fullyCompletedDays}</div></div>
      <div class="stat-card"><div class="label">Full Day Completion</div><div class="value">${completionPct.fullDay}%</div></div>
    </div>
    <div class="section-title">Completion Percentages</div>
    <div class="completion-grid">
      ${[
      { label: 'Recap', pct: completionPct.recap },
      { label: 'Interview', pct: completionPct.interview },
      { label: 'Scenario', pct: completionPct.scenario },
      { label: 'Quiz', pct: completionPct.quiz },
      { label: 'Full Day', pct: completionPct.fullDay },
    ].map((item) => `
        <div class="completion-row">
          <span class="ck-label">${item.label}</span>
          <div class="track"><div class="fill" style="width:${item.pct}%"></div></div>
          <span class="pct">${item.pct}%</span>
        </div>`).join('')}
    </div>
    <div class="section-title">Day-wise Progress</div>
    <table>
      <thead><tr><th>Day</th><th>Recap</th><th>Interview</th><th>Scenario</th><th>Quiz</th><th>Quiz Score</th><th>Full Day</th><th>Date</th></tr></thead>
      <tbody>${dayRowsHtml || '<tr><td colspan="8" style="text-align:center;color:#9ca3af;padding:16px">No progress data available.</td></tr>'}</tbody>
    </table>
    ${quizRows ? `
    <div class="section-title">Quiz Score Trend</div>
    <table>
      <thead><tr><th style="width:80px">Day</th><th style="width:80px">Score</th><th>Progress Bar</th></tr></thead>
      <tbody>${quizRows}</tbody>
    </table>` : ''}
    ${sprintRows.length > 0 ? `
    <div class="section-title purple">Practice Box Scores (Sprint-wise)</div>
    <table>
      <thead>
        <tr class="sprint-head">
          <th>Sprint</th>
          <th>Days Covered</th>
          <th>1st Attempt Score</th>
          <th>1st Attempt %</th>
          <th>Best %</th>
          <th>Total Attempts</th>
          <th>Progress</th>
        </tr>
      </thead>
      <tbody>${sprintRowsHtml}</tbody>
    </table>` : ''}
    <div class="footer">Generated by Adaptive LMS Admin Dashboard - ${generatedDate} - Confidential</div>
  </div>
</body>
</html>`
}

// ── CSV for a single student ─────────────────────────────────────────
function buildCsvContent(data: ReportData): string {
  const { studentInfo, summary, completionPct, dayRows } = data
  const sprintRows = data.sprintRows ?? []
  const esc = (v: string | number | boolean | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows: string[][] = []
  rows.push(['Student Report – Adaptive LMS'])
  rows.push([])
  rows.push(['STUDENT INFORMATION'])
  rows.push(['Student ID', esc(studentInfo.registeredId || '—')])
  rows.push(['Student Name', esc(studentInfo.name)])
  rows.push(['Email', esc(studentInfo.email)])
  rows.push([])
  rows.push(['SUMMARY STATISTICS'])
  rows.push(['Days Started', String(summary.totalDaysStarted)])
  rows.push(['Latest Day Reached', String(summary.latestDayReached)])
  rows.push(['Fully Completed Days', String(summary.fullyCompletedDays)])
  rows.push(['Quizzes Attempted', String(summary.quizzesAttempted)])
  rows.push(['Average Quiz Score', String(summary.averageQuizScore)])
  rows.push([])
  rows.push(['COMPLETION PERCENTAGES'])
  rows.push(['Recap %', `${completionPct.recap}%`])
  rows.push(['Interview %', `${completionPct.interview}%`])
  rows.push(['Scenario %', `${completionPct.scenario}%`])
  rows.push(['Quiz %', `${completionPct.quiz}%`])
  rows.push(['Full Day %', `${completionPct.fullDay}%`])
  rows.push([])
  rows.push(['DAY-WISE PROGRESS'])
  rows.push(['Day', 'Recap', 'Interview', 'Scenario', 'Quiz', 'Quiz Score', 'Full Day Completed', 'Date'])
  dayRows.forEach((row) => {
    rows.push([
      row.day !== null ? `Day ${row.day}` : '-',
      row.recapCompleted ? 'Yes' : 'No',
      row.interviewCompleted ? 'Yes' : 'No',
      row.scenarioCompleted ? 'Yes' : 'No',
      row.quizCompleted ? 'Yes' : 'No',
      row.quizScore !== null && row.quizScore !== undefined ? String(row.quizScore) : '-',
      row.fullDayCompleted ? 'Yes' : 'No',
      row.date ?? '-',
    ])
  })
  const quizRows = dayRows.filter((r) => r.quizScore !== null)
  if (quizRows.length > 0) {
    rows.push([])
    rows.push(['QUIZ SCORE TREND'])
    rows.push(['Day', 'Score'])
    quizRows.forEach((r) => rows.push([`Day ${r.day ?? '-'}`, String(r.quizScore)]))
  }
  // Practice Box scores per sprint
  if (sprintRows.length > 0) {
    rows.push([])
    rows.push(['PRACTICE BOX SCORES (SPRINT-WISE)'])
    rows.push([
      'Sprint',
      'Days Covered',
      '1st Attempt Score',
      '1st Attempt Total',
      '1st Attempt %',
      'Best %',
      'Total Attempts',
      'Status',
    ])
    sprintRows.forEach((s) => {
      const hasData = s.totalAttempts > 0
      const status = !hasData
        ? 'Not Attempted'
        : (s.firstAttemptPct ?? 0) >= 70 ? 'Pass' : 'Below Pass'
      rows.push([
        `Sprint ${s.sprint}`,
        `Day ${s.startDay} - Day ${s.endDay}`,
        hasData && s.firstAttemptScore !== null ? String(s.firstAttemptScore) : '-',
        hasData && s.firstAttemptTotal !== null ? String(s.firstAttemptTotal) : '-',
        hasData && s.firstAttemptPct !== null ? `${s.firstAttemptPct}%` : '-',
        hasData && s.bestPct !== null ? `${s.bestPct}%` : '-',
        String(s.totalAttempts),
        status,
      ])
    })
  }
  return rows.map((r) => r.join(',')).join('\r\n')
}

// ── All students CSV ─────────────────────────────────────────────────
function buildAllStudentsCsv(students: StudentTableRow[]): string {
  const header = [
    'Student ID',
    'Student Name',
    'Days Started',
    'Latest Day',
    'Recap %',
    'Interview %',
    'Scenario %',
    'Quiz %',
    'Full Day %',
    'Fully Completed Days',
    'Avg Quiz Score',
  ]
  const rows = students.map((s) => [
    s.registeredId || s.authUid,
    s.name,
    String(s.daysStarted),
    String(s.latestDay),
    `${s.recapPct}%`,
    `${s.interviewPct}%`,
    `${s.scenarioPct}%`,
    `${s.quizPct}%`,
    `${s.fullCompletionPct}%`,
    String(s.fullyCompletedDays),
    String(s.averageQuizScore),
  ])
  return [header, ...rows].map((r) => r.join(',')).join('\r\n')
}

// ── Trigger a client-side download ──────────────────────────────────
function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Column filter dropdown ───────────────────────────────────────────
function ColFilterDropdown({
  id,
  value,
  onChange,
  options,
  placeholder,
  isNumericInput,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  options?: string[]
  placeholder: string
  isNumericInput?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const syncTheme = () => setIsDarkMode(root.classList.contains('dark'))
    syncTheme()
    const observer = new MutationObserver(syncTheme)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const isActive = value !== ''

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', marginLeft: '4px' }}>
      <button
        id={id}
        onClick={() => setOpen((o) => !o)}
        title="Filter this column"
        style={{
          background: isDarkMode
            ? (isActive ? 'rgba(79,70,229,0.18)' : 'rgba(255,255,255,0.12)')
            : (isActive ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.92)'),
          border: isDarkMode
            ? (isActive ? '1px solid rgba(79,70,229,0.5)' : '1px solid rgba(255,255,255,0.25)')
            : (isActive ? '1px solid rgba(124,58,237,0.45)' : '1px solid #cbd5e1'),
          color: isDarkMode
            ? (isActive ? '#c7d2fe' : 'rgba(255,255,255,0.75)')
            : (isActive ? '#4f46e5' : '#3f5f7f'),
          borderRadius: '4px',
          padding: '1px 4px',
          cursor: 'pointer',
          lineHeight: 1,
          fontSize: '11px',
          transition: 'all 0.15s',
          verticalAlign: 'middle',
        }}
      >
        {isActive ? '▾●' : '▾'}
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: '4px',
          background: isDarkMode ? 'var(--surface, #1e1e2e)' : '#ffffff',
          border: isDarkMode ? '1.5px solid var(--border, #e5e7eb)' : '1.5px solid #cbd5e1',
          borderRadius: '8px',
          boxShadow: isDarkMode ? '0 8px 24px rgba(0,0,0,0.25)' : '0 10px 30px rgba(15,47,79,0.16)',
          color: isDarkMode ? 'inherit' : '#1f3b5b',
          zIndex: 999,
          minWidth: '150px',
          overflow: 'hidden',
        }}>
          {isNumericInput ? (
            <div style={{ padding: '8px' }}>
              <input
                type="number"
                autoFocus
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: '12px',
                  borderRadius: '5px',
                  border: isDarkMode ? '1.5px solid var(--border, #e5e7eb)' : '1.5px solid #dbe2ea',
                  background: isDarkMode ? 'var(--bg-soft, #f9fafb)' : '#f8fafc',
                  color: isDarkMode ? 'inherit' : '#1f3b5b',
                  outline: 'none',
                }}
              />
              {value && (
                <button
                  onClick={() => { onChange(''); setOpen(false) }}
                  style={{
                    marginTop: '6px',
                    width: '100%',
                    padding: '4px',
                    fontSize: '11px',
                    background: 'rgba(239,68,68,0.12)',
                    color: '#ef4444',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          ) : (
            <div>
              {(options ?? []).map((opt) => (
                <button
                  key={opt}
                  onClick={() => { onChange(opt); setOpen(false) }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    fontSize: '12px',
                    background: value === opt
                      ? (isDarkMode ? 'rgba(79,70,229,0.15)' : 'rgba(124,58,237,0.12)')
                      : 'transparent',
                    color: value === opt ? (isDarkMode ? '#818cf8' : '#4f46e5') : (isDarkMode ? 'inherit' : '#1f3b5b'),
                    fontWeight: value === opt ? 700 : 400,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isDarkMode && value !== opt) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgba(124,58,237,0.08)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isDarkMode && value !== opt) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                    }
                  }}
                >
                  {opt === '' ? 'All' : `${opt}%`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────
export default function StudentsPage() {
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [rows, setRows] = useState<AdminProgressRow[]>([])
  const [allRegisteredStudents, setAllRegisteredStudents] = useState<RegisteredStudent[]>([])
  const [registeredIdByAuthUid, setRegisteredIdByAuthUid] = useState<Record<string, string>>({})
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null)
  const [downloadingCsvId, setDownloadingCsvId] = useState<string | null>(null)
  const [downloadingAllCsv, setDownloadingAllCsv] = useState(false)
  const [downloadingAllPdf, setDownloadingAllPdf] = useState(false)
  const [colFilters, setColFilters] = useState<ColFilters>(DEFAULT_COL_FILTERS)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setErrorMessage(null)
      try {
        const data = await fetchAdminJson<AnalyticsApiResponse>('/api/admin/analytics-data')
        if (!active) return
        setRows(data.progressRows ?? [])
        setAllRegisteredStudents(data.allRegisteredStudents ?? [])
        setRegisteredIdByAuthUid(data.registeredIdByAuthUid ?? {})
      } catch (error) {
        if (!active) return
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load student analytics.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [])

  // Build analytics for students who have progress
  const analyticsMap = useMemo(() => {
    const summaries = buildStudentAnalytics(rows)
    const map = new Map<string, (typeof summaries)[number]>()
    summaries.forEach((s) => map.set(s.studentId, s))
    return map
  }, [rows])

  // Merge: all registered students + their analytics (or zeros if inactive)
  const allStudents: StudentTableRow[] = useMemo(() => {
    return allRegisteredStudents.map((reg) => {
      const analytics = analyticsMap.get(reg.authUid)
      if (analytics) {
        return {
          authUid: reg.authUid,
          registeredId: reg.registeredId || registeredIdByAuthUid[reg.authUid] || reg.authUid,
          name: reg.name,
          email: reg.email,
          daysStarted: analytics.daysStarted,
          latestDay: analytics.latestDay,
          recapPct: analytics.recapPct,
          interviewPct: analytics.interviewPct,
          scenarioPct: analytics.scenarioPct,
          quizPct: analytics.quizPct,
          fullCompletionPct: analytics.fullCompletionPct,
          fullyCompletedDays: analytics.fullyCompletedDays,
          averageQuizScore: analytics.averageQuizScore,
        }
      }
      // Inactive student — all zeros
      return {
        authUid: reg.authUid,
        registeredId: reg.registeredId || registeredIdByAuthUid[reg.authUid] || reg.authUid,
        name: reg.name,
        email: reg.email,
        daysStarted: 0,
        latestDay: 0,
        recapPct: 0,
        interviewPct: 0,
        scenarioPct: 0,
        quizPct: 0,
        fullCompletionPct: 0,
        fullyCompletedDays: 0,
        averageQuizScore: 0,
      }
    })
  }, [allRegisteredStudents, analyticsMap, registeredIdByAuthUid])

  // Column filter application
  const filteredStudents = useMemo(() => {
    return allStudents.filter((s) => {
      if (colFilters.daysStarted !== '' && s.daysStarted !== Number(colFilters.daysStarted)) return false
      if (colFilters.latestDay !== '' && s.latestDay !== Number(colFilters.latestDay)) return false
      if (colFilters.fullyCompletedDays !== '' && s.fullyCompletedDays !== Number(colFilters.fullyCompletedDays)) return false
      if (colFilters.recapPct !== '' && s.recapPct !== Number(colFilters.recapPct)) return false
      if (colFilters.interviewPct !== '' && s.interviewPct !== Number(colFilters.interviewPct)) return false
      if (colFilters.scenarioPct !== '' && s.scenarioPct !== Number(colFilters.scenarioPct)) return false
      if (colFilters.quizPct !== '' && s.quizPct !== Number(colFilters.quizPct)) return false
      return true
    })
  }, [allStudents, colFilters])

  const isFiltersActive = useMemo(
    () => Object.values(colFilters).some((v) => v !== ''),
    [colFilters]
  )

  const setColFilter = (key: keyof ColFilters, val: string) =>
    setColFilters((prev) => ({ ...prev, [key]: val }))

  const resetFilters = () => setColFilters(DEFAULT_COL_FILTERS)

  // ── Fetch report data (used by both PDF and CSV per student) ──────
  const fetchReportData = useCallback(async (authUid: string): Promise<ReportData | null> => {
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (!accessToken) { alert('Session expired. Please log in again.'); return null }

    const response = await fetch(
      `/api/admin/student-report/${encodeURIComponent(authUid)}`,
      { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      alert(body.error ?? 'Failed to generate report.')
      return null
    }
    return response.json() as Promise<ReportData>
  }, [])

  // ── Per-student PDF ───────────────────────────────────────────────
  const handleDownloadPdf = useCallback(async (student: StudentTableRow) => {
    setDownloadingPdfId(student.authUid)
    try {
      const data = await fetchReportData(student.authUid)
      if (!data) return
      const html = buildPdfHtml(data)
      const iframe = document.createElement('iframe')
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;visibility:hidden'
      document.body.appendChild(iframe)
      const doc = iframe.contentDocument ?? iframe.contentWindow?.document
      if (!doc) { alert('Could not open print window.'); document.body.removeChild(iframe); return }
      doc.open(); doc.write(html); doc.close()
      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
          setTimeout(() => document.body.removeChild(iframe), 2000)
        }, 400)
      }
    } catch (err) {
      console.error('PDF error', err)
      alert('An error occurred while generating the PDF.')
    } finally {
      setDownloadingPdfId(null)
    }
  }, [fetchReportData])

  // ── Per-student CSV ───────────────────────────────────────────────
  const handleDownloadCsv = useCallback(async (student: StudentTableRow) => {
    setDownloadingCsvId(student.authUid)
    try {
      const data = await fetchReportData(student.authUid)
      if (!data) return
      const fileId = student.registeredId || student.authUid
      downloadBlob(buildCsvContent(data), `student_report_${fileId}.csv`, 'text/csv')
    } catch (err) {
      console.error('CSV error', err)
      alert('An error occurred while generating the CSV.')
    } finally {
      setDownloadingCsvId(null)
    }
  }, [fetchReportData])

  // ── All students CSV ──────────────────────────────────────────────
  const handleDownloadAllCsv = useCallback(() => {
    setDownloadingAllCsv(true)
    try {
      downloadBlob(buildAllStudentsCsv(allStudents), 'all_students_analytics.csv', 'text/csv')
    } finally {
      setDownloadingAllCsv(false)
    }
  }, [allStudents])

  // ── All students PDF (print-friendly table) ───────────────────────
  const handleDownloadAllPdf = useCallback(() => {
    setDownloadingAllPdf(true)
    const generatedDate = new Date().toLocaleString()
    const rowsHtml = allStudents.map((s) => `
      <tr>
        <td>${s.registeredId || s.authUid}</td>
        <td>${s.name || '—'}</td>
        <td>${s.daysStarted}</td>
        <td>${s.latestDay}</td>
        <td>${s.recapPct}%</td>
        <td>${s.interviewPct}%</td>
        <td>${s.scenarioPct}%</td>
        <td>${s.quizPct}%</td>
        <td>${s.fullCompletionPct}%</td>
        <td>${s.fullyCompletedDays}</td>
        <td>${s.averageQuizScore}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>All Students Analytics Report</title>
  <style>
    *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'Segoe UI',Arial,sans-serif; background:#fff; color:#1a1a2e; font-size:11px; line-height:1.4; }
    .cover { background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 60%,#a855f7 100%); color:#fff; padding:28px 32px 22px; }
    .cover h1 { font-size:20px; font-weight:800; }
    .cover .sub { opacity:.85; margin-top:4px; font-size:11px; }
    .cover .meta { margin-top:12px; font-size:11px; opacity:.8; }
    .content { padding:20px 32px; }
    table { width:100%; border-collapse:collapse; font-size:10px; }
    thead tr { background:#4f46e5; color:#fff; }
    thead th { padding:7px 8px; text-align:left; font-weight:600; font-size:9px; white-space:nowrap; }
    tbody tr:nth-child(even) { background:#f5f3ff; }
    tbody td { padding:6px 8px; border-bottom:1px solid #e5e7eb; color:#374151; }
    .footer { margin-top:24px; padding-top:10px; border-top:1px solid #e5e7eb; font-size:9px; color:#9ca3af; text-align:center; }
    @media print {
      body, .cover, thead tr { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      tr { page-break-inside:avoid; }
    }
  </style>
</head>
<body>
  <div class="cover">
    <h1>📊 All Students Analytics Report</h1>
    <p class="sub">Adaptive LMS · Admin Generated Report</p>
    <p class="meta">Generated: ${generatedDate} &nbsp;·&nbsp; Total Students: ${allStudents.length}</p>
  </div>
  <div class="content">
    <table>
      <thead>
        <tr>
          <th>Student ID</th>
          <th>Name</th>
          <th>Days Started</th>
          <th>Latest Day</th>
          <th>Recap %</th>
          <th>Interview %</th>
          <th>Scenario %</th>
          <th>Quiz %</th>
          <th>Full Day %</th>
          <th>Completed Days</th>
          <th>Avg Quiz Score</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="footer">Adaptive LMS Admin Dashboard &nbsp;·&nbsp; ${generatedDate} &nbsp;·&nbsp; Confidential</div>
  </div>
</body>
</html>`

    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;visibility:hidden'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document
    if (!doc) { setDownloadingAllPdf(false); return }
    doc.open(); doc.write(html); doc.close()
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
        setTimeout(() => { document.body.removeChild(iframe); setDownloadingAllPdf(false) }, 2000)
      }, 400)
    }
  }, [allStudents])

  // ── Render guard ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '2rem', color: 'var(--muted)' }}>
        <span style={{
          display: 'inline-block', width: '1.25rem', height: '1.25rem',
          border: '2px solid currentColor', borderTopColor: 'transparent',
          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
        }} />
        Loading students...
      </div>
    )
  }

  if (errorMessage) {
    return <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3">{errorMessage}</div>
  }

  const anyBusy = downloadingPdfId !== null || downloadingCsvId !== null

  // ── Column header helper ──────────────────────────────────────────
  const Th = ({ children }: { children: React.ReactNode }) => (
    <th className="p-3 text-left font-semibold" style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
      {children}
    </th>
  )

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="surface-card p-5 md:p-6">
        <h1 className="text-2xl font-bold md:text-3xl">Student Analytics</h1>
        <p className="mt-2 text-sm muted-text">
          All registered students · progress, completion trends, and report downloads.
        </p>
      </div>

      {/* Global download buttons */}
      <div className="surface-card p-4" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 600, opacity: 0.65, marginRight: '0.25rem' }}>
          Export all students:
        </span>

        {/* Download All CSV */}
        <button
          id="download-all-csv"
          onClick={handleDownloadAllCsv}
          disabled={downloadingAllCsv || allStudents.length === 0}
          style={globalBtnStyle('#059669', '#047857', '0 1px 4px rgba(5,150,105,0.3)', downloadingAllCsv)}
        >
          {downloadingAllCsv ? <Spinner /> : <DownloadIcon />}
          Download All Students (CSV)
        </button>

        {/* Download All PDF */}
        <button
          id="download-all-pdf"
          onClick={handleDownloadAllPdf}
          disabled={downloadingAllPdf || allStudents.length === 0}
          style={globalBtnStyle('#4f46e5', '#3730a3', '0 1px 4px rgba(79,70,229,0.3)', downloadingAllPdf)}
        >
          {downloadingAllPdf ? <Spinner /> : <PdfIcon />}
          Download All Students (PDF)
        </button>

        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', opacity: 0.55 }}>
          {allStudents.length} total students
        </span>
      </div>

      {/* Filter status bar */}
      {isFiltersActive && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
          <span style={{ fontSize: '0.78rem', color: '#818cf8', fontWeight: 600 }}>
            ● Showing {filteredStudents.length} of {allStudents.length} students
          </span>
          <button
            id="reset-col-filters"
            onClick={resetFilters}
            style={{
              padding: '0.3rem 0.75rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              border: '1.5px solid #ef4444',
              borderRadius: '6px',
              background: 'transparent',
              color: '#ef4444',
              cursor: 'pointer',
            }}
          >
            ✕ Reset Filters
          </button>
        </div>
      )}

      {/* Table */}
      <div className="surface-card overflow-auto">
        <table className="w-full text-sm" style={{ minWidth: '1080px' }}>
          <thead style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
            <tr style={{ color: '#fff' }}>
              <Th>Student ID</Th>
              <Th>
                Days Started
                <ColFilterDropdown
                  id="col-filter-days-started"
                  value={colFilters.daysStarted}
                  onChange={(v) => setColFilter('daysStarted', v)}
                  placeholder="e.g. 5"
                  isNumericInput
                />
              </Th>
              <Th>
                Latest Day
                <ColFilterDropdown
                  id="col-filter-latest-day"
                  value={colFilters.latestDay}
                  onChange={(v) => setColFilter('latestDay', v)}
                  placeholder="e.g. 7"
                  isNumericInput
                />
              </Th>
              <Th>
                Recap %
                <ColFilterDropdown
                  id="col-filter-recap"
                  value={colFilters.recapPct}
                  onChange={(v) => setColFilter('recapPct', v)}
                  placeholder="Select"
                  options={PCT_OPTIONS}
                />
              </Th>
              <Th>
                Interview %
                <ColFilterDropdown
                  id="col-filter-interview"
                  value={colFilters.interviewPct}
                  onChange={(v) => setColFilter('interviewPct', v)}
                  placeholder="Select"
                  options={PCT_OPTIONS}
                />
              </Th>
              <Th>
                Scenario %
                <ColFilterDropdown
                  id="col-filter-scenario"
                  value={colFilters.scenarioPct}
                  onChange={(v) => setColFilter('scenarioPct', v)}
                  placeholder="Select"
                  options={PCT_OPTIONS}
                />
              </Th>
              <Th>
                Quiz %
                <ColFilterDropdown
                  id="col-filter-quiz"
                  value={colFilters.quizPct}
                  onChange={(v) => setColFilter('quizPct', v)}
                  placeholder="Select"
                  options={PCT_OPTIONS}
                />
              </Th>
              <Th>Full Day %</Th>
              <Th>
                Fully Completed Days
                <ColFilterDropdown
                  id="col-filter-fully-completed"
                  value={colFilters.fullyCompletedDays}
                  onChange={(v) => setColFilter('fullyCompletedDays', v)}
                  placeholder="e.g. 3"
                  isNumericInput
                />
              </Th>
              <Th>Avg Quiz Score</Th>
              <Th>Download Report</Th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length === 0 && (
              <tr>
                <td colSpan={11} className="p-6 text-center muted-text" style={{ fontStyle: 'italic' }}>
                  {allStudents.length === 0
                    ? 'No registered students found.'
                    : 'No students match the current filters.'}
                </td>
              </tr>
            )}
            {filteredStudents.map((student) => {
              const isPdfBusy = downloadingPdfId === student.authUid
              const isCsvBusy = downloadingCsvId === student.authUid
              const isInactive = student.daysStarted === 0

              return (
                <tr
                  key={student.authUid}
                  className="border-t"
                  style={{ transition: 'background 0.15s', opacity: isInactive ? 0.72 : 1 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-soft)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}
                >
                  <td className="p-3" style={{ fontWeight: 600 }}>
                    <div style={{ fontSize: '0.82rem' }}>{student.registeredId || student.authUid}</div>
                    {student.name && (
                      <div style={{ fontSize: '0.72rem', opacity: 0.55, marginTop: '1px' }}>{student.name}</div>
                    )}
                  </td>
                  <td className="p-3">{student.daysStarted}</td>
                  <td className="p-3">{student.latestDay}</td>
                  <td className="p-3"><PctBadge val={student.recapPct} /></td>
                  <td className="p-3"><PctBadge val={student.interviewPct} /></td>
                  <td className="p-3"><PctBadge val={student.scenarioPct} /></td>
                  <td className="p-3"><PctBadge val={student.quizPct} /></td>
                  <td className="p-3"><PctBadge val={student.fullCompletionPct} /></td>
                  <td className="p-3">{student.fullyCompletedDays}</td>
                  <td className="p-3">{student.averageQuizScore}</td>
                  <td className="p-3">
                    {isInactive ? (
                      <span style={{ fontSize: '0.72rem', opacity: 0.45, fontStyle: 'italic' }}>Not started</span>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'nowrap' }}>
                        <ActionBtn
                          id={`pdf-${student.authUid}`}
                          busy={isPdfBusy}
                          disabled={anyBusy}
                          color="#dc2626"
                          shadow="rgba(220,38,38,0.3)"
                          onClick={() => handleDownloadPdf(student)}
                          title={`PDF report for ${student.registeredId}`}
                          icon={<PdfIcon />}
                          label="PDF"
                        />
                        <ActionBtn
                          id={`csv-${student.authUid}`}
                          busy={isCsvBusy}
                          disabled={anyBusy}
                          color="#059669"
                          shadow="rgba(5,150,105,0.3)"
                          onClick={() => handleDownloadCsv(student)}
                          title={`CSV report for ${student.registeredId}`}
                          icon={<DownloadIcon />}
                          label="CSV"
                        />
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Tiny helpers ─────────────────────────────────────────────────────

function PctBadge({ val }: { val: number }) {
  const color = val === 0 ? '#9ca3af' : val >= 75 ? '#059669' : val >= 40 ? '#d97706' : '#dc2626'
  return <span style={{ fontWeight: 600, color }}>{val}%</span>
}

function Spinner() {
  return (
    <span style={{
      display: 'inline-block', width: '0.65rem', height: '0.65rem',
      border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff',
      borderRadius: '50%', animation: 'spin 0.7s linear infinite',
    }} />
  )
}

function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function PdfIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  )
}

function globalBtnStyle(c1: string, c2: string, shadow: string, busy: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.45rem 1rem', fontSize: '0.8rem', fontWeight: 600,
    borderRadius: '0.5rem', border: 'none',
    cursor: busy ? 'wait' : 'pointer',
    background: busy ? `${c1}88` : `linear-gradient(135deg,${c1},${c2})`,
    color: '#fff', boxShadow: shadow, whiteSpace: 'nowrap',
    transition: 'opacity 0.2s',
    opacity: busy ? 0.7 : 1,
  }
}

function ActionBtn({
  id, busy, disabled, color, shadow, onClick, title, icon, label,
}: {
  id: string
  busy: boolean
  disabled: boolean
  color: string
  shadow: string
  onClick: () => void
  title: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      id={id}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.28rem',
        padding: '0.32rem 0.6rem', fontSize: '0.72rem', fontWeight: 600,
        borderRadius: '0.45rem', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: busy ? `${color}66` : `linear-gradient(135deg,${color},${color}cc)`,
        color: '#fff',
        opacity: disabled && !busy ? 0.5 : 1,
        transition: 'opacity 0.2s, transform 0.12s',
        whiteSpace: 'nowrap',
        boxShadow: shadow,
      }}
      onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = '' }}
    >
      {busy ? <Spinner /> : icon}
      {busy ? 'Generating…' : label}
    </button>
  )
}

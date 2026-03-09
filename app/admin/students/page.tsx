'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildStudentAnalytics, type AdminProgressRow } from '@/lib/adminAnalytics'
import { fetchAdminJson } from '@/lib/adminClient'
import { supabase } from '@/lib/supabase'

type AnalyticsApiResponse = {
  progressRows: AdminProgressRow[]
  studentEmailById: Record<string, string>
}

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
  generatedAt: string
}

const getStudentLabel = (
  studentId: string,
  studentEmailById: Record<string, string>
): string => studentEmailById[studentId] ?? studentId

function buildPdfHtml(data: ReportData): string {
  const { studentInfo, summary, completionPct, dayRows, generatedAt } = data
  const generatedDate = new Date(generatedAt).toLocaleString()

  const yesCell = (val: boolean) =>
    val
      ? `<td class="yes">✓</td>`
      : `<td class="no">✗</td>`

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

  const quizTrendRows = dayRows
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Student Report – ${studentInfo.name}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: #fff;
      color: #1a1a2e;
      font-size: 13px;
      line-height: 1.5;
    }

    /* ── Cover banner ── */
    .cover {
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 60%, #a855f7 100%);
      color: #fff;
      padding: 36px 40px 28px;
      border-radius: 0 0 12px 12px;
      page-break-after: avoid;
    }
    .cover h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
    .cover .subtitle { opacity: 0.85; margin-top: 4px; font-size: 12px; }
    .cover .meta { margin-top: 20px; display: flex; gap: 32px; flex-wrap: wrap; }
    .cover .meta-item label { font-size: 10px; opacity: 0.7; display: block; text-transform: uppercase; letter-spacing: 0.5px; }
    .cover .meta-item span { font-size: 14px; font-weight: 600; }

    /* ── Body content ── */
    .content { padding: 28px 40px; }

    /* ── Section headers ── */
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: #4f46e5;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      border-left: 3px solid #4f46e5;
      padding-left: 10px;
      margin: 28px 0 14px;
    }

    /* ── Stat grid ── */
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .stat-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 14px 16px;
      background: #f9fafb;
    }
    .stat-card .label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-card .value { font-size: 22px; font-weight: 800; color: #4f46e5; margin-top: 4px; }

    /* ── Completion bars ── */
    .completion-grid { display: flex; flex-direction: column; gap: 10px; }
    .completion-row { display: flex; align-items: center; gap: 12px; }
    .completion-row .ck-label { width: 100px; font-size: 11px; color: #374151; font-weight: 600; flex-shrink: 0; }
    .completion-row .track {
      flex: 1;
      height: 10px;
      background: #e5e7eb;
      border-radius: 99px;
      overflow: hidden;
    }
    .completion-row .fill {
      height: 100%;
      border-radius: 99px;
      background: linear-gradient(90deg, #4f46e5, #7c3aed);
    }
    .completion-row .pct { width: 44px; text-align: right; font-size: 11px; font-weight: 700; color: #4f46e5; }

    /* ── Tables ── */
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    thead tr { background: #4f46e5; color: #fff; }
    thead th { padding: 8px 10px; text-align: left; font-weight: 600; font-size: 11px; }
    tbody tr:nth-child(even) { background: #f5f3ff; }
    tbody td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; color: #374151; }
    td.yes { color: #059669; font-weight: 700; text-align: center; }
    td.no  { color: #dc2626; font-weight: 700; text-align: center; }

    /* ── Quiz trend table bar ── */
    .bar-wrap { background: #e5e7eb; border-radius: 99px; height: 8px; width: 100%; overflow: hidden; }
    .bar { height: 100%; border-radius: 99px; background: linear-gradient(90deg,#4f46e5,#7c3aed); }

    /* ── Footer ── */
    .footer {
      margin-top: 36px;
      padding-top: 14px;
      border-top: 1px solid #e5e7eb;
      font-size: 10px;
      color: #9ca3af;
      text-align: center;
    }

    /* ── Print overrides ── */
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .cover { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      thead tr { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .stat-card { break-inside: avoid; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>

  <!-- Cover -->
  <div class="cover">
    <h1>📊 Student Progress Report</h1>
    <p class="subtitle">Adaptive LMS · Admin Generated Report</p>
    <div class="meta">
      <div class="meta-item">
        <label>Student Name</label>
        <span>${studentInfo.name}</span>
      </div>
      <div class="meta-item">
        <label>Student ID</label>
        <span>${studentInfo.registeredId || '—'}</span>
      </div>
      <div class="meta-item">
        <label>Email</label>
        <span>${studentInfo.email}</span>
      </div>
      <div class="meta-item">
        <label>Report Generated</label>
        <span>${generatedDate}</span>
      </div>
    </div>
  </div>

  <div class="content">

    <!-- Summary Stats -->
    <div class="section-title">Summary Statistics</div>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="label">Days Started</div>
        <div class="value">${summary.totalDaysStarted}</div>
      </div>
      <div class="stat-card">
        <div class="label">Latest Day Reached</div>
        <div class="value">${summary.latestDayReached}</div>
      </div>
      <div class="stat-card">
        <div class="label">Quizzes Attempted</div>
        <div class="value">${summary.quizzesAttempted}</div>
      </div>
      <div class="stat-card">
        <div class="label">Avg Quiz Score</div>
        <div class="value">${summary.averageQuizScore}</div>
      </div>
      <div class="stat-card">
        <div class="label">Fully Completed Days</div>
        <div class="value">${summary.fullyCompletedDays}</div>
      </div>
      <div class="stat-card">
        <div class="label">Full Day Completion</div>
        <div class="value">${completionPct.fullDay}%</div>
      </div>
    </div>

    <!-- Completion Percentages -->
    <div class="section-title">Completion Percentages</div>
    <div class="completion-grid">
      ${[
      { label: 'Recap', pct: completionPct.recap },
      { label: 'Interview', pct: completionPct.interview },
      { label: 'Scenario', pct: completionPct.scenario },
      { label: 'Quiz', pct: completionPct.quiz },
      { label: 'Full Day', pct: completionPct.fullDay },
    ]
      .map(
        (item) => `
          <div class="completion-row">
            <span class="ck-label">${item.label}</span>
            <div class="track"><div class="fill" style="width:${item.pct}%"></div></div>
            <span class="pct">${item.pct}%</span>
          </div>`
      )
      .join('')}
    </div>

    <!-- Day-wise Progress -->
    <div class="section-title">Day-wise Progress</div>
    <table>
      <thead>
        <tr>
          <th>Day</th>
          <th>Recap</th>
          <th>Interview</th>
          <th>Scenario</th>
          <th>Quiz</th>
          <th>Quiz Score</th>
          <th>Full Day</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        ${dayRowsHtml || '<tr><td colspan="8" style="text-align:center;color:#9ca3af;padding:16px">No progress data available.</td></tr>'}
      </tbody>
    </table>

    ${quizTrendRows
      ? `<!-- Quiz Score Trend -->
        <div class="section-title">Quiz Score Trend</div>
        <table>
          <thead>
            <tr>
              <th style="width:80px">Day</th>
              <th style="width:80px">Score</th>
              <th>Progress Bar</th>
            </tr>
          </thead>
          <tbody>${quizTrendRows}</tbody>
        </table>`
      : ''
    }

    <div class="footer">
      Generated by Adaptive LMS Admin Dashboard &nbsp;·&nbsp; ${generatedDate} &nbsp;·&nbsp; Confidential
    </div>

  </div>

</body>
</html>`
}

export default function StudentsPage() {
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [rows, setRows] = useState<AdminProgressRow[]>([])
  const [studentEmailById, setStudentEmailById] = useState<Record<string, string>>({})
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setErrorMessage(null)
      try {
        const data = await fetchAdminJson<AnalyticsApiResponse>(
          '/api/admin/analytics-data'
        )
        if (!active) return
        setRows(data.progressRows ?? [])
        setStudentEmailById(data.studentEmailById ?? {})
      } catch (error) {
        if (!active) return
        const message =
          error instanceof Error ? error.message : 'Failed to load student analytics.'
        setErrorMessage(message)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [])

  const summaries = useMemo(() => buildStudentAnalytics(rows), [rows])

  const handleDownloadPdf = useCallback(
    async (studentId: string, studentEmail: string) => {
      setDownloadingId(studentId)
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const accessToken = sessionData.session?.access_token
        if (!accessToken) {
          alert('Session expired. Please log in again.')
          return
        }

        const response = await fetch(
          `/api/admin/student-report/${encodeURIComponent(studentId)}`,
          { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } }
        )

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string
          }
          alert(body.error ?? 'Failed to generate report.')
          return
        }

        const data = (await response.json()) as ReportData
        const html = buildPdfHtml(data)

        // Open a hidden iframe, write the HTML, and trigger print → Save as PDF
        const iframe = document.createElement('iframe')
        iframe.style.cssText =
          'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;visibility:hidden'
        document.body.appendChild(iframe)

        const doc = iframe.contentDocument ?? iframe.contentWindow?.document
        if (!doc) {
          alert('Could not open print window.')
          document.body.removeChild(iframe)
          return
        }

        doc.open()
        doc.write(html)
        doc.close()

        // Give images / fonts a moment to load, then print
        iframe.onload = () => {
          setTimeout(() => {
            iframe.contentWindow?.focus()
            iframe.contentWindow?.print()
            // Clean up after a short delay so the print dialog has time to appear
            setTimeout(() => document.body.removeChild(iframe), 2000)
          }, 400)
        }
      } catch (err) {
        console.error('PDF generation error', err)
        alert('An error occurred while generating the PDF report.')
      } finally {
        setDownloadingId(null)
      }
    },
    []
  )

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '2rem',
          color: 'var(--muted)',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: '1.25rem',
            height: '1.25rem',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        Loading students...
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3">
        {errorMessage}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="surface-card p-5 md:p-6">
        <h1 className="text-2xl font-bold md:text-3xl">Student Analytics</h1>
        <p className="mt-2 text-sm muted-text">
          Compare student progress, completion trends, and download individual PDF reports.
        </p>
      </div>

      <div className="surface-card overflow-auto">
        <table className="w-full text-sm" style={{ minWidth: '960px' }}>
          <thead style={{ background: 'var(--bg-soft)' }}>
            <tr>
              {[
                'Student Email',
                'Days Started',
                'Latest Day',
                'Recap %',
                'Interview %',
                'Scenario %',
                'Quiz %',
                'Full Day %',
                'Fully Completed Days',
                'Avg Quiz Score',
                'Download Report',
              ].map((h) => (
                <th
                  key={h}
                  className="p-3 text-left font-semibold"
                  style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summaries.length === 0 && (
              <tr>
                <td
                  colSpan={11}
                  className="p-6 text-center muted-text"
                  style={{ fontStyle: 'italic' }}
                >
                  No student data available.
                </td>
              </tr>
            )}
            {summaries.map((student) => {
              const email = getStudentLabel(student.studentId, studentEmailById)
              const isDownloading = downloadingId === student.studentId

              return (
                <tr
                  key={student.studentId}
                  className="border-t"
                  style={{ transition: 'background 0.15s' }}
                  onMouseEnter={(e) => {
                    ; (e.currentTarget as HTMLTableRowElement).style.background =
                      'var(--bg-soft)'
                  }}
                  onMouseLeave={(e) => {
                    ; (e.currentTarget as HTMLTableRowElement).style.background = ''
                  }}
                >
                  <td
                    className="p-3"
                    style={{
                      maxWidth: '200px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={email}
                  >
                    {email}
                  </td>
                  <td className="p-3">{student.daysStarted}</td>
                  <td className="p-3">{student.latestDay}</td>
                  <td className="p-3">{student.recapPct}%</td>
                  <td className="p-3">{student.interviewPct}%</td>
                  <td className="p-3">{student.scenarioPct}%</td>
                  <td className="p-3">{student.quizPct}%</td>
                  <td className="p-3">{student.fullCompletionPct}%</td>
                  <td className="p-3">{student.fullyCompletedDays}</td>
                  <td className="p-3">{student.averageQuizScore}</td>
                  <td className="p-3">
                    <button
                      id={`download-pdf-${student.studentId}`}
                      onClick={() =>
                        handleDownloadPdf(student.studentId, email)
                      }
                      disabled={downloadingId !== null}
                      title={`Download PDF report for ${email}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.38rem 0.85rem',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        borderRadius: '0.5rem',
                        border: 'none',
                        cursor:
                          downloadingId !== null ? 'not-allowed' : 'pointer',
                        background: isDownloading
                          ? 'rgba(220,38,38,0.45)'
                          : 'linear-gradient(135deg,#dc2626,#b91c1c)',
                        color: '#fff',
                        opacity:
                          downloadingId !== null && !isDownloading ? 0.55 : 1,
                        transition: 'opacity 0.2s, transform 0.15s, box-shadow 0.15s',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 1px 4px rgba(220,38,38,0.3)',
                      }}
                      onMouseEnter={(e) => {
                        if (downloadingId === null) {
                          ; (e.currentTarget as HTMLButtonElement).style.transform =
                            'translateY(-1px)'
                            ; (e.currentTarget as HTMLButtonElement).style.boxShadow =
                              '0 4px 10px rgba(220,38,38,0.45)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        ; (e.currentTarget as HTMLButtonElement).style.transform = ''
                          ; (e.currentTarget as HTMLButtonElement).style.boxShadow =
                            '0 1px 4px rgba(220,38,38,0.3)'
                      }}
                    >
                      {isDownloading ? (
                        <>
                          <span
                            style={{
                              display: 'inline-block',
                              width: '0.7rem',
                              height: '0.7rem',
                              border: '2px solid rgba(255,255,255,0.4)',
                              borderTopColor: '#fff',
                              borderRadius: '50%',
                              animation: 'spin 0.7s linear infinite',
                            }}
                          />
                          Generating…
                        </>
                      ) : (
                        <>
                          {/* PDF icon */}
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="12" y1="18" x2="12" y2="12" />
                            <line x1="9" y1="15" x2="15" y2="15" />
                          </svg>
                          PDF Report
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

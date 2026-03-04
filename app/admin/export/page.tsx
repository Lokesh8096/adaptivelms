'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  buildDayAnalytics,
  buildStudentAnalytics,
  toPercent,
  type AdminProgressRow,
  type AdminQuestionRow,
} from '@/lib/adminAnalytics'
import { fetchAdminJson } from '@/lib/adminClient'
import { normalizeStringArray } from '@/lib/helpers'

type AnalyticsApiResponse = {
  progressRows: AdminProgressRow[]
  questionRows: AdminQuestionRow[]
  studentEmailById: Record<string, string>
}

type DownloadKey = 'day-wise' | 'student-wise' | 'detailed' | null

const csvEscape = (value: unknown): string =>
  `"${String(value ?? '').replaceAll('"', '""')}"`

const buildCsvContent = (header: string[], rows: Array<Array<unknown>>): string =>
  [header.join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n')

const triggerCsvDownload = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const getStudentLabel = (
  studentId: string | null,
  studentEmailById: Record<string, string>
): string => {
  if (!studentId) return ''
  return studentEmailById[studentId] ?? studentId
}

export default function ExportPage() {
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<DownloadKey>(null)
  const [progressRows, setProgressRows] = useState<AdminProgressRow[]>([])
  const [questionRows, setQuestionRows] = useState<AdminQuestionRow[]>([])
  const [studentEmailById, setStudentEmailById] = useState<Record<string, string>>({})

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
        setProgressRows(data.progressRows ?? [])
        setQuestionRows(data.questionRows ?? [])
        setStudentEmailById(data.studentEmailById ?? {})
      } catch (error) {
        if (!active) return
        const message = error instanceof Error ? error.message : 'Failed to load export data.'
        setErrorMessage(message)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [])

  const dayAnalytics = useMemo(
    () => buildDayAnalytics(progressRows, questionRows),
    [progressRows, questionRows]
  )

  const studentAnalytics = useMemo(
    () => buildStudentAnalytics(progressRows),
    [progressRows]
  )

  const downloadDayWiseCsv = () => {
    setDownloading('day-wise')
    const header = [
      'day_number',
      'students_started',
      'recap_done',
      'recap_pct',
      'interview_done',
      'interview_pct',
      'scenario_done',
      'scenario_pct',
      'quiz_done',
      'quiz_pct',
      'full_completed',
      'full_completion_pct',
      'avg_quiz_score',
      'interview_questions',
      'scenario_questions',
      'quiz_questions',
    ]

    const rows = dayAnalytics.map((row) => [
      row.dayNumber,
      row.studentsStarted,
      row.recapDone,
      row.recapPct,
      row.interviewDone,
      row.interviewPct,
      row.scenarioDone,
      row.scenarioPct,
      row.quizDone,
      row.quizPct,
      row.fullCompleted,
      row.fullCompletionPct,
      row.averageQuizScore,
      row.interviewQuestions,
      row.scenarioQuestions,
      row.quizQuestions,
    ])

    const content = buildCsvContent(header, rows)
    triggerCsvDownload(
      `analytics-day-wise-${new Date().toISOString().slice(0, 10)}.csv`,
      content
    )
    setDownloading(null)
  }

  const downloadStudentWiseCsv = () => {
    setDownloading('student-wise')
    const header = [
      'student_email',
      'student_id',
      'days_started',
      'latest_day',
      'recap_pct',
      'interview_pct',
      'scenario_pct',
      'quiz_pct',
      'full_day_pct',
      'fully_completed_days',
      'avg_quiz_score',
    ]

    const rows = studentAnalytics.map((row) => [
      getStudentLabel(row.studentId, studentEmailById),
      row.studentId,
      row.daysStarted,
      row.latestDay,
      row.recapPct,
      row.interviewPct,
      row.scenarioPct,
      row.quizPct,
      row.fullCompletionPct,
      row.fullyCompletedDays,
      row.averageQuizScore,
    ])

    const content = buildCsvContent(header, rows)
    triggerCsvDownload(
      `analytics-student-wise-${new Date().toISOString().slice(0, 10)}.csv`,
      content
    )
    setDownloading(null)
  }

  const downloadDetailedProgressCsv = () => {
    setDownloading('detailed')
    const header = [
      'student_email',
      'student_id',
      'day_number',
      'recap_completed',
      'interview_completed',
      'scenario_completed',
      'quiz_completed',
      'completion_pct',
      'quiz_score',
      'recap_checked_count',
      'interview_checked_count',
      'scenario_checked_count',
      'created_at',
    ]

    const sortedRows = [...progressRows].sort((a, b) => {
      const emailA = getStudentLabel(a.student_id, studentEmailById)
      const emailB = getStudentLabel(b.student_id, studentEmailById)
      if (emailA !== emailB) return emailA.localeCompare(emailB)
      return (a.day_number ?? 0) - (b.day_number ?? 0)
    })

    const rows = sortedRows.map((row) => {
      const doneCount = [
        row.recap_completed,
        row.interview_completed,
        row.scenario_completed,
        row.quiz_completed,
      ].filter(Boolean).length

      return [
        getStudentLabel(row.student_id, studentEmailById),
        row.student_id ?? '',
        row.day_number ?? '',
        row.recap_completed ? 'true' : 'false',
        row.interview_completed ? 'true' : 'false',
        row.scenario_completed ? 'true' : 'false',
        row.quiz_completed ? 'true' : 'false',
        toPercent(doneCount, 4),
        row.quiz_score ?? 0,
        normalizeStringArray(row.recap_checked).length,
        normalizeStringArray(row.interview_checked).length,
        normalizeStringArray(row.scenario_checked).length,
        row.created_at ?? '',
      ]
    })

    const content = buildCsvContent(header, rows)
    triggerCsvDownload(
      `analytics-detailed-progress-${new Date().toISOString().slice(0, 10)}.csv`,
      content
    )
    setDownloading(null)
  }

  if (loading) {
    return <div>Loading export data...</div>
  }

  if (errorMessage) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3">
        {errorMessage}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="surface-card p-5 md:p-6">
        <h1 className="text-2xl font-bold md:text-3xl">Export Analytics</h1>
        <p className="mt-2 text-sm muted-text">
          Download separate CSV files for day-wise analytics, student-wise analytics,
          and detailed student-day progress.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={downloadDayWiseCsv}
          disabled={downloading !== null || dayAnalytics.length === 0}
          className="quick-btn disabled:opacity-60"
        >
          {downloading === 'day-wise' ? 'Preparing...' : 'Download Day-wise CSV'}
        </button>

        <button
          onClick={downloadStudentWiseCsv}
          disabled={downloading !== null || studentAnalytics.length === 0}
          className="quick-btn secondary disabled:opacity-60"
        >
          {downloading === 'student-wise'
            ? 'Preparing...'
            : 'Download Student-wise CSV'}
        </button>

        <button
          onClick={downloadDetailedProgressCsv}
          disabled={downloading !== null || progressRows.length === 0}
          className="quick-btn success disabled:opacity-60"
        >
          {downloading === 'detailed'
            ? 'Preparing...'
            : 'Download Detailed Progress CSV'}
        </button>
      </div>

      <div className="text-sm text-gray-500 space-y-1">
        <p>Day-wise rows: {dayAnalytics.length}</p>
        <p>Student-wise rows: {studentAnalytics.length}</p>
        <p>Detailed rows: {progressRows.length}</p>
      </div>
    </div>
  )
}

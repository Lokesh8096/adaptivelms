'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  buildDayAnalytics,
  buildOverview,
  toPercent,
  type AdminProgressRow,
  type AdminQuestionRow,
} from '@/lib/adminAnalytics'
import { fetchAdminJson } from '@/lib/adminClient'

type AnalyticsApiResponse = {
  progressRows: AdminProgressRow[]
  questionRows: AdminQuestionRow[]
  studentEmailById: Record<string, string>
}

const formatCountPct = (count: number, total: number): string =>
  `${count} (${toPercent(count, total)}%)`

const getStudentLabel = (
  studentId: string | null,
  studentEmailById: Record<string, string>
): string => {
  if (!studentId) return '-'
  return studentEmailById[studentId] ?? studentId
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
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
        const message = error instanceof Error ? error.message : 'Failed to load analytics.'
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

  const overview = useMemo(() => buildOverview(progressRows), [progressRows])
  const byDay = useMemo(
    () => buildDayAnalytics(progressRows, questionRows),
    [progressRows, questionRows]
  )

  if (loading) {
    return <div>Loading analytics...</div>
  }

  if (errorMessage) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3">
        {errorMessage}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="surface-card p-5 md:p-6">
        <h1 className="text-2xl font-bold md:text-3xl">Analytics</h1>
        <p className="mt-2 text-sm muted-text">
          Review day-wise completion percentages and detailed student progress.
        </p>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="surface-card p-4">
          <p className="text-xs text-gray-500">Total Students</p>
          <p className="text-2xl font-bold">{overview.totalStudents}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-gray-500">Student-Day Rows</p>
          <p className="text-2xl font-bold">{overview.totalStudentDays}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-gray-500">Full Completion</p>
          <p className="text-2xl font-bold">{overview.fullCompletionPct}%</p>
          <p className="text-xs text-gray-500">{overview.fullDayCount} completed rows</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-gray-500">Avg Quiz Score</p>
          <p className="text-2xl font-bold">{overview.averageQuizScore}</p>
        </div>
      </section>

      <section className="surface-card overflow-auto">
        <h2 className="text-lg font-semibold p-4 pb-2">Day-wise Completion</h2>
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Day</th>
              <th className="p-2 text-left">Students</th>
              <th className="p-2 text-left">Recap</th>
              <th className="p-2 text-left">Interview</th>
              <th className="p-2 text-left">Scenario</th>
              <th className="p-2 text-left">Quiz</th>
              <th className="p-2 text-left">Full Day</th>
              <th className="p-2 text-left">Avg Quiz</th>
              <th className="p-2 text-left">Interview Qs</th>
              <th className="p-2 text-left">Scenario Qs</th>
              <th className="p-2 text-left">Quiz Qs</th>
            </tr>
          </thead>
          <tbody>
            {byDay.map((row) => (
              <tr key={row.dayNumber} className="border-t">
                <td className="p-2">Day {row.dayNumber}</td>
                <td className="p-2">{row.studentsStarted}</td>
                <td className="p-2">{formatCountPct(row.recapDone, row.studentsStarted)}</td>
                <td className="p-2">{formatCountPct(row.interviewDone, row.studentsStarted)}</td>
                <td className="p-2">{formatCountPct(row.scenarioDone, row.studentsStarted)}</td>
                <td className="p-2">{formatCountPct(row.quizDone, row.studentsStarted)}</td>
                <td className="p-2">{formatCountPct(row.fullCompleted, row.studentsStarted)}</td>
                <td className="p-2">{row.averageQuizScore}</td>
                <td className="p-2">{row.interviewQuestions}</td>
                <td className="p-2">{row.scenarioQuestions}</td>
                <td className="p-2">{row.quizQuestions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="surface-card overflow-auto">
        <h2 className="text-lg font-semibold p-4 pb-2">Student-Day Progress</h2>
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Student Email</th>
              <th className="p-2 text-left">Day</th>
              <th className="p-2 text-left">Recap</th>
              <th className="p-2 text-left">Interview</th>
              <th className="p-2 text-left">Scenario</th>
              <th className="p-2 text-left">Quiz</th>
              <th className="p-2 text-left">Completion</th>
              <th className="p-2 text-left">Quiz Score</th>
            </tr>
          </thead>
          <tbody>
            {progressRows.map((row, index) => {
              const doneCount = [
                row.recap_completed,
                row.interview_completed,
                row.scenario_completed,
                row.quiz_completed,
              ].filter(Boolean).length
              const completionPct = toPercent(doneCount, 4)

              return (
                <tr key={`${row.student_id}-${row.day_number}-${index}`} className="border-t">
                  <td className="p-2">{getStudentLabel(row.student_id, studentEmailById)}</td>
                  <td className="p-2">{row.day_number ?? '-'}</td>
                  <td className="p-2">{row.recap_completed ? 'Yes' : 'No'}</td>
                  <td className="p-2">{row.interview_completed ? 'Yes' : 'No'}</td>
                  <td className="p-2">{row.scenario_completed ? 'Yes' : 'No'}</td>
                  <td className="p-2">{row.quiz_completed ? 'Yes' : 'No'}</td>
                  <td className="p-2">{completionPct}%</td>
                  <td className="p-2">{row.quiz_score ?? 0}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}

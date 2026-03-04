'use client'

import { useEffect, useMemo, useState } from 'react'
import { buildStudentAnalytics, type AdminProgressRow } from '@/lib/adminAnalytics'
import { fetchAdminJson } from '@/lib/adminClient'

type AnalyticsApiResponse = {
  progressRows: AdminProgressRow[]
  studentEmailById: Record<string, string>
}

const getStudentLabel = (
  studentId: string,
  studentEmailById: Record<string, string>
): string => studentEmailById[studentId] ?? studentId

export default function StudentsPage() {
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [rows, setRows] = useState<AdminProgressRow[]>([])
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
        setRows(data.progressRows ?? [])
        setStudentEmailById(data.studentEmailById ?? {})
      } catch (error) {
        if (!active) return
        const message = error instanceof Error ? error.message : 'Failed to load student analytics.'
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

  const summaries = useMemo(() => buildStudentAnalytics(rows), [rows])

  if (loading) {
    return <div>Loading students...</div>
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
          Compare student progress percentages and completion trends.
        </p>
      </div>

      <div className="surface-card overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Student Email</th>
              <th className="p-2 text-left">Days Started</th>
              <th className="p-2 text-left">Latest Day</th>
              <th className="p-2 text-left">Recap %</th>
              <th className="p-2 text-left">Interview %</th>
              <th className="p-2 text-left">Scenario %</th>
              <th className="p-2 text-left">Quiz %</th>
              <th className="p-2 text-left">Full Day %</th>
              <th className="p-2 text-left">Fully Completed Days</th>
              <th className="p-2 text-left">Avg Quiz Score</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((student) => (
              <tr key={student.studentId} className="border-t">
                <td className="p-2">{getStudentLabel(student.studentId, studentEmailById)}</td>
                <td className="p-2">{student.daysStarted}</td>
                <td className="p-2">{student.latestDay}</td>
                <td className="p-2">{student.recapPct}%</td>
                <td className="p-2">{student.interviewPct}%</td>
                <td className="p-2">{student.scenarioPct}%</td>
                <td className="p-2">{student.quizPct}%</td>
                <td className="p-2">{student.fullCompletionPct}%</td>
                <td className="p-2">{student.fullyCompletedDays}</td>
                <td className="p-2">{student.averageQuizScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

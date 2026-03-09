import { normalizeStringArray } from '@/lib/helpers'

export type AdminProgressRow = {
  student_id: string | null
  day_number: number | null
  recap_completed: boolean | null
  interview_completed: boolean | null
  scenario_completed: boolean | null
  quiz_completed: boolean | null
  quiz_score: number | null
  recap_checked?: unknown
  interview_checked?: unknown
  scenario_checked?: unknown
  created_at?: string | null
}

export type AdminQuestionRow = {
  day_number: number | null
  type: 'interview' | 'scenario' | 'quiz'
  active: boolean | null
}

export type DayAnalyticsRow = {
  dayNumber: number
  studentsStarted: number
  recapDone: number
  interviewDone: number
  scenarioDone: number
  quizDone: number
  fullCompleted: number
  recapPct: number
  interviewPct: number
  scenarioPct: number
  quizPct: number
  fullCompletionPct: number
  averageQuizScore: number
  interviewQuestions: number
  scenarioQuestions: number
  quizQuestions: number
  interviewChecks: number
  scenarioChecks: number
}

export type StudentAnalyticsRow = {
  studentId: string
  daysStarted: number
  fullyCompletedDays: number
  latestDay: number
  recapPct: number
  interviewPct: number
  scenarioPct: number
  quizPct: number
  fullCompletionPct: number
  averageQuizScore: number
}

export type AnalyticsOverview = {
  totalStudents: number
  totalStudentDays: number
  fullDayCount: number
  fullCompletionPct: number
  averageQuizScore: number
  activeStudentsToday: number
  totalQuizAttempts: number
  avgCompletionRate: number
}

export const toPercent = (value: number, total: number): number => {
  if (total <= 0) return 0
  return Number(((value / total) * 100).toFixed(1))
}

export const buildOverview = (
  progressRows: AdminProgressRow[]
): AnalyticsOverview => {
  const today = new Date().toISOString().slice(0, 10)
  const studentIds = new Set<string>()
  const activeTodayIds = new Set<string>()
  let fullDayCount = 0
  let quizScoreTotal = 0
  let quizScoreCount = 0

  progressRows.forEach((row) => {
    if (row.student_id) {
      studentIds.add(row.student_id)
      if (row.created_at && row.created_at.slice(0, 10) === today) {
        activeTodayIds.add(row.student_id)
      }
    }
    if (
      row.recap_completed &&
      row.interview_completed &&
      row.scenario_completed &&
      row.quiz_completed
    ) {
      fullDayCount += 1
    }
    if (typeof row.quiz_score === 'number') {
      quizScoreTotal += row.quiz_score
      quizScoreCount += 1
    }
  })

  // Avg per-student full-completion rate
  const byStudent = new Map<string, { total: number; done: number }>()
  progressRows.forEach((row) => {
    if (!row.student_id) return
    const s = byStudent.get(row.student_id) ?? { total: 0, done: 0 }
    s.total += 1
    if (
      row.recap_completed &&
      row.interview_completed &&
      row.scenario_completed &&
      row.quiz_completed
    ) s.done += 1
    byStudent.set(row.student_id, s)
  })
  let pctSum = 0
  byStudent.forEach(({ total, done }) => { pctSum += total > 0 ? (done / total) * 100 : 0 })
  const avgCompletionRate =
    byStudent.size > 0 ? Number((pctSum / byStudent.size).toFixed(1)) : 0

  return {
    totalStudents: studentIds.size,
    totalStudentDays: progressRows.length,
    fullDayCount,
    fullCompletionPct: toPercent(fullDayCount, progressRows.length),
    averageQuizScore:
      quizScoreCount > 0
        ? Number((quizScoreTotal / quizScoreCount).toFixed(2))
        : 0,
    activeStudentsToday: activeTodayIds.size,
    totalQuizAttempts: quizScoreCount,
    avgCompletionRate,
  }
}

export const buildDayAnalytics = (
  progressRows: AdminProgressRow[],
  questionRows: AdminQuestionRow[]
): DayAnalyticsRow[] => {
  const rowsByDay = new Map<number, AdminProgressRow[]>()
  const questionCountByDay = new Map<
    number,
    { interview: number; scenario: number; quiz: number }
  >()

  progressRows.forEach((row) => {
    if (!row.day_number || row.day_number <= 0) return
    const existing = rowsByDay.get(row.day_number) ?? []
    existing.push(row)
    rowsByDay.set(row.day_number, existing)
  })

  questionRows.forEach((row) => {
    if (!row.day_number || row.day_number <= 0) return
    const existing = questionCountByDay.get(row.day_number) ?? {
      interview: 0,
      scenario: 0,
      quiz: 0,
    }
    if (row.type === 'interview') existing.interview += 1
    if (row.type === 'scenario') existing.scenario += 1
    if (row.type === 'quiz') existing.quiz += 1
    questionCountByDay.set(row.day_number, existing)
  })

  const dayNumbers = Array.from(
    new Set([...rowsByDay.keys(), ...questionCountByDay.keys()])
  ).sort((a, b) => a - b)

  return dayNumbers.map((dayNumber) => {
    const rows = rowsByDay.get(dayNumber) ?? []
    const students = new Set<string>()
    let recapDone = 0
    let interviewDone = 0
    let scenarioDone = 0
    let quizDone = 0
    let fullCompleted = 0
    let quizScoreTotal = 0
    let quizScoreCount = 0
    let interviewChecks = 0
    let scenarioChecks = 0

    rows.forEach((row) => {
      if (row.student_id) students.add(row.student_id)
      if (row.recap_completed) recapDone += 1
      if (row.interview_completed) interviewDone += 1
      if (row.scenario_completed) scenarioDone += 1
      if (row.quiz_completed) quizDone += 1
      if (
        row.recap_completed &&
        row.interview_completed &&
        row.scenario_completed &&
        row.quiz_completed
      ) {
        fullCompleted += 1
      }
      if (typeof row.quiz_score === 'number') {
        quizScoreTotal += row.quiz_score
        quizScoreCount += 1
      }
      interviewChecks += normalizeStringArray(row.interview_checked).length
      scenarioChecks += normalizeStringArray(row.scenario_checked).length
    })

    const questionCounts = questionCountByDay.get(dayNumber) ?? {
      interview: 0,
      scenario: 0,
      quiz: 0,
    }

    const studentsStarted = students.size

    return {
      dayNumber,
      studentsStarted,
      recapDone,
      interviewDone,
      scenarioDone,
      quizDone,
      fullCompleted,
      recapPct: toPercent(recapDone, studentsStarted),
      interviewPct: toPercent(interviewDone, studentsStarted),
      scenarioPct: toPercent(scenarioDone, studentsStarted),
      quizPct: toPercent(quizDone, studentsStarted),
      fullCompletionPct: toPercent(fullCompleted, studentsStarted),
      averageQuizScore:
        quizScoreCount > 0
          ? Number((quizScoreTotal / quizScoreCount).toFixed(2))
          : 0,
      interviewQuestions: questionCounts.interview,
      scenarioQuestions: questionCounts.scenario,
      quizQuestions: questionCounts.quiz,
      interviewChecks,
      scenarioChecks,
    }
  })
}

export const buildStudentAnalytics = (
  progressRows: AdminProgressRow[]
): StudentAnalyticsRow[] => {
  const byStudent = new Map<string, AdminProgressRow[]>()
  progressRows.forEach((row) => {
    if (!row.student_id) return
    const list = byStudent.get(row.student_id) ?? []
    list.push(row)
    byStudent.set(row.student_id, list)
  })

  return Array.from(byStudent.entries())
    .map(([studentId, entries]) => {
      let recapDone = 0
      let interviewDone = 0
      let scenarioDone = 0
      let quizDone = 0
      let fullyCompletedDays = 0
      let latestDay = 0
      let quizTotal = 0
      let quizCount = 0

      entries.forEach((row) => {
        const day = row.day_number ?? 0
        if (day > latestDay) latestDay = day

        if (row.recap_completed) recapDone += 1
        if (row.interview_completed) interviewDone += 1
        if (row.scenario_completed) scenarioDone += 1
        if (row.quiz_completed) quizDone += 1

        const fullDone =
          row.recap_completed &&
          row.interview_completed &&
          row.scenario_completed &&
          row.quiz_completed
        if (fullDone) fullyCompletedDays += 1

        if (typeof row.quiz_score === 'number') {
          quizTotal += row.quiz_score
          quizCount += 1
        }
      })

      const daysStarted = entries.length

      return {
        studentId,
        daysStarted,
        fullyCompletedDays,
        latestDay,
        recapPct: toPercent(recapDone, daysStarted),
        interviewPct: toPercent(interviewDone, daysStarted),
        scenarioPct: toPercent(scenarioDone, daysStarted),
        quizPct: toPercent(quizDone, daysStarted),
        fullCompletionPct: toPercent(fullyCompletedDays, daysStarted),
        averageQuizScore:
          quizCount > 0 ? Number((quizTotal / quizCount).toFixed(2)) : 0,
      }
    })
    .sort((a, b) => b.fullCompletionPct - a.fullCompletionPct)
}

/* ── Sprint Analytics ────────────────────────────────────────────── */

export type SprintAnalyticsRow = {
  sprintNumber: number
  startDay: number
  endDay: number
  studentsStarted: number
  studentsCompleted: number
  completionPct: number
  averageQuizScore: number
  totalQuizAttempts: number
  dayRows: DayAnalyticsRow[]
}

const SPRINT_SIZE = 6

export const buildSprintAnalytics = (
  progressRows: AdminProgressRow[],
  dayAnalytics: DayAnalyticsRow[]
): SprintAnalyticsRow[] => {
  if (dayAnalytics.length === 0) return []
  const maxDay = dayAnalytics.reduce((m, d) => Math.max(m, d.dayNumber), 0)
  const numSprints = Math.ceil(maxDay / SPRINT_SIZE)

  return Array.from({ length: numSprints }, (_, i) => {
    const sprintNumber = i + 1
    const startDay = (sprintNumber - 1) * SPRINT_SIZE + 1
    const endDay = sprintNumber * SPRINT_SIZE

    const sprintDayRows = dayAnalytics.filter(
      (d) => d.dayNumber >= startDay && d.dayNumber <= endDay
    )
    const sprintProgress = progressRows.filter(
      (r) => r.day_number !== null && r.day_number >= startDay && r.day_number <= endDay
    )

    const startedIds = new Set<string>()
    sprintProgress.forEach((r) => { if (r.student_id) startedIds.add(r.student_id) })

    const studentMap = new Map<string, AdminProgressRow[]>()
    sprintProgress.forEach((r) => {
      if (!r.student_id) return
      const list = studentMap.get(r.student_id) ?? []
      list.push(r)
      studentMap.set(r.student_id, list)
    })
    let studentsCompleted = 0
    studentMap.forEach((rows) => {
      if (rows.every((r) => r.recap_completed && r.interview_completed && r.scenario_completed && r.quiz_completed))
        studentsCompleted += 1
    })

    let quizTotal = 0, quizCount = 0
    sprintProgress.forEach((r) => {
      if (typeof r.quiz_score === 'number') { quizTotal += r.quiz_score; quizCount += 1 }
    })

    const studentsStarted = startedIds.size
    return {
      sprintNumber, startDay, endDay,
      studentsStarted, studentsCompleted,
      completionPct: toPercent(studentsCompleted, studentsStarted),
      averageQuizScore: quizCount > 0 ? Number((quizTotal / quizCount).toFixed(2)) : 0,
      totalQuizAttempts: quizCount,
      dayRows: sprintDayRows,
    }
  }).filter((s) => s.dayRows.length > 0)
}

/* ── Insights ─────────────────────────────────────────────────────── */

export type InsightItem = {
  type: 'warning' | 'info' | 'success'
  message: string
}

export const buildInsights = (dayAnalytics: DayAnalyticsRow[]): InsightItem[] => {
  const insights: InsightItem[] = []
  const MIN = 2
  dayAnalytics.forEach((day) => {
    const s = day.studentsStarted
    if (s < MIN) return
    const stuckInterview = s - day.interviewDone
    if (stuckInterview > 0 && day.interviewPct < 60)
      insights.push({ type: 'warning', message: `Day ${day.dayNumber} – ${stuckInterview} student${stuckInterview !== 1 ? 's' : ''} have not completed the Interview section (${day.interviewPct}% done)` })
    const stuckScenario = s - day.scenarioDone
    if (stuckScenario > 0 && day.scenarioPct < 60)
      insights.push({ type: 'warning', message: `Day ${day.dayNumber} – ${stuckScenario} student${stuckScenario !== 1 ? 's' : ''} have not completed the Scenario section (${day.scenarioPct}% done)` })
    if (day.averageQuizScore > 0 && day.averageQuizScore < 5)
      insights.push({ type: 'warning', message: `Day ${day.dayNumber} – Average quiz score is low at ${day.averageQuizScore}/10` })
    if (day.fullCompletionPct >= 80 && s >= 3)
      insights.push({ type: 'success', message: `Day ${day.dayNumber} – High engagement! ${day.fullCompletionPct}% of students fully completed this day` })
  })
  return insights.slice(0, 12)
}

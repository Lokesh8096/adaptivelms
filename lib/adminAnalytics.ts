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
}

export const toPercent = (value: number, total: number): number => {
  if (total <= 0) return 0
  return Number(((value / total) * 100).toFixed(1))
}

export const buildOverview = (
  progressRows: AdminProgressRow[]
): AnalyticsOverview => {
  const studentIds = new Set<string>()
  let fullDayCount = 0
  let quizScoreTotal = 0
  let quizScoreCount = 0

  progressRows.forEach((row) => {
    if (row.student_id) studentIds.add(row.student_id)

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

  return {
    totalStudents: studentIds.size,
    totalStudentDays: progressRows.length,
    fullDayCount,
    fullCompletionPct: toPercent(fullDayCount, progressRows.length),
    averageQuizScore:
      quizScoreCount > 0
        ? Number((quizScoreTotal / quizScoreCount).toFixed(2))
        : 0,
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

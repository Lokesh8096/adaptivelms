'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { buildOverview, type AdminProgressRow, type AnalyticsOverview } from '@/lib/adminAnalytics'
import { fetchAdminJson } from '@/lib/adminClient'

/* ─── Types ──────────────────────────────────────────────────── */

type QuestionType = 'interview' | 'scenario' | 'quiz'

type QuestionRow = {
  id: string
  type: QuestionType
  day_number: number
  prompt: string
  correct_answer: string | null
  active: boolean | null
}

/* ─── Question block ─────────────────────────────────────────── */

type QuestionBlock = {
  id: number
  day: number
  type: QuestionType
  prompt: string
  answer: string
  optionsText: string
  difficulty: string
  active: boolean
}

let blockId = 0
const newBlock = (): QuestionBlock => ({
  id: ++blockId,
  day: 1,
  type: 'interview',
  prompt: '',
  answer: '',
  optionsText: '',
  difficulty: '',
  active: true,
})

const emptyStudentForm = { name: '', studentId: '', email: '' }

/* ─── Main component ─────────────────────────────────────────── */

export default function AdminPage() {
  const [studentForm, setStudentForm] = useState(emptyStudentForm)
  const [savingStudent, setSavingStudent] = useState(false)
  const [uploadingStudents, setUploadingStudents] = useState(false)
  const [blocks, setBlocks] = useState<QuestionBlock[]>([newBlock()])
  const [savingQuestions, setSavingQuestions] = useState(false)
  const [uploadingQuestions, setUploadingQuestions] = useState(false)
  const [recentQuestions, setRecentQuestions] = useState<QuestionRow[]>([])
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)

  const studentCsvRef = useRef<HTMLInputElement>(null)
  const questionCsvRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    // Fetch recent questions
    const loadQuestions = async () => {
      const { data, error } = await supabase
        .from('questions')
        .select('id,type,day_number,prompt,correct_answer,active')
        .order('created_at', { ascending: false })
        .limit(10)
      if (!active) return
      if (!error) setRecentQuestions((data as QuestionRow[] | null) ?? [])
    }
    // Fetch quick overview stats
    const loadOverview = async () => {
      try {
        const data = await fetchAdminJson<{ progressRows: AdminProgressRow[] }>('/api/admin/analytics-data')
        if (!active) return
        setOverview(buildOverview(data.progressRows ?? []))
      } catch { /* silently ignore */ }
    }
    loadQuestions()
    loadOverview()
    return () => { active = false }
  }, [])

  const setStudentField = <K extends keyof typeof emptyStudentForm>(key: K, value: string) =>
    setStudentForm((prev) => ({ ...prev, [key]: value }))

  const isValidGmail = (email: string) => /^[^\s@]+@gmail\.com$/i.test(email.trim())

  const addStudent = useCallback(async () => {
    const name = studentForm.name.trim()
    const studentId = studentForm.studentId.trim()
    const email = studentForm.email.trim().toLowerCase()
    if (!name) { alert('Student name is required.'); return }
    if (!studentId) { alert('Student ID is required.'); return }
    if (!email) { alert('Email is required.'); return }
    if (!isValidGmail(email)) { alert('Email must be a valid Gmail address (@gmail.com).'); return }
    setSavingStudent(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/allow-student', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ name, student_id: studentId, email }),
    })
    setSavingStudent(false)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { alert(json.error ?? 'Failed to save student.'); return }
    setStudentForm(emptyStudentForm)
    alert('Student saved successfully!')
  }, [studentForm])

  // ── CSV parser (comma + optional quoted fields) ──────────────────
  const parseCsvText = useCallback((text: string): Record<string, string>[] => {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim())
    if (lines.length < 2) return []
    // Parse a single CSV line respecting quoted fields
    const parseLine = (line: string): string[] => {
      const fields: string[] = []
      let cur = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
          else inQuotes = !inQuotes
        } else if (ch === ',' && !inQuotes) {
          fields.push(cur.trim()); cur = ''
        } else {
          cur += ch
        }
      }
      fields.push(cur.trim())
      return fields
    }
    const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
    const result: Record<string, string>[] = []
    for (let i = 1; i < lines.length; i++) {
      const vals = parseLine(lines[i])
      if (vals.every((v) => !v)) continue // skip blank rows
      const row: Record<string, string> = {}
      headers.forEach((h, idx) => { row[h] = vals[idx] ?? '' })
      result.push(row)
    }
    return result
  }, [])

  // ── Bulk students CSV upload ─────────────────────────────────────
  const uploadStudentsCsv = useCallback(async (file: File) => {
    setUploadingStudents(true)
    try {
      const text = await file.text()
      const rows = parseCsvText(text)
      if (rows.length === 0) { alert('CSV is empty or has no data rows.'); return }
      // Map CSV columns → API shape
      const students = rows.map((r) => ({
        name: r.student_name ?? r.name ?? '',
        student_id: r.student_id ?? r.id ?? '',
        email: r.student_email ?? r.email ?? '',
      }))
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/bulk-students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ students }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { alert(json.error ?? 'Upload failed.'); return }
      alert(json.message ?? `${json.inserted ?? 0} students uploaded successfully.`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to read CSV.')
    } finally {
      setUploadingStudents(false)
      if (studentCsvRef.current) studentCsvRef.current.value = ''
    }
  }, [parseCsvText])

  // ── Bulk questions CSV upload ────────────────────────────────────
  const uploadQuestionsCsv = useCallback(async (file: File) => {
    setUploadingQuestions(true)
    try {
      const text = await file.text()
      const rows = parseCsvText(text)
      if (rows.length === 0) { alert('CSV is empty or has no data rows.'); return }
      // Map CSV columns → API shape
      const questions = rows.map((r) => ({
        type: (r.type ?? '').toLowerCase().trim(),
        day_number: Number(r.day_number ?? r.day ?? 0),
        prompt: r.prompt ?? r.question ?? r.question_prompt ?? '',
        model_answer: r.model_answer ?? r.answer ?? r.correct_answer ?? '',
        difficulty: r.difficulty ?? '',
        active: (r.active ?? 'true').toLowerCase() !== 'false',
      }))
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/bulk-questions-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ questions }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { alert(json.error ?? 'Upload failed.'); return }
      // Refresh recent questions list
      const newQs = (json.questions as QuestionRow[] | null) ?? []
      if (newQs.length > 0) setRecentQuestions((prev) => [...newQs, ...prev].slice(0, 10))
      alert(json.message ?? `${json.inserted ?? 0} questions uploaded successfully.`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to read CSV.')
    } finally {
      setUploadingQuestions(false)
      if (questionCsvRef.current) questionCsvRef.current.value = ''
    }
  }, [parseCsvText])

  const updateBlock = useCallback(
    <K extends keyof QuestionBlock>(id: number, key: K, value: QuestionBlock[K]) =>
      setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, [key]: value } : b))),
    []
  )
  const addBlock = () => setBlocks((prev) => [...prev, newBlock()])
  const removeBlock = (id: number) => setBlocks((prev) => prev.filter((b) => b.id !== id))

  const saveAllQuestions = useCallback(async () => {
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      if (!b.prompt.trim()) { alert(`Question ${i + 1}: prompt is required.`); return }
      if (!Number.isFinite(b.day) || b.day <= 0) { alert(`Question ${i + 1}: valid day number required.`); return }
      if (b.type === 'quiz') {
        const opts = b.optionsText.split('\n').map((l) => l.trim()).filter(Boolean)
        if (opts.length < 2) { alert(`Question ${i + 1}: quiz needs at least 2 options.`); return }
      }
    }
    setSavingQuestions(true)
    const { data: { session } } = await supabase.auth.getSession()
    const questionsPayload = blocks.map((b) => ({
      type: b.type,
      day_number: b.day,
      prompt: b.prompt.trim(),
      options: b.type === 'quiz' ? b.optionsText.split('\n').map((l) => l.trim()).filter(Boolean) : null,
      correct_answer: b.answer.trim() || null,
      difficulty: b.difficulty.trim() || null,
      active: b.active,
    }))
    const res = await fetch('/api/admin/bulk-questions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ questions: questionsPayload }),
    })
    setSavingQuestions(false)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { alert(json.error ?? 'Failed to save questions.'); return }
    const saved = (json.questions as QuestionRow[] | null) ?? []
    setBlocks([newBlock()])
    setRecentQuestions((prev) => [...saved, ...prev].slice(0, 10))
    alert(`${saved.length} question${saved.length !== 1 ? 's' : ''} saved!`)
  }, [blocks])

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="surface-card p-5 md:p-6">
        <h1 className="text-2xl font-bold md:text-3xl">Admin Control Panel</h1>
        <p className="mt-2 text-sm muted-text">
          Manage allowed students and question bank from one place.
        </p>
      </div>

      {/* ── Quick Analytics Banner ──────────────────── */}
      <section
        style={{
          background: 'linear-gradient(135deg,#4f46e5 0%,#7c3aed 50%,#a855f7 100%)',
          borderRadius: '1rem',
          padding: '1.25rem 1.5rem',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontWeight: 700, fontSize: '1rem' }}>📊 LMS Analytics Overview</h2>
            <p style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.2rem' }}>Live stats from the system</p>
          </div>
          <Link
            href="/admin/analytics"
            style={{
              background: 'rgba(255,255,255,0.2)',
              color: '#fff',
              padding: '0.45rem 1rem',
              borderRadius: '0.5rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-block',
              backdropFilter: 'blur(4px)',
            }}
          >
            Full Analytics →
          </Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: '0.75rem' }}>
          {overview ? (
            [
              { label: 'Total Students', value: overview.totalStudents },
              { label: 'Active Today', value: overview.activeStudentsToday },
              { label: 'Avg Completion', value: `${overview.avgCompletionRate}%` },
              { label: 'Avg Quiz Score', value: overview.averageQuizScore },
              { label: 'Quiz Attempts', value: overview.totalQuizAttempts },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '0.6rem', padding: '0.75rem 1rem', backdropFilter: 'blur(2px)' }}>
                <div style={{ fontSize: '0.65rem', opacity: 0.75, marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1 }}>{value}</div>
              </div>
            ))
          ) : (
            <div style={{ gridColumn: '1/-1', opacity: 0.7, fontSize: '0.82rem' }}>Loading stats…</div>
          )}
        </div>
        <div style={{ marginTop: '0.75rem', fontSize: '0.72rem', opacity: 0.7 }}>
          View Sprint analytics, Day-wise progress charts, and Insights on the
          {' '}<Link href="/admin/analytics" style={{ color: '#fff', fontWeight: 600 }}>Analytics page</Link>.
        </div>
      </section>

      {/* ── Allow Student ──────────────────────────────────────── */}
      <section className="surface-card p-5 space-y-4">
        <h2 className="text-lg font-semibold">Allow Student</h2>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium muted-text uppercase tracking-wide">
              Student Name <span style={{ color: '#f87171' }}>*</span>
            </label>
            <input
              id="student-name"
              value={studentForm.name}
              placeholder="e.g. John Doe"
              onChange={(e) => setStudentField('name', e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium muted-text uppercase tracking-wide">
              Student ID <span style={{ color: '#f87171' }}>*</span>
            </label>
            <input
              id="student-id"
              value={studentForm.studentId}
              placeholder="e.g. STU2024001"
              onChange={(e) => setStudentField('studentId', e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium muted-text uppercase tracking-wide">
            Student Email (Gmail) <span style={{ color: '#f87171' }}>*</span>
          </label>
          <input
            id="student-email"
            type="email"
            value={studentForm.email}
            placeholder="student@gmail.com"
            onChange={(e) => setStudentField('email', e.target.value)}
          />
          {studentForm.email && !isValidGmail(studentForm.email) && (
            <p style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '0.25rem' }}>
              Must be a valid Gmail address (@gmail.com)
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            id="save-student-btn"
            onClick={addStudent}
            disabled={savingStudent || uploadingStudents}
            className="quick-btn disabled:opacity-60"
          >
            {savingStudent ? 'Saving...' : 'Save Student'}
          </button>
          <button
            id="upload-students-csv-btn"
            onClick={() => studentCsvRef.current?.click()}
            disabled={savingStudent || uploadingStudents}
            className="quick-btn disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', border: 'none' }}
          >
            {uploadingStudents ? 'Uploading...' : '⬆ Upload Students CSV'}
          </button>
        </div>
      </section>

      {/* ── Add Questions ──────────────────────────────────────── */}
      <section className="surface-card p-5 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold">Add Question</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              id="add-another-question-btn"
              onClick={addBlock}
              className="quick-btn"
              style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}
            >
              + Add Another Question
            </button>
            <button
              id="upload-questions-csv-btn"
              onClick={() => questionCsvRef.current?.click()}
              disabled={uploadingQuestions}
              className="quick-btn disabled:opacity-60"
              style={{ fontSize: '0.85rem', padding: '0.4rem 1rem', background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', border: 'none' }}
            >
              {uploadingQuestions ? 'Uploading...' : '⬆ Upload Questions CSV'}
            </button>
          </div>
        </div>

        {blocks.map((block, index) => (
          <QuestionBlockForm
            key={block.id}
            block={block}
            index={index}
            total={blocks.length}
            onChange={updateBlock}
            onRemove={removeBlock}
          />
        ))}

        <div>
          <button
            id="save-all-questions-btn"
            onClick={saveAllQuestions}
            disabled={savingQuestions}
            className="quick-btn success disabled:opacity-60"
          >
            {savingQuestions
              ? 'Saving...'
              : `Save ${blocks.length} Question${blocks.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </section>

      {/* ── Recent Questions ───────────────────────────────────── */}
      <section className="surface-card p-4">
        <h2 className="text-lg font-semibold mb-3">Recent Questions</h2>
        {recentQuestions.length === 0 && (
          <p className="text-sm muted-text">No questions found.</p>
        )}
        <div className="space-y-3">
          {recentQuestions.map((q) => (
            <div key={q.id} className="surface-card p-3">
              <p className="text-sm muted-text capitalize">
                {q.type} | Day {q.day_number} | {q.active ? 'Active' : 'Inactive'}
              </p>
              <p className="font-medium">{q.prompt}</p>
              {q.correct_answer && (
                <p className="text-sm muted-text mt-1">Answer: {q.correct_answer}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Hidden CSV file inputs ─────────────────────────────── */}
      <input
        ref={studentCsvRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void uploadStudentsCsv(file)
        }}
      />
      <input
        ref={questionCsvRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void uploadQuestionsCsv(file)
        }}
      />
    </div>
  )
}

/* ─── QuestionBlockForm ──────────────────────────────────────── */

type QuestionBlockFormProps = {
  block: QuestionBlock
  index: number
  total: number
  onChange: <K extends keyof QuestionBlock>(id: number, key: K, value: QuestionBlock[K]) => void
  onRemove: (id: number) => void
}

function QuestionBlockForm({ block, index, total, onChange, onRemove }: QuestionBlockFormProps) {
  const isQuiz = block.type === 'quiz'

  const parsedOptions = useMemo(() => {
    if (!isQuiz) return null
    const raw = block.optionsText.split('\n').map((l) => l.trim()).filter(Boolean)
    return raw.length > 0 ? raw : null
  }, [block.optionsText, isQuiz])

  return (
    <div
      className="surface-card p-4 space-y-3"
      style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.75rem' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold muted-text">Question {index + 1}</span>
        {total > 1 && (
          <button
            onClick={() => onRemove(block.id)}
            style={{ fontSize: '0.75rem', color: '#f87171', cursor: 'pointer', background: 'none', border: 'none' }}
          >
            ✕ Remove
          </button>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <select
          value={block.type}
          onChange={(e) => onChange(block.id, 'type', e.target.value as QuestionType)}
        >
          <option value="interview">Interview</option>
          <option value="scenario">Scenario</option>
          <option value="quiz">Quiz</option>
        </select>
        <input
          type="number"
          min={1}
          value={block.day}
          onChange={(e) => onChange(block.id, 'day', Number.parseInt(e.target.value, 10) || 1)}
          placeholder="Day Number"
        />
        <input
          value={block.difficulty}
          onChange={(e) => onChange(block.id, 'difficulty', e.target.value)}
          placeholder="Difficulty (optional)"
        />
      </div>

      <textarea
        value={block.prompt}
        onChange={(e) => onChange(block.id, 'prompt', e.target.value)}
        rows={3}
        placeholder="Question prompt"
      />

      <textarea
        value={block.answer}
        onChange={(e) => onChange(block.id, 'answer', e.target.value)}
        rows={2}
        placeholder={isQuiz ? 'Correct option text' : 'Model answer shown to students'}
      />

      {isQuiz && (
        <div>
          <textarea
            value={block.optionsText}
            onChange={(e) => onChange(block.id, 'optionsText', e.target.value)}
            rows={4}
            placeholder="Quiz options (one per line)"
          />
          {block.optionsText && (!parsedOptions || parsedOptions.length < 2) && (
            <p style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '0.25rem' }}>
              Enter at least 2 options (one per line).
            </p>
          )}
        </div>
      )}

      <label className="inline-flex items-center gap-2 text-sm" style={{ cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={block.active}
          onChange={(e) => onChange(block.id, 'active', e.target.checked)}
        />
        Active
      </label>
    </div>
  )
}

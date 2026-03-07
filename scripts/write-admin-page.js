const fs = require('fs')
const path = require('path')

const target = path.join(__dirname, '..', 'app', 'admin', 'page.tsx')

const content = `'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
  const [blocks, setBlocks] = useState<QuestionBlock[]>([newBlock()])
  const [savingQuestions, setSavingQuestions] = useState(false)
  const [recentQuestions, setRecentQuestions] = useState<QuestionRow[]>([])

  useEffect(() => {
    let active = true
    const load = async () => {
      const { data, error } = await supabase
        .from('questions')
        .select('id,type,day_number,prompt,correct_answer,active')
        .order('created_at', { ascending: false })
        .limit(10)
      if (!active) return
      if (!error) setRecentQuestions((data as QuestionRow[] | null) ?? [])
    }
    load()
    return () => { active = false }
  }, [])

  const setStudentField = <K extends keyof typeof emptyStudentForm>(key: K, value: string) =>
    setStudentForm((prev) => ({ ...prev, [key]: value }))

  const isValidGmail = (email: string) => /^[^\\s@]+@gmail\\.com$/i.test(email.trim())

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
        ...(session?.access_token ? { Authorization: \`Bearer \${session.access_token}\` } : {}),
      },
      body: JSON.stringify({ name, student_id: studentId, email }),
    })
    setSavingStudent(false)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { alert(json.error ?? 'Failed to save student.'); return }
    setStudentForm(emptyStudentForm)
    alert('Student saved successfully!')
  }, [studentForm])

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
      if (!b.prompt.trim()) { alert(\`Question \${i + 1}: prompt is required.\`); return }
      if (!Number.isFinite(b.day) || b.day <= 0) { alert(\`Question \${i + 1}: valid day number required.\`); return }
      if (b.type === 'quiz') {
        const opts = b.optionsText.split('\\n').map((l) => l.trim()).filter(Boolean)
        if (opts.length < 2) { alert(\`Question \${i + 1}: quiz needs at least 2 options.\`); return }
      }
    }
    setSavingQuestions(true)
    const { data: { session } } = await supabase.auth.getSession()
    const questionsPayload = blocks.map((b) => ({
      type: b.type,
      day_number: b.day,
      prompt: b.prompt.trim(),
      options: b.type === 'quiz' ? b.optionsText.split('\\n').map((l) => l.trim()).filter(Boolean) : null,
      correct_answer: b.answer.trim() || null,
      difficulty: b.difficulty.trim() || null,
      active: b.active,
    }))
    const res = await fetch('/api/admin/bulk-questions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: \`Bearer \${session.access_token}\` } : {}),
      },
      body: JSON.stringify({ questions: questionsPayload }),
    })
    setSavingQuestions(false)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { alert(json.error ?? 'Failed to save questions.'); return }
    const saved = (json.questions as QuestionRow[] | null) ?? []
    setBlocks([newBlock()])
    setRecentQuestions((prev) => [...saved, ...prev].slice(0, 10))
    alert(\`\${saved.length} question\${saved.length !== 1 ? 's' : ''} saved!\`)
  }, [blocks])

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="surface-card p-5 md:p-6">
        <h1 className="text-2xl font-bold md:text-3xl">Admin Control Panel</h1>
        <p className="mt-2 text-sm muted-text">
          Manage allowed students and question bank from one place.
        </p>
      </div>

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

        <div>
          <button
            id="save-student-btn"
            onClick={addStudent}
            disabled={savingStudent}
            className="quick-btn disabled:opacity-60"
          >
            {savingStudent ? 'Saving...' : 'Save Student'}
          </button>
        </div>
      </section>

      {/* ── Add Questions ──────────────────────────────────────── */}
      <section className="surface-card p-5 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold">Add Question</h2>
          <button
            id="add-another-question-btn"
            onClick={addBlock}
            className="quick-btn"
            style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}
          >
            + Add Another Question
          </button>
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
              : \`Save \${blocks.length} Question\${blocks.length !== 1 ? 's' : ''}\`}
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
    const raw = block.optionsText.split('\\n').map((l) => l.trim()).filter(Boolean)
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
`

fs.writeFileSync(target, content, 'utf8')
console.log('Written:', target, '— bytes:', fs.statSync(target).size)

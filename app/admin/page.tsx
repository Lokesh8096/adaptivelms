'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type QuestionType = 'interview' | 'scenario' | 'quiz'

type QuestionRow = {
  id: string
  type: QuestionType
  day_number: number
  prompt: string
  correct_answer: string | null
  active: boolean | null
}

const emptyForm = {
  day: 1,
  type: 'interview' as QuestionType,
  prompt: '',
  answer: '',
  optionsText: '',
  difficulty: '',
  active: true,
}

export default function AdminPage() {
  const [email, setEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [savingQuestion, setSavingQuestion] = useState(false)
  const [recentQuestions, setRecentQuestions] = useState<QuestionRow[]>([])

  const isQuiz = form.type === 'quiz'

  const parsedOptions = useMemo(() => {
    if (!isQuiz) return null
    const raw = form.optionsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    return raw.length > 0 ? raw : null
  }, [form.optionsText, isQuiz])

  useEffect(() => {
    let active = true

    const loadRecentQuestions = async () => {
      const { data: recent, error } = await supabase
        .from('questions')
        .select('id,type,day_number,prompt,correct_answer,active')
        .order('created_at', { ascending: false })
        .limit(10)

      if (!active) return
      if (error) {
        console.error('Failed to load recent questions', error)
        return
      }

      setRecentQuestions((recent as QuestionRow[] | null) ?? [])
    }

    loadRecentQuestions()
    return () => {
      active = false
    }
  }, [])

  const addEmail = async () => {
    const normalized = email.trim().toLowerCase()
    if (!normalized) return

    setSavingEmail(true)
    const { error } = await supabase.from('allowed_emails').upsert(
      {
        email: normalized,
        is_used: false,
      },
      { onConflict: 'email' }
    )

    setSavingEmail(false)
    if (error) {
      alert(error.message)
      return
    }

    setEmail('')
    alert('Allowed email saved')
  }

  const addQuestion = async () => {
    if (!form.prompt.trim()) return
    if (!Number.isFinite(form.day) || form.day <= 0) return
    if (isQuiz && (!parsedOptions || parsedOptions.length < 2)) {
      alert('Quiz requires at least 2 options')
      return
    }

    setSavingQuestion(true)
    const payload = {
      type: form.type,
      day_number: form.day,
      prompt: form.prompt.trim(),
      options: isQuiz ? parsedOptions : null,
      correct_answer: form.answer.trim() || null,
      difficulty: form.difficulty.trim() || null,
      active: form.active,
    }

    const { data, error } = await supabase
      .from('questions')
      .insert(payload)
      .select('id,type,day_number,prompt,correct_answer,active')
      .single()

    setSavingQuestion(false)
    if (error) {
      alert(error.message)
      return
    }

    setForm((prev) => ({
      ...emptyForm,
      day: prev.day,
      type: prev.type,
    }))
    setRecentQuestions((prev) => [data as QuestionRow, ...prev].slice(0, 10))
    alert('Question saved')
  }

  return (
    <div className="space-y-8">
      <div className="surface-card p-5 md:p-6">
        <h1 className="text-2xl font-bold md:text-3xl">Admin Control Panel</h1>
        <p className="mt-2 text-sm muted-text">
          Manage allowed student emails and question bank from one place.
        </p>
      </div>

      <section className="surface-card p-4 space-y-3">
        <h2 className="text-lg font-semibold">Allow Student Email</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={email}
            placeholder="student@example.com"
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1"
          />
          <button
            onClick={addEmail}
            disabled={savingEmail}
            className="quick-btn disabled:opacity-60"
          >
            {savingEmail ? 'Saving...' : 'Save Email'}
          </button>
        </div>
      </section>

      <section className="surface-card p-4 space-y-3">
        <h2 className="text-lg font-semibold">Add Question</h2>

        <div className="grid md:grid-cols-3 gap-3">
          <select
            value={form.type}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                type: e.target.value as QuestionType,
              }))
            }
          >
            <option value="interview">Interview</option>
            <option value="scenario">Scenario</option>
            <option value="quiz">Quiz</option>
          </select>

          <input
            type="number"
            min={1}
            value={form.day}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                day: Number.parseInt(e.target.value, 10) || 1,
              }))
            }
            placeholder="Day Number"
          />

          <input
            value={form.difficulty}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, difficulty: e.target.value }))
            }
            placeholder="Difficulty (optional)"
          />
        </div>

        <textarea
          value={form.prompt}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, prompt: e.target.value }))
          }
          rows={3}
          placeholder="Question prompt"
        />

        <textarea
          value={form.answer}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, answer: e.target.value }))
          }
          rows={2}
          placeholder={
            isQuiz
              ? 'Correct option text'
              : 'Model answer shown to students'
          }
        />

        {isQuiz && (
          <textarea
            value={form.optionsText}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, optionsText: e.target.value }))
            }
            rows={4}
            placeholder={'Quiz options (one per line)'}
          />
        )}

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, active: e.target.checked }))
            }
          />
          Active
        </label>

        <div>
          <button
            onClick={addQuestion}
            disabled={savingQuestion}
            className="quick-btn success disabled:opacity-60"
          >
            {savingQuestion ? 'Saving...' : 'Save Question'}
          </button>
        </div>
      </section>

      <section className="surface-card p-4">
        <h2 className="text-lg font-semibold mb-3">Recent Questions</h2>

        {recentQuestions.length === 0 && (
          <p className="text-sm text-gray-600">No questions found.</p>
        )}

        <div className="space-y-3">
          {recentQuestions.map((q) => (
            <div key={q.id} className="surface-card p-3">
              <p className="text-sm muted-text">
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

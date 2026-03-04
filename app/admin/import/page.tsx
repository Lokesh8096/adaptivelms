'use client'

import { useCallback, useState } from 'react'

type ImportResult = {
    success?: boolean
    inserted?: number
    skipped?: number
    errors?: number
    errorMessages?: string[]
    breakdown?: Record<string, number>
    error?: string
}

export default function ImportQuestionsPage() {
    const [dragging, setDragging] = useState(false)
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<ImportResult | null>(null)
    const [fileName, setFileName] = useState<string | null>(null)

    const handleFile = useCallback(async (file: File) => {
        if (!file.name.endsWith('.csv')) {
            setResult({ error: 'Please upload a .csv file' })
            return
        }

        setFileName(file.name)
        setLoading(true)
        setResult(null)

        try {
            const formData = new FormData()
            formData.append('file', file)

            const res = await fetch('/api/import-questions', {
                method: 'POST',
                body: formData,
            })

            const data: ImportResult = await res.json()
            setResult(data)
        } catch {
            setResult({ error: 'Network error — could not reach server' })
        } finally {
            setLoading(false)
        }
    }, [])

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault()
            setDragging(false)
            const file = e.dataTransfer.files[0]
            if (file) handleFile(file)
        },
        [handleFile]
    )

    const onFileInput = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
        },
        [handleFile]
    )

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="surface-card p-5 md:p-6">
                <h1 className="text-2xl font-bold md:text-3xl">
                    Import Questions from CSV
                </h1>
                <p className="mt-2 text-sm muted-text">
                    Upload a CSV file to import interview, scenario, and quiz questions
                    into the database. Existing questions with the same ID will be updated.
                </p>
            </div>

            {/* Drop zone */}
            <div
                onDragOver={(e) => {
                    e.preventDefault()
                    setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`surface-card p-10 text-center cursor-pointer transition-all duration-200 ${dragging
                        ? 'border-2 border-dashed !border-[var(--primary)] bg-[color-mix(in_oklab,var(--primary)_8%,var(--card))]'
                        : 'border-2 border-dashed'
                    }`}
                onClick={() => document.getElementById('csv-input')?.click()}
            >
                <input
                    id="csv-input"
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={onFileInput}
                />

                <div className="text-4xl mb-3">📄</div>

                {loading ? (
                    <p className="text-lg font-semibold animate-pulse">
                        Importing {fileName}...
                    </p>
                ) : (
                    <>
                        <p className="text-lg font-semibold">
                            Drag & drop CSV file here, or click to browse
                        </p>
                        <p className="text-sm muted-text mt-1">
                            Required columns: id, day, type, prompt
                        </p>
                    </>
                )}
            </div>

            {/* Results */}
            {result && (
                <div className="surface-card p-5 space-y-4">
                    {result.error && !result.success && (
                        <div className="p-4 rounded-xl bg-[color-mix(in_oklab,var(--danger)_14%,var(--card))] text-[var(--danger)]">
                            <p className="font-semibold">❌ Error</p>
                            <p className="mt-1">{result.error}</p>
                        </div>
                    )}

                    {result.success && (
                        <>
                            <div className="p-4 rounded-xl bg-[color-mix(in_oklab,var(--success)_14%,var(--card))]">
                                <p className="font-semibold text-[var(--success)]">
                                    ✅ Import Successful
                                </p>
                                <div className="mt-2 grid grid-cols-3 gap-4 text-center">
                                    <div>
                                        <p className="text-2xl font-bold">{result.inserted}</p>
                                        <p className="text-xs muted-text">Imported</p>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">{result.skipped}</p>
                                        <p className="text-xs muted-text">Skipped</p>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">{result.errors}</p>
                                        <p className="text-xs muted-text">Errors</p>
                                    </div>
                                </div>
                            </div>

                            {result.breakdown && (
                                <div>
                                    <h3 className="font-semibold mb-2">📊 Breakdown</h3>
                                    <div className="grid gap-1">
                                        {Object.entries(result.breakdown)
                                            .sort(([a], [b]) => a.localeCompare(b))
                                            .map(([key, count]) => (
                                                <div
                                                    key={key}
                                                    className="flex justify-between px-3 py-1.5 rounded-lg bg-[var(--bg-soft)] text-sm"
                                                >
                                                    <span>{key}</span>
                                                    <span className="font-semibold">{count}</span>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}

                            {result.errorMessages && result.errorMessages.length > 0 && (
                                <div className="p-4 rounded-xl bg-[color-mix(in_oklab,var(--danger)_14%,var(--card))]">
                                    <p className="font-semibold text-[var(--danger)]">
                                        ⚠️ Some batches failed:
                                    </p>
                                    <ul className="mt-1 text-sm list-disc pl-5">
                                        {result.errorMessages.map((msg, i) => (
                                            <li key={i}>{msg}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* CSV format guide */}
            <div className="surface-card p-5">
                <h3 className="font-semibold mb-2">📋 Expected CSV Format</h3>
                <div className="text-sm muted-text space-y-1">
                    <p>
                        <strong>Required columns:</strong> id, day, type, prompt
                    </p>
                    <p>
                        <strong>Optional columns:</strong> options, correct_answer, answer,
                        difficulty, active, created_at
                    </p>
                    <p>
                        <strong>type</strong> must be: <code>interview</code>,{' '}
                        <code>scenario</code>, or <code>quiz</code>
                    </p>
                    <p>
                        <strong>day</strong> accepts: &quot;Day 1&quot;, &quot;Day 05&quot;,
                        &quot;day11&quot;, &quot;07&quot;, etc.
                    </p>
                    <p>
                        <strong>options</strong> (quiz only): JSON array like{' '}
                        <code>[&quot;A&quot;,&quot;B&quot;,&quot;C&quot;,&quot;D&quot;]</code>
                    </p>
                    <p>
                        Existing questions with the same <strong>id</strong> will be{' '}
                        <strong>updated</strong> (upsert).
                    </p>
                </div>
            </div>
        </div>
    )
}

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { createHash } from 'crypto'

/** Normalise "Day 1", "Day 05", "day11", "07" → number */
function parseDayNumber(raw: string): number | null {
    const cleaned = raw.replace(/^day\s*/i, '').trim()
    const n = parseInt(cleaned, 10)
    return Number.isFinite(n) && n > 0 ? n : null
}

/** Convert "2026-02-24 14:00:00" → ISO 8601 or return null */
function toISO(raw: string): string | null {
    if (!raw) return null
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/)
    if (m) return `${m[1]}T${m[2]}+00:00`
    return null
}

/** Generate deterministic UUID from seed string */
function deterministicId(seed: string): string {
    const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32)
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32),
    ].join('-')
}

/** Minimal RFC-4180 CSV parser */
function parseCSV(text: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let field = ''
    let inQuotes = false
    let i = 0

    while (i < text.length) {
        const ch = text[i]
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < text.length && text[i + 1] === '"') {
                    field += '"'
                    i += 2
                } else {
                    inQuotes = false
                    i++
                }
            } else {
                field += ch
                i++
            }
        } else {
            if (ch === '"') {
                inQuotes = true
                i++
            } else if (ch === ',') {
                row.push(field)
                field = ''
                i++
            } else if (ch === '\r' || ch === '\n') {
                row.push(field)
                field = ''
                if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++
                i++
                if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) {
                    rows.push(row)
                }
                row = []
            } else {
                field += ch
                i++
            }
        }
    }

    row.push(field)
    if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) {
        rows.push(row)
    }
    return rows
}

export async function POST(req: NextRequest) {
    const admin = getSupabaseAdmin()
    if (!admin) {
        return NextResponse.json(
            { error: 'Server not configured (missing service role key)' },
            { status: 500 }
        )
    }

    try {
        const formData = await req.formData()
        const file = formData.get('file') as File | null
        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
        }

        const text = await file.text()
        const allRows = parseCSV(text)

        if (allRows.length < 2) {
            return NextResponse.json(
                { error: 'CSV has no data rows' },
                { status: 400 }
            )
        }

        const headers = allRows[0].map((h) => h.trim().toLowerCase())

        const requiredHeaders = ['id', 'day', 'type', 'prompt']
        const missing = requiredHeaders.filter((h) => !headers.includes(h))
        if (missing.length > 0) {
            return NextResponse.json(
                { error: `Missing required headers: ${missing.join(', ')}` },
                { status: 400 }
            )
        }

        type QRecord = {
            id: string
            day_number: number
            type: string
            prompt: string
            options: string[] | null
            correct_answer: string | null
            difficulty: string | null
            active: boolean
            created_at: string | null
        }

        const records: QRecord[] = []
        let skipped = 0

        for (let i = 1; i < allRows.length; i++) {
            const values = allRows[i]
            const get = (name: string) => {
                const idx = headers.indexOf(name)
                return idx >= 0 && idx < values.length ? values[idx].trim() : ''
            }

            const id = get('id')
            const dayRaw = get('day')
            const type = get('type').toLowerCase()
            const prompt = get('prompt')

            if (!id || !dayRaw || !type || !prompt) {
                skipped++
                continue
            }

            const dayNumber = parseDayNumber(dayRaw)
            if (!dayNumber) {
                skipped++
                continue
            }

            const qNumber = get('_number')
            const finalId = deterministicId(
                `${id}-day${dayNumber}-${type}-${qNumber}`
            )

            let options: string[] | null = null
            const rawOptions = get('options')
            if (rawOptions) {
                try {
                    const parsed = JSON.parse(rawOptions)
                    if (Array.isArray(parsed)) options = parsed
                } catch {
                    if (rawOptions.includes(',')) {
                        options = rawOptions.split(',').map((s) => s.trim())
                    }
                }
            }

            const correctAnswer = get('correct_answer') || null
            const answer = get('answer') || null
            const difficulty = get('difficulty') || null
            const activeRaw = get('active').toUpperCase()
            const active = activeRaw === 'FALSE' ? false : true
            const createdAt = toISO(get('created_at'))
            const finalAnswer = correctAnswer || answer

            records.push({
                id: finalId,
                day_number: dayNumber,
                type,
                prompt,
                options,
                correct_answer: finalAnswer,
                difficulty,
                active,
                created_at: createdAt,
            })
        }

        if (records.length === 0) {
            return NextResponse.json(
                { error: 'No valid rows found in CSV', skipped },
                { status: 400 }
            )
        }

        // Upsert in batches of 100
        const BATCH = 100
        let inserted = 0
        let errors = 0
        const errorMessages: string[] = []

        for (let i = 0; i < records.length; i += BATCH) {
            const batch = records.slice(i, i + BATCH)
            const payload = batch.map((r) => {
                const row: Record<string, unknown> = {
                    id: r.id,
                    day_number: r.day_number,
                    type: r.type,
                    prompt: r.prompt,
                    options: r.options,
                    correct_answer: r.correct_answer,
                    difficulty: r.difficulty,
                    active: r.active,
                }
                if (r.created_at) row.created_at = r.created_at
                return row
            })

            const { error } = await admin
                .from('questions')
                .upsert(payload, { onConflict: 'id' })

            if (error) {
                errors += batch.length
                errorMessages.push(error.message)
            } else {
                inserted += batch.length
            }
        }

        // Compute breakdown
        const breakdown: { [key: string]: number } = {}
        for (const r of records) {
            const key = `Day ${r.day_number} → ${r.type}`
            breakdown[key] = (breakdown[key] || 0) + 1
        }

        return NextResponse.json({
            success: true,
            inserted,
            skipped,
            errors,
            errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
            breakdown,
        })
    } catch (err) {
        console.error('Import error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

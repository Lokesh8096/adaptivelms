/**
 * Clean + Re-import Script
 * Deletes all existing questions rows and re-imports from CSV (fresh slate).
 */
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'

// ---------- env ----------
const dotenvPath = path.resolve(__dirname, '..', '.env')
if (fs.existsSync(dotenvPath)) {
    for (const line of fs.readFileSync(dotenvPath, 'utf-8').split(/\r?\n/)) {
        const t = line.trim()
        if (!t || t.startsWith('#')) continue
        const eq = t.indexOf('=')
        if (eq < 0) continue
        const k = t.slice(0, eq).trim()
        const v = t.slice(eq + 1).trim()
        if (!process.env[k]) process.env[k] = v
    }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('❌ Missing env vars')
    process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
})

// ---------- helpers ----------
function parseDayNumber(raw: string): number | null {
    const cleaned = raw.replace(/^day\s*/i, '').trim()
    const n = parseInt(cleaned, 10)
    return Number.isFinite(n) && n > 0 ? n : null
}

function toISO(raw: string): string | null {
    if (!raw) return null
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/)
    if (m) return `${m[1]}T${m[2]}+00:00`
    return null
}

function deterministicId(seed: string): string {
    const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32)
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-')
}

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
                if (i + 1 < text.length && text[i + 1] === '"') { field += '"'; i += 2 }
                else { inQuotes = false; i++ }
            } else { field += ch; i++ }
        } else {
            if (ch === '"') { inQuotes = true; i++ }
            else if (ch === ',') { row.push(field); field = ''; i++ }
            else if (ch === '\r' || ch === '\n') {
                row.push(field); field = ''
                if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++
                i++
                if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) rows.push(row)
                row = []
            } else { field += ch; i++ }
        }
    }
    row.push(field)
    if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) rows.push(row)
    return rows
}

// ---------- main ----------
async function main() {
    const csvPath = process.argv[2] || path.resolve(__dirname, '..', 'data', 'dayone.csv')
    if (!fs.existsSync(csvPath)) { console.error(`❌ File not found: ${csvPath}`); process.exit(1) }

    // Step 1: Delete all existing questions
    console.log('🗑️  Deleting all existing questions...')
    // Delete in chunks (supabase requires a filter)
    const { count: existingCount } = await supabase.from('questions').select('*', { count: 'exact', head: true })
    console.log(`   Found ${existingCount ?? 0} existing rows`)

    if ((existingCount ?? 0) > 0) {
        // Use a filter that matches everything (id is never null)
        const { error: delError } = await supabase.from('questions').delete().not('id', 'is', null)
        if (delError) {
            console.error('❌ Delete failed:', delError.message)
            console.log('   Continuing with import anyway (upsert will overwrite duplicates)...')
        } else {
            console.log('   ✓ All existing rows deleted')
        }
    }

    // Step 2: Parse CSV
    console.log(`\n📄 Reading: ${csvPath}`)
    const raw = fs.readFileSync(csvPath, 'utf-8')
    const allRows = parseCSV(raw)
    const headers = allRows[0].map((h) => h.trim().toLowerCase())
    console.log(`📋 Headers: ${headers.join(', ')}`)

    type QRow = {
        id: string; day_number: number; type: string; prompt: string
        options: string[] | null; correct_answer: string | null
        difficulty: string | null; active: boolean; created_at: string | null
    }

    const records: QRow[] = []
    let skipped = 0

    for (let i = 1; i < allRows.length; i++) {
        const vals = allRows[i]
        const get = (name: string) => {
            const idx = headers.indexOf(name)
            return idx >= 0 && idx < vals.length ? vals[idx].trim() : ''
        }
        const id = get('id'), dayRaw = get('day'), type = get('type').toLowerCase(), prompt = get('prompt')
        if (!id || !dayRaw || !type || !prompt) { skipped++; continue }
        const dayNumber = parseDayNumber(dayRaw)
        if (!dayNumber) { skipped++; continue }

        const qNum = get('_number')
        const finalId = deterministicId(`${id}-day${dayNumber}-${type}-${qNum}`)

        let options: string[] | null = null
        const rawOpts = get('options')
        if (rawOpts) {
            try {
                const p = JSON.parse(rawOpts)
                if (Array.isArray(p)) options = p
            } catch { /* ignore */ }
        }

        const correctAnswer = get('correct_answer') || null
        const answer = get('answer') || null
        const finalAnswer = correctAnswer || answer

        records.push({
            id: finalId,
            day_number: dayNumber,
            type,
            prompt,
            options,
            correct_answer: finalAnswer,
            difficulty: get('difficulty') || null,
            active: get('active').toUpperCase() !== 'FALSE',
            created_at: toISO(get('created_at')),
        })
    }

    console.log(`✅ Parsed ${records.length} valid rows (${skipped} skipped)`)

    // Step 3: Breakdown
    const dayTypes = new Map<string, number>()
    for (const r of records) {
        const k = `Day ${String(r.day_number).padStart(2, '0')} → ${r.type}`
        dayTypes.set(k, (dayTypes.get(k) || 0) + 1)
    }
    console.log('\n📊 Breakdown:')
    for (const [k, v] of [...dayTypes.entries()].sort()) console.log(`   ${k}: ${v}`)

    // Step 4: Insert in batches
    const BATCH = 100
    let inserted = 0, errors = 0
    for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH)
        const payload = batch.map((r) => {
            const row: Record<string, unknown> = {
                id: r.id, day_number: r.day_number, type: r.type, prompt: r.prompt,
                options: r.options, correct_answer: r.correct_answer,
                difficulty: r.difficulty, active: r.active,
            }
            if (r.created_at) row.created_at = r.created_at
            return row
        })
        const { error } = await supabase.from('questions').insert(payload)
        if (error) {
            console.error(`❌ Batch ${i / BATCH + 1} failed:`, error.message)
            errors += batch.length
        } else {
            inserted += batch.length
            console.log(`   ✓ Batch ${i / BATCH + 1}: ${batch.length} rows`)
        }
    }

    console.log(`\n🎯 Done! Inserted: ${inserted}, Errors: ${errors}`)
}

main().catch((e) => { console.error(e); process.exit(1) })

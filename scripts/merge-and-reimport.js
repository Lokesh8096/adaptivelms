/**
 * Merge dayone.csv + "dayone 1.csv" and reimport into Supabase questions table.
 * Deduplicates by deterministic ID so overlapping rows are not double-inserted.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// ---------- Load .env ----------
const dotenvPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(dotenvPath)) {
    for (const line of fs.readFileSync(dotenvPath, 'utf-8').split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq < 0) continue;
        const k = t.slice(0, eq).trim();
        const v = t.slice(eq + 1).trim();
        if (!process.env[k]) process.env[k] = v;
    }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

// ---------- Helpers ----------
function parseDayNumber(raw) {
    const cleaned = raw.replace(/^day\s*/i, '').trim();
    const n = parseInt(cleaned, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function toISO(raw) {
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw;
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/);
    if (m) return `${m[1]}T${m[2]}+00:00`;
    return null;
}

function deterministicId(seed) {
    const hex = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32);
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}

function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < text.length && text[i + 1] === '"') { field += '"'; i += 2; }
                else { inQuotes = false; i++; }
            } else { field += ch; i++; }
        } else {
            if (ch === '"') { inQuotes = true; i++; }
            else if (ch === ',') { row.push(field); field = ''; i++; }
            else if (ch === '\r' || ch === '\n') {
                row.push(field); field = '';
                if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
                i++;
                if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) rows.push(row);
                row = [];
            } else { field += ch; i++; }
        }
    }
    row.push(field);
    if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) rows.push(row);
    return rows;
}

function parseFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.warn(`   ⚠️  File not found, skipping: ${filePath}`);
        return [];
    }
    console.log(`   📄 Reading: ${filePath}`);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const allRows = parseCSV(raw);
    const headers = allRows[0].map((h) => h.trim().toLowerCase());

    const records = [];
    let skipped = 0;

    for (let i = 1; i < allRows.length; i++) {
        const vals = allRows[i];
        const get = (name) => {
            const idx = headers.indexOf(name);
            return idx >= 0 && idx < vals.length ? vals[idx].trim() : '';
        };

        const id = get('id');
        const dayRaw = get('day');
        const type = get('type').toLowerCase();
        const prompt = get('prompt');

        if (!id || !dayRaw || !type || !prompt) { skipped++; continue; }
        const dayNumber = parseDayNumber(dayRaw);
        if (!dayNumber) { skipped++; continue; }

        const qNum = get('_number');
        const finalId = deterministicId(`${id}-day${dayNumber}-${type}-${qNum}`);

        let options = null;
        const rawOpts = get('options');
        if (rawOpts) {
            try {
                const p = JSON.parse(rawOpts);
                if (Array.isArray(p)) options = p;
            } catch { /* ignore */ }
        }

        const correctAnswer = get('correct_answer') || null;
        const answer = get('answer') || null;
        const finalAnswer = correctAnswer || answer;

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
        });

        if (skipped) {/* reported below */ }
    }

    console.log(`      → ${records.length} valid rows parsed (${skipped} skipped)`);
    return records;
}

// ---------- Main ----------
async function main() {
    const dataDir = path.resolve(__dirname, '..', 'data');
    const files = [
        path.join(dataDir, 'dayone.csv'),
        path.join(dataDir, 'dayone 1.csv'),
    ];

    console.log('\n📂 Parsing CSV files...');
    const allRecords = [];
    for (const f of files) {
        const recs = parseFile(f);
        allRecords.push(...recs);
    }

    // Deduplicate by ID (keep first occurrence)
    const seen = new Set();
    const dedupedRecords = [];
    let dupes = 0;
    for (const r of allRecords) {
        if (seen.has(r.id)) { dupes++; continue; }
        seen.add(r.id);
        dedupedRecords.push(r);
    }

    console.log(`\n✅ Total after merge: ${dedupedRecords.length} unique rows (${dupes} duplicates removed)`);

    // Breakdown
    const dayTypes = new Map();
    const dayNums = new Set();
    for (const r of dedupedRecords) {
        dayNums.add(r.day_number);
        const k = `Day ${String(r.day_number).padStart(2, '0')} → ${r.type}`;
        dayTypes.set(k, (dayTypes.get(k) || 0) + 1);
    }
    console.log('\n📊 Breakdown by day & type:');
    for (const [k, v] of [...dayTypes.entries()].sort()) {
        console.log(`   ${k}: ${v}`);
    }
    const sorted = [...dayNums].sort((a, b) => a - b);
    console.log(`\n   Days covered: ${sorted.join(', ')}`);
    for (let i = 1; i <= sorted[sorted.length - 1]; i++) {
        if (!sorted.includes(i)) console.log(`   ⚠️  Missing Day ${i} (may be recap-only)`);
    }

    // Step 1: Delete all existing questions
    console.log('\n🗑️  Deleting all existing questions...');
    const { count: existingCount } = await supabase.from('questions').select('*', { count: 'exact', head: true });
    console.log(`   Found ${existingCount ?? 0} existing rows`);

    if ((existingCount ?? 0) > 0) {
        const { error: delError } = await supabase.from('questions').delete().not('id', 'is', null);
        if (delError) {
            console.error('❌ Delete failed:', delError.message);
            console.log('   Continuing with upsert anyway...');
        } else {
            console.log('   ✓ All existing rows deleted');
        }
    }

    // Step 2: Insert in batches
    console.log('\n⬆️  Inserting records...');
    const BATCH = 100;
    let inserted = 0, errors = 0;

    for (let i = 0; i < dedupedRecords.length; i += BATCH) {
        const batch = dedupedRecords.slice(i, i + BATCH);
        const payload = batch.map((r) => {
            const row = {
                id: r.id,
                day_number: r.day_number,
                type: r.type,
                prompt: r.prompt,
                options: r.options,
                correct_answer: r.correct_answer,
                difficulty: r.difficulty,
                active: r.active,
            };
            if (r.created_at) row.created_at = r.created_at;
            return row;
        });

        const { error } = await supabase.from('questions').insert(payload);
        if (error) {
            console.error(`   ❌ Batch ${Math.floor(i / BATCH) + 1} failed:`, error.message);
            errors += batch.length;
        } else {
            inserted += batch.length;
            console.log(`   ✓ Batch ${Math.floor(i / BATCH) + 1}: ${batch.length} rows inserted`);
        }
    }

    console.log(`\n🎯 Done! Inserted: ${inserted}, Errors: ${errors}`);
    if (errors === 0) console.log('✅ All data from both CSV files is now in Supabase!');
}

main().catch((e) => { console.error(e); process.exit(1); });

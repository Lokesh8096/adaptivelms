const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

// Load .env manually
const envFile = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
envFile.split('\n').forEach((line) => {
    const eq = line.indexOf('=');
    if (eq > 0) {
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
        env[k] = v;
    }
});

const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
);

function toISO(val) {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
}

function makeId(id, day, type, num) {
    const seed = `${id}-day${day}-${type}-${num}`;
    const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32);
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32),
    ].join('-');
}

// Simple CSV parser that handles quoted fields
function splitCSV(line) {
    const result = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQ && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQ = !inQ;
            }
        } else if (ch === ',' && !inQ) {
            result.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    result.push(cur);
    return result;
}

const headers = [
    'id', 'day', 'type', '_number', 'prompt',
    'options', 'correct_answer', 'answer',
    'difficulty', 'active', 'created_at',
];

async function main() {
    const csv = fs.readFileSync(path.join(__dirname, '..', 'data', 'dayone.csv'), 'utf8');
    const allLines = csv.split('\n').map((l) => l.replace(/\r$/, ''));

    // Filter only Day 3 rows (skip header and blank lines)
    const day3Lines = allLines.filter((l) => {
        if (!l.trim()) return false;
        const cols = splitCSV(l);
        const day = (cols[1] || '').trim().toLowerCase().replace(/[^0-9]/g, '');
        return day === '3';
    });

    console.log(`Found ${day3Lines.length} Day 3 rows`);

    const records = day3Lines.map((line) => {
        const cols = splitCSV(line);
        const r = {};
        headers.forEach((h, i) => (r[h] = (cols[i] || '').trim()));

        const finalId = makeId(r.id, 3, r.type, r['_number']);

        let options = null;
        if (r.options) {
            try {
                options = JSON.parse(r.options);
            } catch (e) { }
        }

        const finalAnswer = r.correct_answer || r.answer || null;

        const row = {
            id: finalId,
            day_number: 3,
            type: r.type,
            prompt: r.prompt,
            options,
            correct_answer: finalAnswer,
            difficulty: r.difficulty || null,
            active: r.active.toUpperCase() !== 'FALSE',
        };

        const ts = toISO(r.created_at);
        if (ts) row.created_at = ts;

        return row;
    });

    console.log(`Upserting ${records.length} records into Supabase...`);

    const { error } = await supabase
        .from('questions')
        .upsert(records, { onConflict: 'id' });

    if (error) {
        console.error('Error:', error.message);
        console.error('Details:', error.details);
    } else {
        console.log(`✅ Done! Inserted/updated ${records.length} Day 3 questions.`);
    }
}

main().catch(console.error);

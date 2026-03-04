const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env
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

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
    // Total count
    const { count: total } = await supabase.from('questions').select('*', { count: 'exact', head: true });
    console.log('Total rows in questions table:', total);

    // Group by day_number and type
    const { data, error } = await supabase
        .from('questions')
        .select('day_number, type')
        .order('day_number', { ascending: true });

    if (error) { console.error('Error:', error.message); process.exit(1); }

    const counts = {};
    for (const row of data) {
        const k = `Day ${String(row.day_number).padStart(2, '0')} - ${row.type}`;
        counts[k] = (counts[k] || 0) + 1;
    }

    console.log('\nBreakdown:');
    for (const [k, v] of Object.entries(counts).sort()) {
        console.log(`  ${k}: ${v}`);
    }

    const days = [...new Set(data.map(r => r.day_number))].sort((a, b) => a - b);
    console.log('\nDays in DB:', days.join(', '));
    console.log('Total unique days:', days.length);
}

main().catch(console.error);


const fs = require('fs');
const path = require('path');

const csvPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'data', 'dayone.csv');
const text = fs.readFileSync(csvPath, 'utf-8');
console.log('File:', csvPath);

// Simple CSV parser (handles quoted fields)
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

const allRows = parseCSV(text);
const headers = allRows[0].map(h => h.trim().toLowerCase());
console.log('Headers:', headers.join(', '));

const dayIdx = headers.indexOf('day');
const typeIdx = headers.indexOf('type');
const numIdx = headers.indexOf('_number');

const dayTypeCounts = {};
const dayNumbers = new Set();

for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i];
    if (!row || row.length < 3) continue;
    const dayRaw = row[dayIdx] ? row[dayIdx].trim() : '';
    const type = row[typeIdx] ? row[typeIdx].trim().toLowerCase() : '';

    if (!dayRaw || !type) continue;

    // Parse day number
    const cleaned = dayRaw.replace(/^day\s*/i, '').trim();
    const n = parseInt(cleaned, 10);
    if (!Number.isFinite(n) || n <= 0) continue;

    dayNumbers.add(n);
    const key = `Day ${String(n).padStart(2, '0')} -> ${type}`;
    dayTypeCounts[key] = (dayTypeCounts[key] || 0) + 1;
}

console.log('\nDay numbers found:', [...dayNumbers].sort((a, b) => a - b).join(', '));
console.log('\nBreakdown by day and type:');
for (const [k, v] of Object.entries(dayTypeCounts).sort()) {
    console.log(`  ${k}: ${v}`);
}

// Check for any issues
const sorted = [...dayNumbers].sort((a, b) => a - b);
console.log('\nTotal unique days:', sorted.length);
for (let i = 1; i <= sorted[sorted.length - 1]; i++) {
    if (!sorted.includes(i)) console.log(`  ⚠️  Missing Day ${i}`);
}

/**
 * CSV Import Script for Questions
 *
 * Usage:
 *   npx tsx scripts/import-csv.ts [path-to-csv]
 *
 * If no path is given, defaults to data/dayone.csv
 *
 * Requires these env vars (reads from .env automatically):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";

// ---------- env ----------
const dotenvPath = path.resolve(__dirname, "..", ".env");
if (fs.existsSync(dotenvPath)) {
    const envContent = fs.readFileSync(dotenvPath, "utf-8");
    for (const line of envContent.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx < 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
    }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error(
        "❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env"
    );
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

// ---------- helpers ----------

/** Normalise "Day 1", "Day 05", "day11", "07", "Day 10" → number */
function parseDayNumber(raw: string): number | null {
    const cleaned = raw.replace(/^day\s*/i, "").trim();
    const n = parseInt(cleaned, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** Minimal RFC-4180 CSV parser (handles quoted fields with commas and newlines) */
function parseCSV(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    let i = 0;

    while (i < text.length) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < text.length && text[i + 1] === '"') {
                    field += '"';
                    i += 2;
                } else {
                    inQuotes = false;
                    i++;
                }
            } else {
                field += ch;
                i++;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
                i++;
            } else if (ch === ",") {
                row.push(field);
                field = "";
                i++;
            } else if (ch === "\r" || ch === "\n") {
                row.push(field);
                field = "";
                if (ch === "\r" && i + 1 < text.length && text[i + 1] === "\n") i++;
                i++;
                if (row.length > 1 || (row.length === 1 && row[0].trim() !== "")) {
                    rows.push(row);
                }
                row = [];
            } else {
                field += ch;
                i++;
            }
        }
    }

    // last field / row
    row.push(field);
    if (row.length > 1 || (row.length === 1 && row[0].trim() !== "")) {
        rows.push(row);
    }

    return rows;
}

type QuestionRow = {
    id: string;
    day_number: number;
    type: string;
    prompt: string;
    options: string[] | null;
    correct_answer: string | null;
    difficulty: string | null;
    active: boolean;
    created_at: string | null;
};

/** Convert "2026-02-24 14:00:00" → ISO 8601 or return null */
function toISO(raw: string): string | null {
    if (!raw) return null;
    // Already ISO?
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw;
    // "YYYY-MM-DD HH:MM:SS" → append T and Z
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/);
    if (m) return `${m[1]}T${m[2]}+00:00`;
    return null; // unrecognised → skip
}

function buildRow(headers: string[], values: string[]): QuestionRow | null {
    const get = (name: string) => {
        const idx = headers.indexOf(name);
        return idx >= 0 && idx < values.length ? values[idx].trim() : "";
    };

    const id = get("id");
    const dayRaw = get("day");
    const type = get("type").toLowerCase();
    const prompt = get("prompt");

    if (!id || !dayRaw || !type || !prompt) return null;

    const dayNumber = parseDayNumber(dayRaw);
    if (!dayNumber) return null;

    const qNumber = get("_number");

    // Generate a deterministic unique ID from id + day + type + number
    // This handles CSVs where the same UUID is reused across different days
    const uniqueSeed = `${id}-day${dayNumber}-${type}-${qNumber}`;
    const uniqueId = createHash("sha256")
        .update(uniqueSeed)
        .digest("hex")
        .slice(0, 32);
    // Format as UUID v4-like: 8-4-4-4-12
    const finalId = [
        uniqueId.slice(0, 8),
        uniqueId.slice(8, 12),
        uniqueId.slice(12, 16),
        uniqueId.slice(16, 20),
        uniqueId.slice(20, 32),
    ].join("-");

    // Parse options (JSON array like ["A","B","C","D"])
    let options: string[] | null = null;
    const rawOptions = get("options");
    if (rawOptions) {
        try {
            const parsed = JSON.parse(rawOptions);
            if (Array.isArray(parsed)) options = parsed;
        } catch {
            // If parsing fails, try reading as comma-separated values
            if (rawOptions.includes(",")) {
                options = rawOptions.split(",").map((s) => s.trim());
            }
        }
    }

    const correctAnswer = get("correct_answer") || null;
    const answer = get("answer") || null;
    const difficulty = get("difficulty") || null;
    const activeRaw = get("active").toUpperCase();
    const active = activeRaw === "FALSE" ? false : true;
    const createdAt = toISO(get("created_at"));

    // For interview/scenario: answer column has the explanation → use as correct_answer
    // For quiz: correct_answer has the short answer ("CPU"), answer has explanation
    const finalAnswer = correctAnswer || answer;

    return {
        id: finalId,
        day_number: dayNumber,
        type,
        prompt,
        options,
        correct_answer: finalAnswer,
        difficulty,
        active,
        created_at: createdAt,
    };
}

// ---------- main ----------

async function main() {
    const csvPath =
        process.argv[2] ||
        path.resolve(__dirname, "..", "data", "dayone.csv");

    if (!fs.existsSync(csvPath)) {
        console.error(`❌ File not found: ${csvPath}`);
        process.exit(1);
    }

    console.log(`📄 Reading: ${csvPath}`);
    const raw = fs.readFileSync(csvPath, "utf-8");
    const allRows = parseCSV(raw);

    if (allRows.length < 2) {
        console.error("❌ CSV has no data rows");
        process.exit(1);
    }

    const headers = allRows[0].map((h) => h.trim().toLowerCase());
    console.log(`📋 Headers: ${headers.join(", ")}`);

    const records: QuestionRow[] = [];
    let skipped = 0;

    for (let i = 1; i < allRows.length; i++) {
        const row = buildRow(headers, allRows[i]);
        if (row) {
            records.push(row);
        } else {
            skipped++;
        }
    }

    console.log(`✅ Parsed ${records.length} valid rows (${skipped} skipped)`);

    if (records.length === 0) {
        console.log("Nothing to import.");
        return;
    }

    // Group stats
    const dayTypes = new Map<string, number>();
    for (const r of records) {
        const key = `Day ${r.day_number} → ${r.type}`;
        dayTypes.set(key, (dayTypes.get(key) || 0) + 1);
    }
    console.log("\n📊 Breakdown:");
    for (const [key, count] of [...dayTypes.entries()].sort()) {
        console.log(`   ${key}: ${count}`);
    }

    // Upsert in batches of 100
    const BATCH = 100;
    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
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
            };
            // Only include created_at if it's a valid timestamp
            if (r.created_at) row.created_at = r.created_at;
            return row;
        });

        const { error } = await supabase
            .from("questions")
            .upsert(payload, { onConflict: "id" });

        if (error) {
            console.error(
                `❌ Batch ${i / BATCH + 1} failed:`,
                error.message,
                "\n   Details:",
                error.details,
                "\n   Hint:",
                error.hint
            );
            // Log first row in the failing batch for debugging
            console.error("   Sample row:", JSON.stringify(payload[0], null, 2));
            errors += batch.length;
        } else {
            inserted += batch.length;
            console.log(`   ✓ Batch ${i / BATCH + 1}: ${batch.length} rows`);
        }
    }

    console.log(`\n🎯 Done! Inserted/updated: ${inserted}, Errors: ${errors}`);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});

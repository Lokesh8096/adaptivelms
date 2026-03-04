import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

function main() {
    const env = fs.readFileSync('.env', 'utf-8')
    const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim() ?? ''
    const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim() ?? ''
    const sb = createClient(url, key)

    sb.from('questions')
        .select('day_number, type, active, prompt')
        .eq('active', true)
        .order('day_number')
        .order('type')
        .limit(1000)
        .then(({ data, error }) => {
            if (error) { console.error('Error:', error.message); return }

            const counts: Record<string, number> = {}
            for (const r of data ?? []) {
                const k = `Day ${String(r.day_number).padStart(2, '0')} | ${r.type}`
                counts[k] = (counts[k] || 0) + 1
            }

            console.log('\n✅ Questions per Day in Supabase:')
            console.log('─'.repeat(35))
            for (const [k, v] of Object.entries(counts).sort()) {
                const status = v === 10 ? '✓' : v === 7 ? '~' : '⚠'
                console.log(`  ${status} ${k}: ${v}`)
            }
            console.log('─'.repeat(35))
            console.log(`  Total: ${data?.length ?? 0} rows`)

            // Show sample Day 1 interview question
            const sample = data?.find(r => r.day_number === 1 && r.type === 'interview')
            if (sample) {
                console.log('\n📝 Sample Day 1 Interview question:')
                console.log(' ', sample.prompt.slice(0, 80) + '...')
            }
        })
}

main()

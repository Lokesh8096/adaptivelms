'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────
type SprintEntry = { rank: number; name: string; score: number; quizScore: number; practiceScore: number }
type SprintInfo = { sprint: number; startDay: number; endDay: number }

type LeaderboardData = {
    sprintLeaderboard: Record<number, SprintEntry[]>
    availableSprints: SprintInfo[]
}

// ── Medal colors ──────────────────────────────────────────────────────
const MEDAL: Record<number, { bg: string; text: string; icon: string }> = {
    1: { bg: 'linear-gradient(135deg,#fbbf24,#f59e0b)', text: '#fff', icon: '🥇' },
    2: { bg: 'linear-gradient(135deg,#94a3b8,#64748b)', text: '#fff', icon: '🥈' },
    3: { bg: 'linear-gradient(135deg,#cd7c4f,#b45309)', text: '#fff', icon: '🥉' },
}

function RankBadge({ rank }: { rank: number }) {
    const medal = MEDAL[rank]
    if (medal) {
        return (
            <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '2rem', height: '2rem', borderRadius: '50%',
                background: medal.bg, color: medal.text,
                fontSize: '1rem', fontWeight: 800, flexShrink: 0,
            }}>
                {medal.icon}
            </span>
        )
    }
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '2rem', height: '2rem', borderRadius: '50%',
            background: 'var(--bg-soft)', color: 'var(--muted)',
            fontSize: '0.78rem', fontWeight: 700, flexShrink: 0,
        }}>
            {rank}
        </span>
    )
}

// ── Sprint Dropdown ───────────────────────────────────────────────────
function SprintDropdown({
    sprints,
    selectedSprint,
    onSelect,
}: {
    sprints: SprintInfo[]
    selectedSprint: number | null
    onSelect: (sprint: number) => void
}) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    const selected = sprints.find((s) => s.sprint === selectedSprint)

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    return (
        <div ref={ref} style={{ position: 'relative', display: 'inline-block', minWidth: '220px' }}>
            {/* Trigger button */}
            <button
                id="lb-sprint-dropdown-trigger"
                onClick={() => setOpen((o) => !o)}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '0.5rem 1rem', fontWeight: 700, fontSize: '0.88rem',
                    borderRadius: '0.6rem', cursor: 'pointer',
                    border: '1.5px solid rgba(124,58,237,0.5)',
                    background: 'rgba(124,58,237,0.1)',
                    color: '#a78bfa',
                    transition: 'all 0.2s',
                    gap: '0.5rem',
                }}
            >
                <span>
                    🚀{' '}
                    {selected
                        ? `Sprint ${selected.sprint} (Days ${selected.startDay}–${selected.endDay})`
                        : 'Select Sprint'}
                </span>
                <span style={{
                    fontSize: '0.7rem', transition: 'transform 0.2s',
                    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                }}>▼</span>
            </button>

            {/* Dropdown menu */}
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                    background: 'var(--bg-card, #1e1e2e)', border: '1.5px solid rgba(124,58,237,0.35)',
                    borderRadius: '0.6rem', boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                    zIndex: 100, overflow: 'hidden',
                }}>
                    {sprints.length === 0 ? (
                        <div style={{ padding: '0.75rem 1rem', fontSize: '0.82rem', opacity: 0.6, fontStyle: 'italic' }}>
                            No sprint data available yet.
                        </div>
                    ) : (
                        sprints.map((s) => {
                            const isSelected = s.sprint === selectedSprint
                            return (
                                <button
                                    key={s.sprint}
                                    id={`lb-sprint-${s.sprint}`}
                                    onClick={() => { onSelect(s.sprint); setOpen(false) }}
                                    style={{
                                        display: 'block', width: '100%', textAlign: 'left',
                                        padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: isSelected ? 700 : 500,
                                        background: isSelected ? 'rgba(124,58,237,0.18)' : 'transparent',
                                        color: isSelected ? '#a78bfa' : 'inherit',
                                        border: 'none', cursor: 'pointer',
                                        borderLeft: isSelected ? '3px solid #7c3aed' : '3px solid transparent',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(124,58,237,0.08)' }}
                                    onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                                >
                                    Sprint {s.sprint}
                                    <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', opacity: 0.65 }}>
                                        (Days {s.startDay}–{s.endDay})
                                    </span>
                                </button>
                            )
                        })
                    )}
                </div>
            )}
        </div>
    )
}

// ── Main Component ────────────────────────────────────────────────────
export default function LeaderboardView({ currentUserName }: { currentUserName?: string }) {
    const [data, setData] = useState<LeaderboardData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [selectedSprint, setSelectedSprint] = useState<number | null>(null)

    const fetchLeaderboard = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const { data: sessionData } = await supabase.auth.getSession()
            const token = sessionData.session?.access_token
            if (!token) { setError('Session expired. Please log in again.'); return }

            const res = await fetch('/api/leaderboard', {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (!res.ok) {
                const body = await res.json().catch(() => ({})) as { error?: string }
                setError(body.error ?? 'Failed to load leaderboard.')
                return
            }
            const json = await res.json() as LeaderboardData
            setData(json)

            // Auto-select first available sprint
            if (json.availableSprints.length > 0) setSelectedSprint(json.availableSprints[0].sprint)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load leaderboard.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { void fetchLeaderboard() }, [fetchLeaderboard])

    const displayEntries = useMemo(() => {
        if (!data || selectedSprint === null) return []
        return data.sprintLeaderboard[selectedSprint] ?? []
    }, [data, selectedSprint])

    // ── Render ────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '2.5rem', color: 'var(--muted)' }}>
                <span style={{
                    display: 'inline-block', width: '1.25rem', height: '1.25rem',
                    border: '2px solid currentColor', borderTopColor: 'transparent',
                    borderRadius: '50%', animation: 'lb-spin 0.8s linear infinite',
                }} />
                Loading leaderboard…
                <style>{`@keyframes lb-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        )
    }

    if (error) {
        return (
            <div style={{
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '0.75rem', color: '#ef4444', padding: '1rem',
            }}>
                {error}
            </div>
        )
    }

    if (!data) return null

    const noSprints = data.availableSprints.length === 0

    return (
        <div className="space-y-6">
            {/* ── Header ── */}
            <div style={{
                background: 'linear-gradient(135deg,#4f46e5 0%,#7c3aed 55%,#a855f7 100%)',
                borderRadius: '1rem', padding: '1.75rem 2rem',
                color: '#fff', position: 'relative', overflow: 'hidden',
            }}>
                {/* decorative circles */}
                <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: '-20px', right: '80px', width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', position: 'relative' }}>
                    <span style={{ fontSize: '2.5rem', lineHeight: 1 }}>🏆</span>
                    <div>
                        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>Leaderboard</h1>
                        <p style={{ margin: '0.25rem 0 0', opacity: 0.85, fontSize: '0.88rem' }}>
                            Sprint rankings based on first-attempt quiz &amp; practice box scores
                        </p>
                    </div>
                    <button
                        id="leaderboard-refresh"
                        onClick={() => void fetchLeaderboard()}
                        style={{
                            marginLeft: 'auto', padding: '0.4rem 0.9rem', fontSize: '0.78rem', fontWeight: 600,
                            borderRadius: '0.5rem', border: '1.5px solid rgba(255,255,255,0.4)',
                            background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer',
                            backdropFilter: 'blur(4px)', transition: 'background 0.2s',
                            flexShrink: 0,
                        }}
                    >
                        ↻ Refresh
                    </button>
                </div>
            </div>

            {/* ── Sprint Dropdown ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                {noSprints ? (
                    <p style={{ fontSize: '0.85rem', opacity: 0.6, fontStyle: 'italic' }}>No sprint data available yet.</p>
                ) : (
                    <SprintDropdown
                        sprints={data.availableSprints}
                        selectedSprint={selectedSprint}
                        onSelect={setSelectedSprint}
                    />
                )}
            </div>

            {/* ── Score note ── */}
            <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                background: 'rgba(168,85,247,0.08)', borderLeft: '3px solid #a855f7',
                borderRadius: '0 0.5rem 0.5rem 0', padding: '0.6rem 0.9rem', fontSize: '0.78rem',
            }}>
                <span>ℹ️</span>
                <span>
                    Sprint score = <strong>sum of daily first-attempt quiz scores</strong> + <strong>Practice Box first-attempt %</strong>
                </span>
            </div>

            {/* ── Table ── */}
            <LeaderboardTable entries={displayEntries} currentUserName={currentUserName} />

            <style>{`@keyframes lb-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    )
}

// ── Table sub-component ───────────────────────────────────────────────
function LeaderboardTable({
    entries,
    currentUserName,
}: {
    entries: SprintEntry[]
    currentUserName?: string
}) {
    if (entries.length === 0) {
        return (
            <div style={{
                background: 'var(--bg-soft)', borderRadius: '1rem',
                padding: '3rem', textAlign: 'center', opacity: 0.6, fontStyle: 'italic',
            }}>
                No rankings available for the selected sprint.
            </div>
        )
    }

    return (
        <div className="surface-card overflow-hidden" style={{ borderRadius: '1rem' }}>
            {/* Top 3 podium cards */}
            {entries.length >= 1 && (
                <div style={{
                    display: 'flex', gap: '0.75rem', padding: '1.25rem 1.5rem 0',
                    flexWrap: 'wrap',
                }}>
                    {entries.slice(0, 3).map((e, i) => {
                        const isSelf = currentUserName && e.name === currentUserName
                        const medal = MEDAL[e.rank]
                        return (
                            <div key={i} style={{
                                flex: '1 1 140px', borderRadius: '0.875rem',
                                background: medal ? 'linear-gradient(135deg,rgba(79,70,229,0.10),rgba(124,58,237,0.06))' : 'var(--bg-soft)',
                                border: isSelf ? '2px solid #4f46e5' : '1.5px solid var(--border, #e5e7eb)',
                                padding: '1rem', textAlign: 'center',
                                boxShadow: i === 0 ? '0 4px 16px rgba(79,70,229,0.15)' : 'none',
                                transition: 'transform 0.2s',
                            }}>
                                <div style={{ fontSize: '1.8rem', lineHeight: 1 }}>{medal?.icon ?? `#${e.rank}`}</div>
                                <div style={{
                                    marginTop: '0.4rem', fontWeight: 700, fontSize: '0.9rem',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    color: isSelf ? '#818cf8' : 'inherit',
                                }}>
                                    {e.name}{isSelf && ' (You)'}
                                </div>
                                <div style={{ marginTop: '0.25rem', fontSize: '1.1rem', fontWeight: 800, color: '#4f46e5' }}>
                                    {e.score}
                                </div>
                                <div style={{ fontSize: '0.68rem', opacity: 0.55, marginTop: '0.1rem' }}>
                                    combined score
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Full table */}
            <div style={{ overflowX: 'auto', marginTop: '1.25rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-soft)' }}>
                            <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap', opacity: 0.7 }}>Rank</th>
                            <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: 700, fontSize: '0.78rem' }}>Student Name</th>
                            <th style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                Total Score
                            </th>
                            <th style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap', opacity: 0.7 }}>Quiz Total</th>
                            <th style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap', opacity: 0.7 }}>Practice %</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry, idx) => {
                            const isSelf = currentUserName && entry.name === currentUserName
                            const isTop3 = entry.rank <= 3

                            return (
                                <tr
                                    key={idx}
                                    style={{
                                        borderTop: '1px solid var(--border, #e5e7eb)',
                                        background: isSelf
                                            ? 'rgba(79,70,229,0.06)'
                                            : isTop3 ? 'rgba(79,70,229,0.02)' : 'transparent',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-soft)' }}
                                    onMouseLeave={(e) => {
                                        (e.currentTarget as HTMLTableRowElement).style.background = isSelf
                                            ? 'rgba(79,70,229,0.06)'
                                            : isTop3 ? 'rgba(79,70,229,0.02)' : 'transparent'
                                    }}
                                >
                                    <td style={{ padding: '0.7rem 1rem' }}>
                                        <RankBadge rank={entry.rank} />
                                    </td>
                                    <td style={{ padding: '0.7rem 1rem', fontWeight: isSelf ? 700 : 500, color: isSelf ? '#818cf8' : 'inherit' }}>
                                        {entry.name}
                                        {isSelf && (
                                            <span style={{
                                                marginLeft: '0.5rem', fontSize: '0.68rem', fontWeight: 700,
                                                background: 'rgba(79,70,229,0.15)', color: '#818cf8',
                                                borderRadius: '99px', padding: '0.1rem 0.45rem',
                                            }}>
                                                You
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.7rem 1rem', textAlign: 'right', fontWeight: 700, color: '#4f46e5', fontSize: '0.95rem' }}>
                                        {entry.score}
                                    </td>
                                    <td style={{ padding: '0.7rem 1rem', textAlign: 'right', opacity: 0.7, fontSize: '0.82rem' }}>
                                        {entry.quizScore}
                                    </td>
                                    <td style={{ padding: '0.7rem 1rem', textAlign: 'right', opacity: 0.7, fontSize: '0.82rem' }}>
                                        {entry.practiceScore}%
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

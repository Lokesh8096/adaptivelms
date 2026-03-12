'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────
type SprintEntry = {
    rank: number
    name: string
    score: number
    activityPoints: number
    quizPoints: number
    practicePoints: number
    completedDays: number
    isCurrentUser: boolean
}
type SprintInfo = { sprint: number; startDay: number; endDay: number }

type CurrentUserStats = {
    rank: number | null
    name: string
    score: number
    activityPoints: number
    quizPoints: number
    practicePoints: number
    completedDays: number
    hasData: boolean
}

type LeaderboardData = {
    sprintLeaderboard: Record<number, SprintEntry[]>
    availableSprints: SprintInfo[]
    currentUserStatsBySprint: Record<number, CurrentUserStats>
}

const scoreIndicator = (score: number | null | undefined): string => {
    if (score === null || score === undefined) return ''
    if (score >= 40) return "\uD83C\uDFC6" // 🏆
    if (score >= 30) return "\u2B50" // ⭐
    if (score >= 15) return "\uD83D\uDC4D" // 👍
    if (score >= 1) return "\uD83D\uDE15" // 😕
    return ''
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
        <div ref={ref} style={{ position: 'relative', display: 'block', width: '100%', maxWidth: '340px' }}>
            <button
                id="lb-sprint-dropdown-trigger"
                onClick={() => setOpen((o) => !o)}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '0.5rem 1rem', fontWeight: 700, fontSize: '0.88rem',
                    borderRadius: '0.6rem', cursor: 'pointer',
                    border: '1.5px solid rgba(124,58,237,0.5)',
                    background: 'rgba(124,58,237,0.1)', color: '#a78bfa',
                    transition: 'all 0.2s', gap: '0.5rem',
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

            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                    background: 'var(--card)', border: '1.5px solid var(--border)',
                    borderRadius: '0.6rem', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                    zIndex: 100, overflow: 'hidden',
                }}>
                    {sprints.length === 0 ? (
                        <div style={{ padding: '0.75rem 1rem', fontSize: '0.82rem', color: 'var(--muted)', fontStyle: 'italic' }}>
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
                                        background: isSelected ? 'rgba(124,58,237,0.14)' : 'transparent',
                                        color: isSelected ? '#7c3aed' : 'var(--text)',
                                        border: 'none', cursor: 'pointer',
                                        borderLeft: isSelected ? '3px solid #7c3aed' : '3px solid transparent',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={(e) => { if (!isSelected) { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-soft)' } }}
                                    onMouseLeave={(e) => { if (!isSelected) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' } }}
                                >
                                    Sprint {s.sprint}
                                    <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
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

// ── Student Stats Panel ───────────────────────────────────────────────
function StudentStatsPanel({ stats, sprintInfo }: { stats: CurrentUserStats; sprintInfo: SprintInfo | undefined }) {
    const statItems = [
        { label: 'Your Rank', value: stats.rank !== null ? `#${stats.rank}` : '—', accent: true },
        { label: 'Activity Points', value: `${stats.activityPoints}`, sub: 'Recap/Interview/Scenario' },
        { label: 'Quiz Points', value: `${stats.quizPoints}`, sub: 'Correct answers' },
        { label: 'Practice Box', value: `${stats.practicePoints}`, sub: 'First attempt score' },
        { label: 'Total Points', value: `${stats.score}`, accent: true, sub: 'Max 250' },
        { label: 'Completed Days', value: `${stats.completedDays}${sprintInfo ? ` / 6` : ''}` },
    ]

    return (
        <div style={{
            borderRadius: '1rem',
            border: '1.5px solid rgba(79,70,229,0.35)',
            background: 'linear-gradient(135deg,rgba(79,70,229,0.08),rgba(124,58,237,0.05))',
            overflow: 'hidden',
        }}>
            {/* Panel header */}
            <div style={{
                padding: '0.85rem 1.1rem',
                background: 'linear-gradient(135deg,rgba(79,70,229,0.18),rgba(124,58,237,0.12))',
                borderBottom: '1px solid rgba(79,70,229,0.2)',
                display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
                <span style={{ fontSize: '1.1rem' }}>👤</span>
                <div>
                    <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#818cf8' }}>Your Performance</div>
                    {stats.name && (
                        <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.05rem', fontWeight: 600 }}>
                            {stats.name}
                        </div>
                    )}
                </div>
            </div>

            {/* Stats grid */}
            <div style={{ padding: '0.75rem' }}>
                {!stats.hasData ? (
                    <div style={{ padding: '0.75rem 0.25rem', fontSize: '0.78rem', opacity: 0.55, fontStyle: 'italic', textAlign: 'center' }}>
                        You haven&apos;t started this sprint yet.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        {statItems.map((item) => (
                            <div key={item.label} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '0.4rem 0.6rem',
                                borderRadius: '0.5rem',
                                background: item.accent ? 'rgba(79,70,229,0.1)' : 'transparent',
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: item.accent ? 700 : 500, opacity: item.accent ? 1 : 0.75 }}>
                                        {item.label}
                                    </div>
                                    {item.sub && (
                                        <div style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: '0.05rem' }}>{item.sub}</div>
                                    )}
                                </div>
                                <div style={{
                                    fontSize: item.accent ? '1rem' : '0.85rem',
                                    fontWeight: 800,
                                    color: item.accent ? '#818cf8' : 'inherit',
                                }}>
                                    {item.value}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
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

    const currentUserStats = useMemo(() => {
        if (!data || selectedSprint === null) return null
        return data.currentUserStatsBySprint?.[selectedSprint] ?? null
    }, [data, selectedSprint])

    const selectedSprintInfo = useMemo(() => {
        if (!data || selectedSprint === null) return undefined
        return data.availableSprints.find(s => s.sprint === selectedSprint)
    }, [data, selectedSprint])

    // Show student stats panel only when currentUserName is provided (student view)
    const isStudentView = Boolean(currentUserName)
    const studentScore = isStudentView ? (currentUserStats?.score ?? null) : null
    const studentScoreIcon = scoreIndicator(studentScore)

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
        <div className="space-y-4 lb-root">
            {/* ── Header ── */}
            <div style={{
                background: 'linear-gradient(135deg,#4f46e5 0%,#7c3aed 55%,#a855f7 100%)',
                borderRadius: '1rem', padding: '1.5rem',
                color: '#fff', position: 'relative', overflow: 'hidden',
            }}>
                {/* Decorative circles */}
                <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: '-20px', right: '80px', width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />

                {/* Top row: trophy + refresh */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', position: 'relative', marginBottom: '0.6rem' }}>
                    <span className="lb-trophy" style={{ fontSize: '2.5rem', lineHeight: 1, flexShrink: 0 }}>🏆</span>
                    <button
                        id="leaderboard-refresh"
                        onClick={() => void fetchLeaderboard()}
                        style={{
                            padding: '0.4rem 0.9rem', fontSize: '0.78rem', fontWeight: 600,
                            borderRadius: '0.5rem', border: '1.5px solid rgba(255,255,255,0.4)',
                            background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer',
                            backdropFilter: 'blur(4px)', transition: 'background 0.2s',
                            flexShrink: 0, whiteSpace: 'nowrap',
                        }}
                    >
                        ↻ Refresh
                    </button>
                </div>

                {/* Title + subtitle below */}
                <div style={{ position: 'relative' }}>
                    <h1 className="lb-title" style={{ fontWeight: 800, letterSpacing: '-0.5px', margin: 0, lineHeight: 1.2 }}>
                        {isStudentView && studentScore !== null
                            ? `Leaderboard | Your Score: ${studentScore}${studentScoreIcon ? ` ${studentScoreIcon}` : ''}`
                            : 'Leaderboard'}
                    </h1>
                    <p style={{ margin: '0.3rem 0 0', opacity: 0.85, fontSize: '0.82rem', lineHeight: 1.5 }}>
                        Sprint rankings based on daily completion + quiz scores + Practice Box
                    </p>
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
                display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                background: 'rgba(168,85,247,0.08)', borderLeft: '3px solid #a855f7',
                borderRadius: '0 0.5rem 0.5rem 0', padding: '0.6rem 0.8rem', fontSize: '0.76rem',
                lineHeight: 1.55,
            }}>
                <span style={{ flexShrink: 0 }}>ℹ️</span>
                <span>
                    Sprint score = <strong>Recap (+10)</strong> + <strong>Interview (+10)</strong> + <strong>Scenario (+10)</strong> per day
                    &nbsp;+&nbsp;<strong>Quiz correct answers</strong> per day
                    &nbsp;+&nbsp;<strong>Practice Box first-attempt score</strong>
                    &nbsp;· Max per sprint: <strong>250 pts</strong>
                    &nbsp;· First attempts only; retakes do not affect ranking.
                </span>
            </div>

            {/* ── Two-column layout: Rankings + Student Stats Panel ── */}
            <div className="lb-grid" style={{
                display: 'grid',
                gridTemplateColumns: isStudentView && currentUserStats ? 'minmax(0,1fr) 260px' : '1fr',
                gap: '1.25rem',
                alignItems: 'start',
            }}>
                {/* Left: Rankings table */}
                <LeaderboardTable entries={displayEntries} currentUserName={currentUserName} />

                {/* Right: Student stats panel (student view only) */}
                {isStudentView && currentUserStats && (
                    <StudentStatsPanel stats={currentUserStats} sprintInfo={selectedSprintInfo} />
                )}
            </div>

            <style>{`
                @keyframes lb-spin { to { transform: rotate(360deg); } }

                /* ── Mobile overrides (≤ 600px) ── */
                @media (max-width: 600px) {
                    /* Stack grid to single column */
                    .lb-grid {
                        grid-template-columns: 1fr !important;
                    }
                    /* Smaller trophy on very small screens */
                    .lb-trophy {
                        font-size: 2rem !important;
                    }
                    /* Responsive heading size */
                    .lb-title {
                        font-size: clamp(1rem, 5vw, 1.4rem) !important;
                    }
                    /* Tighten table cells */
                    .lb-table td,
                    .lb-table th {
                        padding: 0.55rem 0.65rem !important;
                    }
                    /* Make top-3 podium cards 2-per-row on small screens */
                    .lb-podium {
                        padding: 0.85rem 0.85rem 0 !important;
                        gap: 0.5rem !important;
                    }
                    .lb-podium-card {
                        flex: 1 1 calc(50% - 0.25rem) !important;
                        min-width: 0 !important;
                        padding: 0.75rem 0.5rem !important;
                    }
                    /* Sprint dropdown full width */
                    .lb-root > div:nth-child(2) {
                        width: 100%;
                    }
                }
            `}</style>
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
                <div className="lb-podium" style={{
                    display: 'flex', gap: '0.75rem', padding: '1.25rem 1.25rem 0',
                    flexWrap: 'wrap',
                }}>
                    {entries.slice(0, 3).map((e, i) => {
                        const isSelf = e.isCurrentUser
                        const medal = MEDAL[e.rank]
                        return (
                            <div key={i} className="lb-podium-card" style={{
                                flex: '1 1 130px', borderRadius: '0.875rem',
                                background: medal ? 'linear-gradient(135deg,rgba(79,70,229,0.10),rgba(124,58,237,0.06))' : 'var(--bg-soft)',
                                border: isSelf ? '2px solid #4f46e5' : '1.5px solid var(--border, #e5e7eb)',
                                padding: '0.9rem 0.75rem', textAlign: 'center',
                                boxShadow: i === 0 ? '0 4px 16px rgba(79,70,229,0.15)' : 'none',
                                transition: 'transform 0.2s', minWidth: 0,
                            }}>
                                <div style={{ fontSize: '1.7rem', lineHeight: 1 }}>{medal?.icon ?? `#${e.rank}`}</div>
                                <div style={{
                                    marginTop: '0.4rem', fontWeight: 700, fontSize: '0.85rem',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    color: isSelf ? '#818cf8' : 'inherit',
                                }}>
                                    {e.name}{isSelf && ' (You)'}
                                </div>
                                <div style={{ marginTop: '0.25rem', fontSize: '1rem', fontWeight: 800, color: '#4f46e5' }}>
                                    {e.score}
                                </div>
                                <div style={{ fontSize: '0.65rem', opacity: 0.55, marginTop: '0.1rem' }}>
                                    points
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Full table — Rank | Student Name | Points */}
            <div style={{ overflowX: 'auto', marginTop: '1.25rem' }}>
                <table className="lb-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-soft)' }}>
                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap', opacity: 0.7 }}>Rank</th>
                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 700, fontSize: '0.78rem' }}>Student Name</th>
                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                Points
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry, idx) => {
                            const isSelf = entry.isCurrentUser
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
                                    <td style={{ padding: '0.7rem 0.85rem' }}>
                                        <RankBadge rank={entry.rank} />
                                    </td>
                                    <td style={{ padding: '0.7rem 0.85rem', fontWeight: isSelf ? 700 : 500, color: isSelf ? '#818cf8' : 'inherit' }}>
                                        {entry.name}
                                        {isSelf && (
                                            <span style={{
                                                marginLeft: '0.4rem', fontSize: '0.65rem', fontWeight: 700,
                                                background: 'rgba(79,70,229,0.15)', color: '#818cf8',
                                                borderRadius: '99px', padding: '0.1rem 0.4rem',
                                            }}>
                                                You
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.7rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#4f46e5', fontSize: '0.95rem' }}>
                                        {entry.score}
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

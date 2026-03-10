'use client'

import LeaderboardView from '@/components/leaderboard-view'

export default function AdminLeaderboardPage() {
    return (
        <div className="space-y-6">
            <div className="surface-card p-5 md:p-6">
                <h1 className="text-2xl font-bold md:text-3xl">Leaderboard</h1>
                <p className="mt-2 text-sm muted-text">
                    Sprint rankings based on first-attempt quiz scores + Practice Box first-attempt score.
                </p>
            </div>
            <LeaderboardView />
        </div>
    )
}

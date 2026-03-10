'use client'

import { useEffect, useState } from 'react'
import { getAccessContext } from '@/lib/auth'
import LeaderboardView from '@/components/leaderboard-view'

export default function StudentLeaderboardPage() {
    const [studentName, setStudentName] = useState<string | undefined>(undefined)

    useEffect(() => {
        getAccessContext().then((access) => {
            const name = access.allowedEmail?.Student_Name?.trim()
            if (name) setStudentName(name)
        }).catch(() => { /* ignore */ })
    }, [])

    return <LeaderboardView currentUserName={studentName} />
}

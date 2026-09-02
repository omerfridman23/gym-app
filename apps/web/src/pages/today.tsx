'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Settings } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { MetricTiles } from '@/components/metric-tiles'
import { SessionRow } from '@/components/session-row'
import { SessionActionsSheet } from '@/components/session-actions-sheet'
import { NewSessionSheet } from '@/components/new-session-sheet'
import { clientById, sessionsOn, totalOutstanding, useData } from '@/lib/data'
import { formatHebrewDate } from '@/lib/format'
import type { Session } from '@/lib/mock-data'

export default function TodayPage() {
  const { ds, todayISO, config } = useData()
  const [overrides, setOverrides] = useState<Record<string, Partial<Session>>>({})
  const [added, setAdded] = useState<Session[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  const sessions = useMemo(() => {
    const base = sessionsOn(ds, todayISO)
    const extra = added.filter(
      (s) => s.date === todayISO && ds.clients.some((c) => c.id === s.clientId),
    )
    return [...base, ...extra]
      .map((s) => ({ ...s, ...overrides[s.id] }))
      .sort((a, b) => (a.time < b.time ? -1 : 1))
  }, [ds, todayISO, added, overrides])

  const active = sessions.filter((s) => s.status !== 'cancelled')
  const confirmed = active.filter((s) => s.status === 'confirmed' || s.status === 'done').length
  const outstanding = totalOutstanding(ds)

  const openSession = sessions.find((s) => s.id === openId) ?? null
  const openClient = openSession ? clientById(ds, openSession.clientId) ?? null : null

  const patch = (id: string, data: Partial<Session>) =>
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...data } }))

  return (
    <>
      <AppHeader
        title="היום"
        subtitle={formatHebrewDate(todayISO)}
        action={
          <Link
            href="/settings"
            aria-label="הגדרות"
            className="flex size-10 items-center justify-center rounded-sm text-ink active:bg-court-tint"
          >
            <Settings className="size-5" />
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <MetricTiles sessionsToday={active.length} confirmed={confirmed} outstanding={outstanding} />

        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <p className="text-lg font-bold text-ink">אין {config.terms.session}ים היום</p>
            <p className="mt-1 text-sm text-muted">יום חופשי. אפשר להוסיף {config.terms.session} חדש.</p>
          </div>
        ) : (
          <div className="px-5 pb-4 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-muted">מהלך היום</h2>
              <span className="ltr-nums text-sm font-semibold text-muted">{active.length}</span>
            </div>
            <ul className="flex flex-col gap-2.5">
              {sessions.map((s) => {
                const client = clientById(ds, s.clientId)
                if (!client) return null
                return (
                  <li key={s.id}>
                    <SessionRow session={s} client={client} onOpen={() => setOpenId(s.id)} />
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

        <div className="pointer-events-none sticky bottom-0 bg-gradient-to-t from-paper via-paper/90 to-transparent px-5 pb-4 pt-6">
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="pointer-events-auto flex w-full items-center justify-center gap-2 rounded-2xl bg-court-gradient py-4 text-base font-bold text-white shadow-md transition active:scale-[0.98]"
        >
          <Plus className="size-5" strokeWidth={2.5} />
          {config.terms.session} חדש
        </button>
      </div>

      <SessionActionsSheet
        session={openSession}
        client={openClient}
        open={openId !== null}
        onClose={() => setOpenId(null)}
        onConfirm={(id) => patch(id, { status: 'confirmed', reminderAnswered: true })}
        onMarkPaid={(id) => patch(id, { paid: true })}
        onCancel={(id, reason) => patch(id, { status: 'cancelled', cancelReason: reason })}
      />

      <NewSessionSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreate={(s) => setAdded((prev) => [...prev, s])}
      />
    </>
  )
}

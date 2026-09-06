'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { SessionRow } from '@/components/session-row'
import { SessionActionsSheet } from '@/components/session-actions-sheet'
import { NewSessionSheet } from '@/components/new-session-sheet'
import { clientById, sessionsOn, useData } from '@/lib/data'
import {
  addDays,
  formatHebrewDate,
  fromISODate,
  startOfWeek,
  toISODate,
  WEEKDAY_LETTERS,
} from '@/lib/format'
import type { Session } from '@/lib/mock-data'

export default function CalendarPage() {
  const { ds, todayISO, config, actions } = useData()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(fromISODate(todayISO)))
  const [selectedISO, setSelectedISO] = useState(todayISO)
  const [openId, setOpenId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const iso = toISODate(addDays(weekStart, i))
      const all = sessionsOn(ds, iso)
      const activeCount = all.filter((s) => s.status !== 'cancelled').length
      return { iso, sessions: all, activeCount }
    })
  }, [ds, weekStart])

  const selectedDay = days.find((d) => d.iso === selectedISO)
  const selectedSessions = selectedDay?.sessions ?? []

  const openSession = selectedSessions.find((s) => s.id === openId) ?? null
  const openClient = openSession ? clientById(ds, openSession.clientId) ?? null : null

  const markPaid = (session: Session) => {
    if (session.priceAgorot <= 0) return
    void actions.recordPayment(session.clientId, session.priceAgorot, 'cash', [session.id])
  }

  const shiftWeek = (dir: number) => {
    const next = addDays(weekStart, dir * 7)
    setWeekStart(next)
    setSelectedISO(toISODate(next))
  }

  const monthLabel = useMemo(() => {
    const start = fromISODate(days[0].iso)
    const end = fromISODate(days[6].iso)
    const fmt = (d: Date) =>
      d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
    return `${fmt(start)} – ${fmt(end)}`
  }, [days])

  return (
    <>
      <AppHeader title={config.terms.calendar} subtitle={monthLabel} />

      <div className="flex-1 overflow-y-auto">
        {/* Week navigator */}
        <div className="sticky top-0 z-10 bg-paper/80 px-3 pb-3 pt-2 backdrop-blur-xl">
          <div className="flex items-center justify-between px-1 py-1">
            <button
              type="button"
              onClick={() => shiftWeek(-1)}
              aria-label="שבוע קודם"
              className="flex size-9 items-center justify-center rounded-full text-muted transition active:scale-90 active:bg-court-tint"
            >
              <ChevronRight className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setWeekStart(startOfWeek(fromISODate(todayISO)))
                setSelectedISO(todayISO)
              }}
              className="rounded-full bg-surface px-4 py-1.5 text-sm font-bold text-court shadow-sm ring-1 ring-line/60"
            >
              היום
            </button>
            <button
              type="button"
              onClick={() => shiftWeek(1)}
              aria-label="שבוע הבא"
              className="flex size-9 items-center justify-center rounded-full text-muted transition active:scale-90 active:bg-court-tint"
            >
              <ChevronLeft className="size-5" />
            </button>
          </div>

          <div className="mt-1 flex gap-1.5">
            {days.map((day) => {
              const d = fromISODate(day.iso)
              const isSelected = day.iso === selectedISO
              const isToday = day.iso === todayISO
              return (
                <button
                  key={day.iso}
                  type="button"
                  onClick={() => setSelectedISO(day.iso)}
                  aria-pressed={isSelected}
                  className={`flex flex-1 flex-col items-center gap-1.5 rounded-2xl py-2.5 transition ${
                    isSelected
                      ? 'bg-court-gradient text-white shadow-md'
                      : 'bg-surface text-ink shadow-sm ring-1 ring-line/60 active:scale-95'
                  }`}
                >
                  <span
                    className={`text-xs font-bold ${isSelected ? 'text-white/85' : 'text-muted'}`}
                  >
                    {WEEKDAY_LETTERS[d.getDay()]}
                  </span>
                  <span
                    className={`ltr-nums flex size-7 items-center justify-center text-base font-extrabold ${
                      isToday && !isSelected ? 'rounded-full bg-court-tint text-court' : ''
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      day.activeCount > 0
                        ? isSelected
                          ? 'bg-white'
                          : 'bg-court'
                        : 'bg-transparent'
                    }`}
                  />
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-baseline justify-between px-5 pb-1 pt-3">
          <p className="text-sm font-bold text-ink">{formatHebrewDate(selectedISO)}</p>
          <p className="text-sm font-medium text-muted">
            {selectedDay && selectedDay.activeCount > 0
              ? `${selectedDay.activeCount} ${config.terms.sessions}`
              : 'אין אימונים'}
          </p>
        </div>

        {selectedSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <p className="text-base font-bold text-ink">אין {config.terms.sessions} ביום זה</p>
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="mt-3 rounded-full bg-court-tint px-4 py-2 text-sm font-bold text-court"
            >
              + הוסף {config.terms.session}
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5 px-5 py-3">
            {selectedSessions.map((s) => {
              const client = clientById(ds, s.clientId)
              if (!client) return null
              return (
                <li key={s.id}>
                  <SessionRow session={s} client={client} onOpen={() => setOpenId(s.id)} />
                </li>
              )
            })}
          </ul>
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
        onConfirm={(id) => void actions.updateSession(id, { status: 'confirmed' })}
        onMarkPaid={() => openSession && markPaid(openSession)}
        onCancel={(id, reason) =>
          void actions.updateSession(id, { status: 'cancelled', cancelReason: reason })
        }
      />

      <NewSessionSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        presetDate={selectedISO}
        onCreate={(s, repeatWeekly) => void actions.addSession(s, repeatWeekly)}
      />
    </>
  )
}

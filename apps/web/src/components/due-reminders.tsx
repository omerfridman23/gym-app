'use client'

import { useCallback, useEffect, useState } from 'react'
import { BellRing, Check, MessageCircle } from 'lucide-react'
import { dataApi, type ApiDueReminder } from '@/lib/api'

/**
 * Reminders the server says are due now (inside the coach's reminder window
 * and not yet sent). The message and WhatsApp link arrive ready to send, so
 * sending is one tap; tapping also marks the session as reminded.
 */
export function DueReminders({ onSent }: { onSent?: () => void }) {
  const [reminders, setReminders] = useState<ApiDueReminder[]>([])
  const [sending, setSending] = useState<string | null>(null)

  const load = useCallback(() => {
    dataApi
      .listDueReminders()
      .then(setReminders)
      .catch(() => setReminders([]))
  }, [])

  useEffect(load, [load])

  const send = async (reminder: ApiDueReminder) => {
    setSending(reminder.sessionId)
    // Open WhatsApp first: a click-initiated window is less likely to be
    // blocked than one opened after an await.
    window.open(reminder.whatsappUrl, '_blank', 'noopener,noreferrer')
    try {
      await dataApi.markReminderSent(reminder.sessionId)
      setReminders((prev) => prev.filter((r) => r.sessionId !== reminder.sessionId))
      onSent?.()
    } finally {
      setSending(null)
    }
  }

  if (reminders.length === 0) return null

  return (
    <section className="px-5 pb-1 pt-3">
      <div className="rounded-2xl bg-surface p-3 shadow-sm ring-1 ring-line/60">
        <div className="mb-2 flex items-center gap-2">
          <BellRing className="size-4 text-court" />
          <h2 className="text-sm font-bold text-ink">תזכורות לשליחה</h2>
          <span className="ltr-nums ms-auto text-sm font-semibold text-muted">
            {reminders.length}
          </span>
        </div>

        <ul className="flex flex-col gap-2">
          {reminders.map((reminder) => (
            <li
              key={reminder.sessionId}
              className="flex items-center gap-3 rounded-xl bg-paper px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{reminder.clientName}</p>
                <p className="ltr-nums text-xs text-muted">
                  {reminder.timeLocal}
                  {reminder.location ? ` · ${reminder.location}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void send(reminder)}
                disabled={sending === reminder.sessionId}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-court px-3 py-2 text-xs font-bold text-white transition active:scale-[0.97] disabled:opacity-50"
              >
                {sending === reminder.sessionId ? (
                  <Check className="size-4" />
                ) : (
                  <MessageCircle className="size-4" />
                )}
                שליחה
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { BottomSheet } from './bottom-sheet'
import { InitialsAvatar } from './initials-avatar'
import { useData } from '@/lib/data'
import type { Session } from '@/lib/mock-data'
import type { SessionType } from '@/lib/vertical-config'

export function NewSessionSheet({
  open,
  onClose,
  presetDate,
  presetTime,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  presetDate?: string
  presetTime?: string
  onCreate: (session: Session) => void
}) {
  const { ds, config, todayISO } = useData()
  const [query, setQuery] = useState('')
  const [clientId, setClientId] = useState<string>('')
  const [typeId, setTypeId] = useState<SessionType['id']>(config.sessionTypes[0].id)
  const [date, setDate] = useState(presetDate ?? todayISO)
  const [time, setTime] = useState(presetTime ?? '18:00')
  const [location, setLocation] = useState('')
  const [price, setPrice] = useState(String(ds.settings.defaultPriceAgorot / 100))
  const [repeat, setRepeat] = useState(false)

  // keep presets in sync when reopened for a specific slot
  useEffect(() => {
    if (open) {
      if (presetDate) setDate(presetDate)
      if (presetTime) setTime(presetTime)
    }
  }, [open, presetDate, presetTime])

  const filtered = ds.clients.filter((c) => c.name.includes(query.trim()))
  const canSave = clientId !== ''

  const reset = () => {
    setQuery('')
    setClientId('')
    setTypeId(config.sessionTypes[0].id)
    setLocation('')
    setPrice(String(ds.settings.defaultPriceAgorot / 100))
    setRepeat(false)
  }

  const handleSave = () => {
    if (!canSave) return
    const session: Session = {
      id: 'new-' + Date.now(),
      clientId,
      typeId,
      date,
      time,
      durationMin: config.defaultDuration,
      location: config.requiresLocation ? location || undefined : undefined,
      priceAgorot: Math.round(Number(price) * 100) || 0,
      status: 'pending',
      paid: false,
      fromPackage: false,
      reminderSent: false,
      reminderAnswered: false,
    }
    onCreate(session)
    reset()
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={`${config.terms.session} חדש`}>
      <div className="flex flex-col gap-5">
        <Field label={config.terms.client}>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`חיפוש ${config.terms.client}...`}
              className="w-full rounded-sm border border-line bg-surface py-2.5 pe-9 ps-3 text-base text-ink outline-none focus:border-court"
            />
          </div>
          <div className="max-h-44 overflow-y-auto rounded-sm border border-line">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setClientId(c.id)}
                aria-pressed={clientId === c.id}
                className={`flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-start last:border-b-0 ${
                  clientId === c.id ? 'bg-court-tint' : 'bg-surface'
                }`}
              >
                <InitialsAvatar name={c.name} className="size-9" />
                <span className="text-base font-medium text-ink">{c.name}</span>
              </button>
            ))}
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted">לא נמצאו תוצאות</p>
            ) : null}
          </div>
        </Field>

        <Field label={`סוג ${config.terms.session}`}>
          <div className="flex gap-2">
            {config.sessionTypes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTypeId(t.id)}
                aria-pressed={typeId === t.id}
                className={`flex-1 rounded-sm border px-2 py-2.5 text-sm font-semibold ${
                  typeId === t.id
                    ? 'border-court bg-court-tint text-court'
                    : 'border-line bg-surface text-muted'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="תאריך">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="ltr-nums w-full rounded-sm border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-court"
            />
          </Field>
          <Field label="שעה">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="ltr-nums w-full rounded-sm border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-court"
            />
          </Field>
        </div>

        {config.requiresLocation ? (
          <Field label={config.terms.location}>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="מגרש 1, קאנטרי הרצליה"
              className="w-full rounded-sm border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-court"
            />
          </Field>
        ) : null}

        <Field label="מחיר (₪)">
          <input
            type="number"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="ltr-nums w-full rounded-sm border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-court"
          />
        </Field>

        <label className="flex items-center justify-between rounded-sm border border-line bg-surface px-3 py-3">
          <span className="text-base font-medium text-ink">חוזר כל שבוע</span>
          <input
            type="checkbox"
            checked={repeat}
            onChange={(e) => setRepeat(e.target.checked)}
            className="size-5 accent-[var(--court)]"
          />
        </label>

        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="w-full rounded-sm bg-court py-3.5 text-base font-semibold text-white disabled:opacity-40"
        >
          שמור {config.terms.session}
        </button>
      </div>
    </BottomSheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-ink">{label}</p>
      {children}
    </div>
  )
}

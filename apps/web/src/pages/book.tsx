'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { CalendarCheck2, CheckCircle2, ChevronRight, Clock } from 'lucide-react'
import {
  publicApi,
  ApiError,
  type PublicBookingInfo,
  type PublicBookingResult,
} from '@/lib/api'
import {
  formatHebrewDate,
  formatShekel,
  toISODate,
  WEEKDAY_LETTERS,
  fromISODate,
} from '@/lib/format'
import { PublicShell } from '@/components/public-shell'

/**
 * Public self-booking page (/book/:slug) — the coach's shareable link.
 * No auth: anyone with the link sees free slots and books one with a name
 * and a phone number. The session lands in the coach's calendar as pending.
 */
export default function BookPage() {
  const params = useParams<{ slug: string }>()
  // undefined = loading, null = link not found / booking disabled
  const [info, setInfo] = useState<PublicBookingInfo | null | undefined>(undefined)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PublicBookingResult | null>(null)

  const handleLoadError = (err: unknown) => {
    setError(
      err instanceof ApiError && err.status === 404
        ? null
        : 'לא הצלחנו לטעון את הקישור. בדקו את החיבור ונסו שוב.',
    )
    setInfo(null)
  }

  const load = () => {
    publicApi
      .getBookingInfo(params.slug)
      .then((data) => {
        setInfo(data)
        setSelectedDate((prev) => prev ?? data.days.find((d) => d.slots.length > 0)?.date ?? null)
      })
      .catch(handleLoadError)
  }

  useEffect(() => {
    let cancelled = false
    publicApi
      .getBookingInfo(params.slug)
      .then((data) => {
        if (cancelled) return
        setInfo(data)
        setSelectedDate(data.days.find((d) => d.slots.length > 0)?.date ?? data.days[0]?.date ?? null)
      })
      .catch((err) => {
        if (!cancelled) handleLoadError(err)
      })
    return () => {
      cancelled = true
    }
  }, [params.slug])

  const day = useMemo(
    () => info?.days.find((d) => d.date === selectedDate) ?? null,
    [info, selectedDate],
  )

  if (info === undefined) {
    return (
      <PublicShell framed>
        <div className="flex justify-center">
          <span className="size-8 animate-pulse rounded-2xl bg-court" aria-label="טוען…" />
        </div>
      </PublicShell>
    )
  }

  if (info === null) {
    return (
      <PublicShell framed>
        <div className="text-center">
          <h1 className="text-xl font-extrabold text-ink">
            {error ? 'לא הצלחנו לטעון את הקישור' : 'הקישור לא נמצא'}
          </h1>
          <p className="mt-2 font-medium text-muted text-pretty">
            {error ?? 'ייתכן שקביעת התורים כבויה כרגע. פנו למאמן ישירות.'}
          </p>
          {error ? (
            <button
              type="button"
              onClick={() => {
                setInfo(undefined)
                setError(null)
                load()
              }}
              className="mt-5 rounded-xl bg-ink px-5 py-2.5 text-sm font-bold text-canvas"
            >
              נסו שוב
            </button>
          ) : null}
        </div>
      </PublicShell>
    )
  }

  if (result) {
    return (
      <PublicShell framed>
        <div className="flex flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-paid-tint">
            <CheckCircle2 className="size-9 text-paid" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold text-ink">האימון נקבע!</h1>
          <p className="mt-2 font-medium text-muted text-pretty">
            {result.clientFirstName}, שמרנו לך מקום אצל {result.coachName}.
          </p>
          <div className="mt-5 w-full rounded-2xl bg-surface px-4 py-4 shadow-sm ring-1 ring-line/60">
            <p className="text-lg font-extrabold text-ink">{formatHebrewDate(result.date)}</p>
            <p className="ltr-nums mt-1 text-3xl font-extrabold text-court">{result.timeLocal}</p>
            <p className="mt-1 text-sm font-medium text-muted">{result.durationMin} דקות</p>
          </div>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs font-medium text-muted">
            <Clock className="size-3.5" />
            המאמן יאשר את האימון בהודעה למספר שהשארת
          </p>
        </div>
      </PublicShell>
    )
  }

  const totalFree = info.days.reduce((sum, d) => sum + d.slots.length, 0)

  return (
    <PublicShell framed>
      <header className="text-center">
        <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-muted">
          <CalendarCheck2 className="size-4 text-court" />
          קביעת אימון אונליין
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink">{info.coachName}</h1>
        <p className="mt-1 text-sm font-medium text-muted">
          אימון של {info.durationMin} דקות
          {info.priceAgorot > 0 ? ` · ${formatShekel(info.priceAgorot)}` : ''}
        </p>
      </header>

      {totalFree === 0 ? (
        <p className="mt-8 text-center font-medium text-muted">
          אין שעות פנויות בשבועיים הקרובים. פנו למאמן ישירות.
        </p>
      ) : (
        <>
          {/* Day picker */}
          <div className="-mx-5 mt-6 flex gap-2 overflow-x-auto px-5 pb-1">
            {info.days.map((d) => {
              const active = d.date === selectedDate
              const date = fromISODate(d.date)
              return (
                <button
                  key={d.date}
                  type="button"
                  disabled={d.slots.length === 0}
                  onClick={() => {
                    setSelectedDate(d.date)
                    setSelectedSlot(null)
                    setError(null)
                  }}
                  className={`flex w-14 shrink-0 flex-col items-center rounded-2xl py-2.5 text-sm font-bold ring-1 transition disabled:opacity-35 ${
                    active
                      ? 'bg-court text-white ring-court'
                      : 'bg-surface text-ink ring-line/60'
                  }`}
                >
                  <span className="text-xs font-semibold opacity-80">{dayLabel(d.date)}</span>
                  <span className="ltr-nums mt-0.5 text-lg leading-none">{date.getDate()}</span>
                </button>
              )
            })}
          </div>

          {/* Slots */}
          {day ? (
            <div className="mt-4 grid grid-cols-4 gap-2">
              {day.slots.map((slot) => {
                const active = selectedSlot === slot.startsAt
                return (
                  <button
                    key={slot.startsAt}
                    type="button"
                    onClick={() => {
                      setSelectedSlot(slot.startsAt)
                      setError(null)
                    }}
                    className={`ltr-nums rounded-xl py-2.5 text-sm font-bold ring-1 transition ${
                      active ? 'bg-court-tint text-court ring-court' : 'bg-surface text-ink ring-line/60'
                    }`}
                  >
                    {slot.timeLocal}
                  </button>
                )
              })}
            </div>
          ) : null}

          {error ? (
            <p className="mt-4 text-center text-sm font-bold text-owed" role="alert">
              {error}
            </p>
          ) : null}

          {/* Details + confirm */}
          {selectedSlot ? (
            <form
              className="mt-6 flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (submitting) return
                setSubmitting(true)
                setError(null)
                publicApi
                  .createBooking(params.slug, { startsAt: selectedSlot, name, phone })
                  .then(setResult)
                  .catch((err) => {
                    setError(err instanceof ApiError ? err.message : 'משהו השתבש, נסו שוב')
                    // The slot may have just been taken — refresh availability.
                    load()
                    setSelectedSlot(null)
                  })
                  .finally(() => setSubmitting(false))
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="שם מלא"
                aria-label="שם מלא"
                required
                dir="rtl"
                className="w-full rounded-xl bg-surface-2 p-3.5 text-sm font-medium text-ink outline-none ring-1 ring-line/60 transition focus:ring-2 focus:ring-court"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="נייד (05X-XXXXXXX)"
                aria-label="נייד"
                type="tel"
                required
                dir="ltr"
                className="ltr-nums w-full rounded-xl bg-surface-2 p-3.5 text-left text-sm font-medium text-ink outline-none ring-1 ring-line/60 transition focus:ring-2 focus:ring-court"
              />
              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-court-gradient py-4 text-base font-bold text-white shadow-md transition active:scale-[0.98] disabled:opacity-60"
              >
                {submitting ? 'קובע…' : 'אשר קביעת אימון'}
                <ChevronRight className="size-4 rotate-180" />
              </button>
            </form>
          ) : null}
        </>
      )}
    </PublicShell>
  )
}

const TODAY_ISO = toISODate(new Date())

function dayLabel(iso: string): string {
  if (iso === TODAY_ISO) return 'היום'
  return WEEKDAY_LETTERS[fromISODate(iso).getDay()]
}


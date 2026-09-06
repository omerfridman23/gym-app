'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CalendarCheck, CalendarX, Check, Clock, MapPin, X } from 'lucide-react'
import { publicApi, type PublicConfirmInfo } from '@/lib/api'
import { addMinutesToTime, formatHebrewDate, toISODate } from '@/lib/format'

export default function ConfirmPage() {
  const params = useParams<{ id: string }>()
  // undefined = loading, null = link not found
  const [info, setInfo] = useState<PublicConfirmInfo | null | undefined>(undefined)
  const [changing, setChanging] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    publicApi
      .getConfirmInfo(params.id)
      .then((result) => !cancelled && setInfo(result))
      .catch(() => !cancelled && setInfo(null))
    return () => {
      cancelled = true
    }
  }, [params.id])

  if (info === undefined) {
    return (
      <PublicShell>
        <div className="flex justify-center">
          <span className="size-8 animate-pulse rounded-2xl bg-court" aria-label="טוען…" />
        </div>
      </PublicShell>
    )
  }

  if (info === null) {
    return (
      <PublicShell>
        <div className="text-center">
          <h1 className="text-xl font-semibold text-ink">הקישור לא נמצא</h1>
          <p className="mt-2 text-muted">ייתכן שהקישור פג תוקף. פנה/י למאמן.</p>
        </div>
      </PublicShell>
    )
  }

  const start = new Date(info.startsAt)
  const dateIso = toISODate(start)
  const time = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
  const endTime = addMinutesToTime(time, info.durationMin)

  const answer =
    info.status === 'confirmed' || info.status === 'done'
      ? 'confirmed'
      : info.status === 'cancelled'
        ? 'declined'
        : null
  const showButtons = answer === null || changing

  const send = (value: 'confirm' | 'decline') => {
    setSaving(true)
    publicApi
      .answerConfirm(params.id, value)
      .then((result) => {
        setInfo(result)
        setChanging(false)
      })
      .catch(() => setInfo(null))
      .finally(() => setSaving(false))
  }

  return (
    <PublicShell>
      <header className="text-center">
        <p className="text-sm font-medium text-muted">אישור אימון · {info.coachName}</p>
        <h1 className="mt-1 text-xl font-bold text-ink">שלום {info.clientFirstName}</h1>
      </header>

      {/* Session card */}
      <div className="mt-6 overflow-hidden rounded-3xl border border-line bg-card shadow-card">
        <div className="bg-gradient-to-b from-court to-court-strong px-6 py-7 text-center">
          <p className="text-sm font-medium text-white/80">האימון שלך</p>
          <p className="mt-1 text-2xl font-bold text-white text-balance">
            {formatHebrewDate(dateIso)}
          </p>
        </div>
        <div className="space-y-3 px-6 py-5 text-sm">
          <Row icon={<Clock className="size-4 text-court" />}>
            <span className="ltr-nums font-medium">
              {time}–{endTime}
            </span>
          </Row>
          {info.location ? (
            <Row icon={<MapPin className="size-4 text-court" />}>{info.location}</Row>
          ) : null}
        </div>
      </div>

      {showButtons ? (
        <>
          <p className="mt-7 text-center text-sm text-muted">האם תגיע/י לאימון?</p>
          <div className="mt-3 flex flex-col gap-3">
            <button
              onClick={() => send('confirm')}
              disabled={saving}
              className="flex items-center justify-center gap-2 rounded-2xl bg-court py-4 text-base font-semibold text-white shadow-btn transition active:scale-[0.98] active:bg-court-strong disabled:opacity-50"
            >
              <Check className="size-5" />
              מאשר/ת הגעה
            </button>
            <button
              onClick={() => send('decline')}
              disabled={saving}
              className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-card py-4 text-base font-semibold text-ink transition active:scale-[0.98] active:bg-court-tint disabled:opacity-50"
            >
              <X className="size-5" />
              לא אוכל להגיע
            </button>
          </div>
        </>
      ) : (
        <Result answer={answer} onReset={() => setChanging(true)} />
      )}
    </PublicShell>
  )
}

function Result({
  answer,
  onReset,
}: {
  answer: 'confirmed' | 'declined'
  onReset: () => void
}) {
  const confirmed = answer === 'confirmed'
  return (
    <div className="mt-7 flex flex-col items-center text-center">
      <div
        className={`flex size-20 items-center justify-center rounded-full ${
          confirmed ? 'bg-paid-tint' : 'bg-owed-tint'
        }`}
      >
        {confirmed ? (
          <CalendarCheck className="size-10 text-paid" />
        ) : (
          <CalendarX className="size-10 text-owed" />
        )}
      </div>
      <h2 className="mt-5 text-2xl font-bold text-ink">
        {confirmed ? 'ההגעה אושרה' : 'עדכנו את המאמן'}
      </h2>
      <p className="mt-2 text-muted text-pretty">
        {confirmed
          ? 'תודה! נתראה באימון. אישור נשלח למאמן.'
          : 'הודענו למאמן שלא תוכל/י להגיע. הוא יחזור אליך לתיאום מועד חדש.'}
      </p>
      <button onClick={onReset} className="mt-5 text-sm font-semibold text-court underline">
        שינוי תשובה
      </button>
    </div>
  )
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2 text-ink">
      {icon}
      <span>{children}</span>
    </div>
  )
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center bg-canvas px-5 py-10">
      <div className="w-full">{children}</div>
    </main>
  )
}

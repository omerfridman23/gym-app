'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { CalendarCheck, CalendarX, Check, Clock, MapPin, X } from 'lucide-react'
import { findSessionAnywhere } from '@/lib/public'
import { addMinutesToTime, formatHebrewDate } from '@/lib/format'

type Answer = 'confirmed' | 'declined' | null

export default function ConfirmPage() {
  const params = useParams<{ id: string }>()
  const info = useMemo(() => findSessionAnywhere(params.id), [params.id])
  const [answer, setAnswer] = useState<Answer>(null)

  if (!info || !info.client) {
    return (
      <PublicShell>
        <div className="text-center">
          <h1 className="text-xl font-semibold text-ink">הקישור לא נמצא</h1>
          <p className="mt-2 text-muted">ייתכן שהקישור פג תוקף. פנה/י למאמן.</p>
        </div>
      </PublicShell>
    )
  }

  const { session, client, coachName } = info
  const endTime = addMinutesToTime(session.time, session.durationMin)

  return (
    <PublicShell>
      <header className="text-center">
        <p className="text-sm font-medium text-muted">אישור אימון · {coachName}</p>
        <h1 className="mt-1 text-xl font-bold text-ink">שלום {client.name.split(' ')[0]}</h1>
      </header>

      {/* Session card */}
      <div className="mt-6 overflow-hidden rounded-3xl border border-line bg-card shadow-card">
        <div className="bg-gradient-to-b from-court to-court-strong px-6 py-7 text-center">
          <p className="text-sm font-medium text-white/80">האימון שלך</p>
          <p className="mt-1 text-2xl font-bold text-white text-balance">
            {formatHebrewDate(session.date)}
          </p>
        </div>
        <div className="space-y-3 px-6 py-5 text-sm">
          <Row icon={<Clock className="size-4 text-court" />}>
            <span className="ltr-nums font-medium">
              {session.time}–{endTime}
            </span>
          </Row>
          {session.location ? (
            <Row icon={<MapPin className="size-4 text-court" />}>{session.location}</Row>
          ) : null}
        </div>
      </div>

      {answer === null ? (
        <>
          <p className="mt-7 text-center text-sm text-muted">האם תגיע/י לאימון?</p>
          <div className="mt-3 flex flex-col gap-3">
            <button
              onClick={() => setAnswer('confirmed')}
              className="flex items-center justify-center gap-2 rounded-2xl bg-court py-4 text-base font-semibold text-white shadow-btn transition active:scale-[0.98] active:bg-court-strong"
            >
              <Check className="size-5" />
              מאשר/ת הגעה
            </button>
            <button
              onClick={() => setAnswer('declined')}
              className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-card py-4 text-base font-semibold text-ink transition active:scale-[0.98] active:bg-court-tint"
            >
              <X className="size-5" />
              לא אוכל להגיע
            </button>
          </div>
        </>
      ) : (
        <Result answer={answer} onReset={() => setAnswer(null)} />
      )}

      <p className="mt-7 text-center text-xs text-muted">הדגמה בלבד</p>
    </PublicShell>
  )
}

function Result({ answer, onReset }: { answer: Exclude<Answer, null>; onReset: () => void }) {
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

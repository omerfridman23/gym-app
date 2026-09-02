'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Check, CheckCircle2, ShieldCheck } from 'lucide-react'
import { findClientAnywhere, publicUnpaid } from '@/lib/public'
import { formatShekel, formatHebrewDateShort } from '@/lib/format'
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/mock-data'

export default function PayPage() {
  const params = useParams<{ id: string }>()
  const info = useMemo(() => findClientAnywhere(params.id), [params.id])
  const sessions = useMemo(
    () => (info ? publicUnpaid(info.dataset, info.client.id) : []),
    [info],
  )
  const total = sessions.reduce((sum, s) => sum + s.priceAgorot, 0)

  const [method, setMethod] = useState<PaymentMethod>('bit')
  const [paid, setPaid] = useState(false)

  if (!info) {
    return <PublicShell><NotFound /></PublicShell>
  }

  if (paid || total === 0) {
    return (
      <PublicShell>
        <div className="flex flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-paid-tint">
            <CheckCircle2 className="size-9 text-paid" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold text-ink">התשלום התקבל</h1>
          <p className="mt-2 font-medium text-muted text-pretty">
            תודה! שילמת {formatShekel(total || 1)} ל{info.coachName}. אישור נשלח בוואטסאפ.
          </p>
        </div>
      </PublicShell>
    )
  }

  return (
    <PublicShell>
      <header className="text-center">
        <p className="text-sm font-semibold text-muted">תשלום ל{info.coachName}</p>
        <h1 className="mt-1 text-lg font-extrabold text-ink">שלום {info.client.name.split(' ')[0]}</h1>
      </header>

      {/* Amount */}
      <div className="mt-5 rounded-3xl bg-owed-gradient px-4 py-7 text-center text-white shadow-md">
        <p className="text-sm font-semibold text-white/85">סכום לתשלום</p>
        <p className="ltr-nums mt-1 text-[52px] font-extrabold leading-none tracking-tight">{formatShekel(total)}</p>
        <p className="mt-3 text-sm font-medium text-white/85">על {sessions.length} אימונים</p>
      </div>

      {/* Breakdown */}
      <ul className="mt-4 divide-y divide-line/70 overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-line/60">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium text-ink">אימון · {formatHebrewDateShort(s.date)}</span>
            <span className="ltr-nums text-sm font-bold text-ink">{formatShekel(s.priceAgorot)}</span>
          </li>
        ))}
      </ul>

      {/* Method */}
      <p className="mb-2 mt-5 text-sm font-bold text-muted">אמצעי תשלום</p>
      <div className="grid grid-cols-2 gap-2">
        {PAYMENT_METHODS.map((m) => {
          const active = method === m.id
          return (
            <button
              key={m.id}
              onClick={() => setMethod(m.id)}
              className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-bold ring-1 transition ${
                active
                  ? 'bg-court-tint text-court ring-court'
                  : 'bg-surface text-ink ring-line/60'
              }`}
            >
              {m.label}
              {active ? <Check className="size-4" /> : null}
            </button>
          )
        })}
      </div>

      <button
        onClick={() => setPaid(true)}
        className="mt-5 w-full rounded-2xl bg-court-gradient py-4 text-base font-bold text-white shadow-md transition active:scale-[0.98]"
      >
        {`שלם ${formatShekel(total)}`}
      </button>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs font-medium text-muted">
        <ShieldCheck className="size-3.5" />
        תשלום מאובטח · הדגמה בלבד
      </p>
    </PublicShell>
  )
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh justify-center bg-canvas md:items-center md:py-8">
      <div className="flex min-h-dvh w-full max-w-md flex-col justify-center bg-paper px-5 py-10 md:min-h-[min(880px,calc(100dvh-4rem))] md:rounded-[2.25rem] md:shadow-frame md:ring-1 md:ring-black/5">
        <div className="w-full">{children}</div>
      </div>
    </main>
  )
}

function NotFound() {
  return (
    <div className="text-center">
      <h1 className="text-xl font-extrabold text-ink">הקישור לא נמצא</h1>
      <p className="mt-2 font-medium text-muted text-pretty">ייתכן שהקישור פג תוקף. פנה/י למאמן לקבלת קישור חדש.</p>
    </div>
  )
}

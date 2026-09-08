'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Check, CheckCircle2, ShieldCheck } from 'lucide-react'
import { publicApi, type PublicPayInfo } from '@/lib/api'
import { formatShekel, formatHebrewDateShort, toISODate } from '@/lib/format'
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/mock-data'
import { PublicShell } from '@/components/public-shell'

export default function PayPage() {
  const params = useParams<{ id: string }>()
  // undefined = loading, null = link not found
  const [info, setInfo] = useState<PublicPayInfo | null | undefined>(undefined)
  const [method, setMethod] = useState<PaymentMethod>('bit')
  const [paid, setPaid] = useState(false)

  useEffect(() => {
    let cancelled = false
    publicApi
      .getPayInfo(params.id)
      .then((result) => !cancelled && setInfo(result))
      .catch(() => !cancelled && setInfo(null))
    return () => {
      cancelled = true
    }
  }, [params.id])

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
        <NotFound />
      </PublicShell>
    )
  }

  const total = info.totalAgorot

  if (total === 0 && !paid) {
    return (
      <PublicShell framed>
        <div className="flex flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-paid-tint">
            <CheckCircle2 className="size-9 text-paid" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold text-ink">אין חוב פתוח</h1>
          <p className="mt-2 font-medium text-muted text-pretty">
            שלום {info.clientFirstName}, כל התשלומים ל{info.coachName} מעודכנים.
          </p>
        </div>
      </PublicShell>
    )
  }

  if (paid) {
    return (
      <PublicShell framed>
        <div className="flex flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-paid-tint">
            <CheckCircle2 className="size-9 text-paid" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold text-ink">התשלום התקבל</h1>
          <p className="mt-2 font-medium text-muted text-pretty">
            תודה! שילמת {formatShekel(total)} ל{info.coachName}. אישור נשלח בוואטסאפ.
          </p>
        </div>
      </PublicShell>
    )
  }

  return (
    <PublicShell framed>
      <header className="text-center">
        <p className="text-sm font-semibold text-muted">תשלום ל{info.coachName}</p>
        <h1 className="mt-1 text-lg font-extrabold text-ink">שלום {info.clientFirstName}</h1>
      </header>

      {/* Amount */}
      <div className="mt-5 rounded-3xl bg-owed-gradient px-4 py-7 text-center text-white shadow-md">
        <p className="text-sm font-semibold text-white/85">סכום לתשלום</p>
        <p className="ltr-nums mt-1 text-[52px] font-extrabold leading-none tracking-tight">
          {formatShekel(total)}
        </p>
        <p className="mt-3 text-sm font-medium text-white/85">על {info.sessions.length} אימונים</p>
      </div>

      {/* Breakdown */}
      <ul className="mt-4 divide-y divide-line/70 overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-line/60">
        {info.sessions.map((s) => (
          <li key={s.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium text-ink">
              אימון · {formatHebrewDateShort(toISODate(new Date(s.startsAt)))}
            </span>
            <span className="ltr-nums text-sm font-bold text-ink">
              {formatShekel(s.priceAgorot)}
            </span>
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
                active ? 'bg-court-tint text-court ring-court' : 'bg-surface text-ink ring-line/60'
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
        תשלום מאובטח · הדגמה בלבד — הסליקה עצמה עדיין לא מחוברת
      </p>
    </PublicShell>
  )
}


function NotFound() {
  return (
    <div className="text-center">
      <h1 className="text-xl font-extrabold text-ink">הקישור לא נמצא</h1>
      <p className="mt-2 font-medium text-muted text-pretty">
        ייתכן שהקישור פג תוקף. פנה/י למאמן לקבלת קישור חדש.
      </p>
    </div>
  )
}

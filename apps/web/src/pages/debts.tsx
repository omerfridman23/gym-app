'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { BarChart3, Check, MessageCircle, PartyPopper, Send } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { InitialsAvatar } from '@/components/initials-avatar'
import { BottomSheet } from '@/components/bottom-sheet'
import { debtors, useData, type Debtor } from '@/lib/data'
import { daysAgoLabel, formatShekel } from '@/lib/format'
import { fillTemplate } from '@/lib/templates'
import { isWhatsappPhone, waLink } from '@/lib/whatsapp'
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/mock-data'

export default function DebtsPage() {
  const { ds, today, config, actions } = useData()
  const [payFor, setPayFor] = useState<Debtor | null>(null)
  const [method, setMethod] = useState<PaymentMethod>('bit')
  // Amount collected in this screen visit (for the "collected" banner).
  const [totalCollected, setTotalCollected] = useState(0)
  // "Nudge all" guided flow: index into the debtor list, -1 = closed.
  const [nudgeIndex, setNudgeIndex] = useState(-1)
  const [nudgeSent, setNudgeSent] = useState(0)
  const nudgeActionRef = useRef<HTMLAnchorElement | HTMLButtonElement>(null)

  const list = useMemo(() => debtors(ds), [ds])
  const nudgeList = useMemo(
    () => list.filter((d) => isWhatsappPhone(d.client.phone)),
    [list],
  )
  const invalidPhoneCount = list.length - nudgeList.length

  useEffect(() => {
    if (nudgeIndex > 0) nudgeActionRef.current?.focus()
  }, [nudgeIndex])

  const total = list.reduce((sum, d) => sum + d.amount, 0)

  const debtMessage = (d: Debtor) =>
    fillTemplate(ds.settings.templates.debt, {
      שם: d.client.name.split(' ')[0],
      מאמן: ds.settings.name,
      סכום: formatShekel(d.amount),
      מספר: String(d.sessions.length),
      קישור: `${window.location.origin}/pay/${d.client.id}`,
    })

  return (
    <>
      <AppHeader
        title="כסף"
        action={
          <Link
            href="/reports"
            aria-label="דוחות"
            className="flex size-10 items-center justify-center rounded-full bg-surface text-ink shadow-sm ring-1 ring-line/60 transition active:scale-95"
          >
            <BarChart3 className="size-5" />
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {/* Total outstanding hero */}
        <section className="mx-5 mt-1 rounded-3xl bg-owed-gradient px-5 py-7 text-center text-white shadow-md">
          <p className="text-sm font-semibold text-white/85">סך חובות פתוחים</p>
          <p className="ltr-nums mt-1 text-[52px] font-extrabold leading-none tracking-tight">
            {formatShekel(total)}
          </p>
          <p className="mt-3 text-sm font-medium text-white/85">
            {list.length > 0 ? `מ-${list.length} ${config.terms.clients}` : 'הכל שולם'}
          </p>
          {list.length > 1 && nudgeList.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setNudgeIndex(0)
                setNudgeSent(0)
              }}
              className="mx-auto mt-4 flex items-center justify-center gap-1.5 rounded-full bg-white/15 px-5 py-2.5 text-sm font-bold text-white ring-1 ring-white/30 backdrop-blur transition active:scale-[0.97]"
            >
              <Send className="size-4" />
              בקש תשלום בוואטסאפ ({nudgeList.length})
            </button>
          ) : null}
        </section>

        {totalCollected > 0 ? (
          <div className="mx-5 mt-3 flex items-center justify-center gap-2 rounded-2xl bg-paid-tint px-4 py-2.5">
            <Check className="size-4 text-paid" />
            <p className="text-sm font-bold text-paid">
              נגבו {formatShekel(totalCollected)} בסשן זה
            </p>
          </div>
        ) : null}

        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-paid-tint">
              <Check className="size-8 text-paid" />
            </div>
            <p className="mt-4 text-lg font-bold text-ink">אין חובות פתוחים</p>
            <p className="mt-1 text-sm text-muted">כל התשלומים מעודכנים.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5 px-5 py-4">
            {list.map((d) => (
              <li
                key={d.client.id}
                className="rounded-2xl bg-surface p-3.5 shadow-sm ring-1 ring-line/60"
              >
                <div className="flex items-center gap-3">
                  <Link href={`/clients/${d.client.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <InitialsAvatar name={d.client.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold text-ink">{d.client.name}</p>
                      <p className="mt-0.5 text-sm font-medium text-muted">
                        {d.sessions.length} אימונים · {daysAgoLabel(d.lastDateISO, today)}
                      </p>
                    </div>
                  </Link>
                  <p className="ltr-nums shrink-0 text-xl font-extrabold text-owed">{formatShekel(d.amount)}</p>
                </div>
                <div className="mt-3 flex gap-2">
                  {isWhatsappPhone(d.client.phone) ? (
                    <a
                      href={waLink(d.client.phone, debtMessage(d))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink py-2.5 text-sm font-bold text-canvas shadow-sm transition active:scale-[0.98]"
                    >
                      <MessageCircle className="size-4" />
                      בקש תשלום
                    </a>
                  ) : (
                    <span className="flex flex-1 items-center justify-center rounded-xl bg-surface-2 py-2.5 text-sm font-bold text-muted">
                      טלפון לא תקין
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setPayFor(d)
                      setMethod('bit')
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-2 py-2.5 text-sm font-bold text-ink transition active:scale-[0.98]"
                  >
                    <Check className="size-4" />
                    סמן כשולם
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* "Nudge all": one tap per debtor, each opens a prefilled WhatsApp.
          Browsers only allow one window per user gesture, so the flow steps
          through the list instead of opening everything at once. */}
      <BottomSheet
        open={nudgeIndex >= 0}
        onClose={() => setNudgeIndex(-1)}
        title="תזכורות תשלום"
      >
        {nudgeIndex >= 0 && nudgeIndex < nudgeList.length ? (
          (() => {
            const d = nudgeList[nudgeIndex]
            return (
              <div className="flex flex-col gap-4">
                <p
                  className="text-center text-sm font-semibold text-muted"
                  aria-live="polite"
                >
                  {nudgeIndex + 1} מתוך {nudgeList.length}
                </p>
                {invalidPhoneCount > 0 ? (
                  <p className="text-center text-xs font-semibold text-owed">
                    {invalidPhoneCount} לא נכללו בגלל מספר טלפון לא תקין
                  </p>
                ) : null}
                <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-4">
                  <InitialsAvatar name={d.client.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold text-ink">{d.client.name}</p>
                    <p className="mt-0.5 text-sm font-medium text-muted">
                      {d.sessions.length} אימונים · {daysAgoLabel(d.lastDateISO, today)}
                    </p>
                  </div>
                  <p className="ltr-nums shrink-0 text-xl font-extrabold text-owed">
                    {formatShekel(d.amount)}
                  </p>
                </div>
                <a
                  ref={nudgeActionRef as React.Ref<HTMLAnchorElement>}
                  href={waLink(d.client.phone, debtMessage(d))}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    setNudgeSent((n) => n + 1)
                    setNudgeIndex((i) => i + 1)
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-court-gradient py-4 text-base font-bold text-white shadow-md transition active:scale-[0.98]"
                >
                  <MessageCircle className="size-5" />
                  פתח בוואטסאפ
                </a>
                <button
                  type="button"
                  onClick={() => setNudgeIndex((i) => i + 1)}
                  className="w-full rounded-2xl bg-surface-2 py-3 text-sm font-bold text-muted transition active:scale-[0.98]"
                >
                  דלג
                </button>
              </div>
            )
          })()
        ) : nudgeIndex >= nudgeList.length ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-paid-tint">
              <PartyPopper className="size-8 text-paid" />
            </div>
            <div>
              <p className="text-lg font-bold text-ink">
                {nudgeSent > 0
                  ? `נפתחו ${nudgeSent} שיחות בוואטסאפ`
                  : 'לא נפתחו שיחות'}
              </p>
              <p className="mt-1 text-sm text-muted">
                {nudgeSent > 0
                  ? 'ודאו שלחצתם שליחה בכל שיחה שנפתחה.'
                  : 'אפשר לחזור לזה בכל רגע.'}
              </p>
            </div>
            <button
              ref={nudgeActionRef as React.Ref<HTMLButtonElement>}
              type="button"
              onClick={() => setNudgeIndex(-1)}
              className="w-full rounded-2xl bg-ink py-3.5 text-base font-bold text-canvas transition active:scale-[0.98]"
            >
              סגור
            </button>
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={payFor !== null}
        onClose={() => setPayFor(null)}
        title={payFor ? `תשלום · ${payFor.client.name.split(' ')[0]}` : ''}
      >
        {payFor ? (
          <div className="flex flex-col gap-5">
            <div className="rounded-2xl bg-surface-2 px-4 py-4 text-center">
              <p className="text-sm font-medium text-muted">סכום החוב</p>
              <p className="ltr-nums mt-0.5 text-3xl font-extrabold text-ink">{formatShekel(payFor.amount)}</p>
              <p className="mt-1 text-xs font-medium text-muted">{payFor.sessions.length} אימונים</p>
            </div>
            <div>
              <p className="mb-2 text-sm font-bold text-ink">אמצעי תשלום</p>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    aria-pressed={method === m.id}
                    className={`rounded-xl py-3 text-sm font-bold ring-1 transition ${
                      method === m.id
                        ? 'bg-court-tint text-court ring-court'
                        : 'bg-surface text-muted ring-line/60'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                void actions.recordPayment(
                  payFor.client.id,
                  payFor.amount,
                  method,
                  payFor.sessions.map((s) => s.id),
                )
                setTotalCollected((sum) => sum + payFor.amount)
                setPayFor(null)
              }}
              className="w-full rounded-2xl bg-court-gradient py-4 text-base font-bold text-white shadow-md transition active:scale-[0.98]"
            >
              אשר תשלום {formatShekel(payFor.amount)}
            </button>
          </div>
        ) : null}
      </BottomSheet>
    </>
  )
}

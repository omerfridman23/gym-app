'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { InitialsAvatar } from '@/components/initials-avatar'
import { useData, totalOutstanding } from '@/lib/data'
import { fromISODate, formatShekel, MONTHS_HE } from '@/lib/format'

type Range = 'month' | 'week' | 'all'

const RANGE_LABELS: Record<Range, string> = {
  week: 'השבוע',
  month: 'החודש',
  all: 'הכל',
}

export default function ReportsPage() {
  const { ds, today, config } = useData()
  const [range, setRange] = useState<Range>('month')
  const [selectedMonth, setSelectedMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  )

  const inRange = useMemo(() => {
    return (iso: string) => {
      const d = fromISODate(iso)
      if (range === 'all') return true
      if (range === 'month') {
        return (
          d.getMonth() === selectedMonth.getMonth() &&
          d.getFullYear() === selectedMonth.getFullYear()
        )
      }
      // week: within the last 7 days up to today
      const diff = (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
      return diff >= 0 && diff < 7
    }
  }, [range, selectedMonth, today])

  const stats = useMemo(() => {
    const done = ds.sessions.filter((s) => s.status === 'done' && inRange(s.date))
    const chargeable = done.filter((s) => !s.fromPackage && s.priceAgorot > 0)

    const collected = chargeable.filter((s) => s.paid).reduce((sum, s) => sum + s.priceAgorot, 0)
    const owed = chargeable.filter((s) => !s.paid).reduce((sum, s) => sum + s.priceAgorot, 0)

    // Revenue = income collected from sessions + prepaid packages bought in range
    const packageRevenue = ds.packages
      .filter((p) => inRange(p.date))
      .reduce((sum, p) => sum + p.purchasedAgorot, 0)
    const revenue = collected + packageRevenue
    const collectRate = collected + owed > 0 ? Math.round((collected / (collected + owed)) * 100) : 100

    const arrived = done.filter((s) => s.attendance === 'arrived').length
    const noShow = done.filter((s) => s.attendance === 'no_show').length
    const attendanceRate = arrived + noShow > 0 ? Math.round((arrived / (arrived + noShow)) * 100) : 100

    // Sessions per client (chargeable + package), for the top list
    const byClient = new Map<string, { count: number; revenue: number }>()
    for (const s of done) {
      const cur = byClient.get(s.clientId) ?? { count: 0, revenue: 0 }
      cur.count += 1
      cur.revenue += s.fromPackage ? 0 : s.priceAgorot
      byClient.set(s.clientId, cur)
    }
    const topClients = [...byClient.entries()]
      .map(([clientId, v]) => ({ client: ds.clients.find((c) => c.id === clientId), ...v }))
      .filter((x) => x.client)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      sessionCount: done.length,
      revenue,
      collected,
      owed,
      collectRate,
      attendanceRate,
      arrived,
      noShow,
      topClients,
    }
  }, [ds, inRange])

  const outstanding = totalOutstanding(ds)
  const monthLabel = `${MONTHS_HE[selectedMonth.getMonth()]} ${selectedMonth.getFullYear()}`
  const rangeLabel = range === 'month' ? monthLabel : RANGE_LABELS[range]

  const moveMonth = (offset: number) => {
    setSelectedMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1),
    )
  }

  return (
    <>
      <AppHeader
        title="דוחות"
        subtitle={rangeLabel}
        action={
          <Link
            href="/debts"
            aria-label="חזרה לכסף"
            className="flex size-10 items-center justify-center rounded-full bg-surface text-ink shadow-sm ring-1 ring-line/60 transition active:scale-95"
          >
            <ArrowRight className="size-5" />
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto pb-6">
        {/* Range segmented control */}
        <div className="px-5 pt-1">
          <div className="flex rounded-2xl bg-surface-2 p-1" role="tablist">
            {(['week', 'month', 'all'] as Range[]).map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={range === r}
                onClick={() => setRange(r)}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${
                  range === r ? 'bg-surface text-court shadow-sm' : 'text-muted'
                }`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>

          {range === 'month' ? (
            <div className="mt-3 flex items-center justify-between rounded-2xl bg-surface px-2 py-2 shadow-sm ring-1 ring-line/60">
              <button
                type="button"
                onClick={() => moveMonth(-1)}
                aria-label="חודש קודם"
                className="flex size-10 items-center justify-center rounded-xl text-ink transition hover:bg-surface-2 active:scale-95"
              >
                <ChevronRight className="size-5" />
              </button>
              <p className="text-sm font-extrabold text-ink" aria-live="polite">
                {monthLabel}
              </p>
              <button
                type="button"
                onClick={() => moveMonth(1)}
                aria-label="חודש הבא"
                className="flex size-10 items-center justify-center rounded-xl text-ink transition hover:bg-surface-2 active:scale-95"
              >
                <ChevronLeft className="size-5" />
              </button>
            </div>
          ) : null}
        </div>

        {/* Revenue hero */}
        <section className="mx-5 mt-4 rounded-3xl bg-court-gradient p-5 text-white shadow-md">
          <div className="flex items-center gap-2 text-white/85">
            <TrendingUp className="size-4" />
            <p className="text-sm font-semibold">הכנסות {rangeLabel}</p>
          </div>
          <p className="ltr-nums mt-1 text-[42px] font-extrabold leading-none tracking-tight">
            {formatShekel(stats.revenue)}
          </p>
          <p className="mt-2 text-sm font-medium text-white/85">
            {stats.sessionCount} {config.terms.sessions} בוצעו
          </p>
        </section>

        {/* Collection + attendance */}
        <div className="mx-5 mt-3 grid grid-cols-2 gap-3">
          <RateCard
            label="אחוז גבייה"
            value={`${stats.collectRate}%`}
            hint={`${formatShekel(stats.collected)} נגבו`}
            tone="paid"
            pct={stats.collectRate}
          />
          <RateCard
            label="אחוז הגעה"
            value={`${stats.attendanceRate}%`}
            hint={`${stats.noShow} לא הגיעו`}
            tone="court"
            pct={stats.attendanceRate}
          />
        </div>

        {/* Outstanding callout */}
        {outstanding > 0 ? (
          <Link
            href="/debts"
            className="mx-5 mt-3 flex items-center justify-between rounded-2xl bg-owed-tint px-4 py-3.5 ring-1 ring-owed/15 transition active:scale-[0.99]"
          >
            <div>
              <p className="text-sm font-semibold text-muted">חובות פתוחים כרגע</p>
              <p className="ltr-nums mt-0.5 text-2xl font-extrabold text-owed">{formatShekel(outstanding)}</p>
            </div>
            <span className="text-sm font-bold text-owed">לגבייה ←</span>
          </Link>
        ) : null}

        {/* Top clients */}
        <section className="mt-6">
          <h2 className="px-5 pb-2 text-sm font-bold text-muted">
            {config.terms.clients} מובילים {rangeLabel}
          </h2>
          {stats.topClients.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">אין נתונים בטווח הזה</p>
          ) : (
            <ul className="flex flex-col gap-2 px-5">
              {stats.topClients.map(({ client, count, revenue }) => (
                <li key={client!.id}>
                  <Link
                    href={`/clients/${client!.id}`}
                    className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-sm ring-1 ring-line/60 transition active:scale-[0.995]"
                  >
                    <InitialsAvatar name={client!.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-ink">{client!.name}</p>
                      <p className="text-sm font-medium text-muted">
                        {count} {count === 1 ? 'אימון' : 'אימונים'}
                      </p>
                    </div>
                    <p className="ltr-nums shrink-0 font-extrabold text-ink">{formatShekel(revenue)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

function RateCard({
  label,
  value,
  hint,
  tone,
  pct,
}: {
  label: string
  value: string
  hint: string
  tone: 'paid' | 'court'
  pct: number
}) {
  const barColor = tone === 'paid' ? 'bg-paid' : 'bg-court'
  const textColor = tone === 'paid' ? 'text-paid' : 'text-court'
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line/60">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className={`ltr-nums mt-1 text-3xl font-extrabold ${textColor}`}>{value}</p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <p className="mt-2 text-xs font-medium text-muted">{hint}</p>
    </div>
  )
}

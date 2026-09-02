import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { formatShekel } from '@/lib/format'

export function MetricTiles({
  sessionsToday,
  confirmed,
  outstanding,
}: {
  sessionsToday: number
  confirmed: number
  outstanding: number
}) {
  return (
    <div className="grid grid-cols-2 gap-3 px-5 pb-1 pt-2">
      <Tile label="אימונים היום" value={String(sessionsToday)} />
      <Tile label="אישרו" value={`${confirmed}/${sessionsToday}`} />
      <Tile
        label="חוב פתוח"
        value={formatShekel(outstanding)}
        href={outstanding > 0 ? '/debts' : undefined}
        tone={outstanding > 0 ? 'owed' : 'default'}
        wide
      />
    </div>
  )
}

function Tile({
  label,
  value,
  href,
  tone = 'default',
  wide = false,
}: {
  label: string
  value: string
  href?: string
  tone?: 'default' | 'owed'
  wide?: boolean
}) {
  const owed = tone === 'owed'
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-semibold ${owed ? 'text-white/80' : 'text-muted'}`}>
          {label}
        </span>
        {href ? (
          <ChevronLeft className={`size-4 ${owed ? 'text-white/80' : 'text-muted'}`} />
        ) : null}
      </div>
      <div
        className={`ltr-nums mt-2 text-[28px] font-extrabold leading-none tracking-tight ${
          owed ? 'text-white' : 'text-ink'
        }`}
      >
        {value}
      </div>
    </>
  )
  const base = `flex flex-col justify-between rounded-2xl p-4 text-start ${
    owed ? 'bg-owed-gradient shadow-md' : 'bg-surface shadow-sm ring-1 ring-line/60'
  } ${wide ? 'col-span-2' : ''}`

  if (href) {
    return (
      <Link href={href} className={`${base} transition active:scale-[0.99]`}>
        {body}
      </Link>
    )
  }
  return <div className={base}>{body}</div>
}

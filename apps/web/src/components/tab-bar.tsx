'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarRange, House, Users, Wallet } from 'lucide-react'
import { useData, debtors } from '@/lib/data'

const TABS = [
  { href: '/', label: 'היום', icon: House, match: (p: string) => p === '/' },
  { href: '/calendar', label: 'יומן', icon: CalendarRange, match: (p: string) => p.startsWith('/calendar') },
  { href: '/clients', label: 'מתאמנים', icon: Users, match: (p: string) => p.startsWith('/clients') },
  { href: '/debts', label: 'כסף', icon: Wallet, match: (p: string) => p.startsWith('/debts') || p.startsWith('/reports') },
]

export function TabBar() {
  const pathname = usePathname()
  const { ds } = useData()
  const debtorCount = debtors(ds).length

  return (
    <nav
      className="sticky bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
      aria-label="ניווט ראשי"
    >
      <ul className="mx-auto flex max-w-md items-stretch gap-1 rounded-full bg-surface/95 p-1.5 shadow-lg ring-1 ring-line backdrop-blur">
        {TABS.map((tab) => {
          const active = tab.match(pathname)
          const Icon = tab.icon
          const showBadge = tab.href === '/debts' && debtorCount > 0
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-[46px] flex-col items-center justify-center gap-0.5 rounded-full py-1 text-[11px] font-bold transition-colors duration-200 ${
                  active ? 'bg-ink text-canvas' : 'text-muted active:text-ink'
                }`}
              >
                <span className="relative">
                  <Icon className="size-[21px]" strokeWidth={active ? 2.5 : 2} />
                  {showBadge ? (
                    <span className="ltr-nums absolute -top-2 -end-2.5 flex min-w-[18px] items-center justify-center rounded-full bg-court px-1 text-[10px] font-bold leading-[18px] text-canvas ring-2 ring-surface">
                      {debtorCount}
                    </span>
                  ) : null}
                </span>
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

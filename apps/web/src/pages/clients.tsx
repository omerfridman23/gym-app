'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Plus, Search } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { InitialsAvatar } from '@/components/initials-avatar'
import { NewClientSheet } from '@/components/new-client-sheet'
import { outstandingFor, packageFor, useData } from '@/lib/data'
import { formatShekel } from '@/lib/format'
import type { Client } from '@/lib/mock-data'

export default function ClientsPage() {
  const { ds, config } = useData()
  const [query, setQuery] = useState('')
  const [added, setAdded] = useState<Client[]>([])
  const [newOpen, setNewOpen] = useState(false)

  const clients = useMemo(() => {
    const all = [...ds.clients, ...added]
    const q = query.trim()
    const filtered = q ? all.filter((c) => c.name.includes(q) || c.phone.includes(q)) : all
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'he'))
  }, [ds.clients, added, query])

  return (
    <>
      <AppHeader title={config.terms.clients} subtitle={`${ds.clients.length + added.length} ${config.terms.clients}`} />

      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-paper/80 px-5 pb-2 pt-1 backdrop-blur-xl">
          <div className="relative">
            <Search className="pointer-events-none absolute end-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`חיפוש ${config.terms.client}...`}
              className="w-full rounded-2xl bg-surface py-3 pe-11 ps-4 text-base font-medium text-ink shadow-sm ring-1 ring-line/60 outline-none transition focus:ring-2 focus:ring-court"
            />
          </div>
        </div>

        {clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <p className="text-base font-bold text-ink">לא נמצאו {config.terms.clients}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2 px-5 py-3">
            {clients.map((c) => {
              const owed = outstandingFor(ds, c.id)
              const pkg = packageFor(ds, c)
              return (
                <li key={c.id}>
                  <Link
                    href={`/clients/${c.id}`}
                    className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-sm ring-1 ring-line/60 transition active:scale-[0.995] active:bg-court-tint"
                  >
                    <InitialsAvatar name={c.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold text-ink">{c.name}</p>
                      <p className="mt-0.5 truncate text-sm font-medium text-muted">
                        {pkg ? `כרטיסייה · נותרו ${pkg.remaining}` : Object.values(c.fields)[0] || c.phone}
                      </p>
                    </div>
                    {owed > 0 ? (
                      <span className="ltr-nums shrink-0 rounded-full bg-owed-tint px-2.5 py-1 text-sm font-bold text-owed">
                        {formatShekel(owed)}
                      </span>
                    ) : null}
                    <ChevronLeft className="size-5 shrink-0 text-muted" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="pointer-events-none sticky bottom-0 bg-gradient-to-t from-paper via-paper/90 to-transparent px-5 pb-4 pt-6">
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="pointer-events-auto flex w-full items-center justify-center gap-2 rounded-2xl bg-court-gradient py-4 text-base font-bold text-white shadow-md transition active:scale-[0.98]"
        >
          <Plus className="size-5" strokeWidth={2.5} />
          {config.terms.client} חדש
        </button>
      </div>

      <NewClientSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreate={(c) => setAdded((prev) => [...prev, c])}
      />
    </>
  )
}

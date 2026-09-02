'use client'

import { useMemo } from 'react'
import { useVertical } from './vertical-context'
import { fromISODate } from './format'
import {
  DATASETS,
  TODAY_ISO,
  type Client,
  type Dataset,
  type Session,
  type SessionPackage,
} from './mock-data'

export const TODAY = fromISODate(TODAY_ISO)

/** A session counts toward debt when it happened, was chargeable, and wasn't paid. */
export function isUnpaidDebt(s: Session): boolean {
  return s.status === 'done' && !s.paid && !s.fromPackage && s.priceAgorot > 0
}

export function unpaidSessions(ds: Dataset, clientId: string): Session[] {
  return ds.sessions
    .filter((s) => s.clientId === clientId && isUnpaidDebt(s))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function outstandingFor(ds: Dataset, clientId: string): number {
  return unpaidSessions(ds, clientId).reduce((sum, s) => sum + s.priceAgorot, 0)
}

export function packageFor(ds: Dataset, client: Client): SessionPackage | undefined {
  return client.packageId ? ds.packages.find((p) => p.id === client.packageId) : undefined
}

export function clientById(ds: Dataset, id: string): Client | undefined {
  return ds.clients.find((c) => c.id === id)
}

export interface Debtor {
  client: Client
  amount: number
  sessions: Session[]
  lastDateISO: string
}

export function debtors(ds: Dataset): Debtor[] {
  return ds.clients
    .map((client) => {
      const sessions = unpaidSessions(ds, client.id)
      const amount = sessions.reduce((sum, s) => sum + s.priceAgorot, 0)
      return { client, amount, sessions, lastDateISO: sessions[0]?.date ?? '' }
    })
    .filter((d) => d.amount > 0)
    .sort((a, b) => b.amount - a.amount)
}

export function totalOutstanding(ds: Dataset): number {
  return ds.clients.reduce((sum, c) => sum + outstandingFor(ds, c.id), 0)
}

export function sessionsOn(ds: Dataset, iso: string): Session[] {
  return ds.sessions
    .filter((s) => s.date === iso)
    .sort((a, b) => (a.time < b.time ? -1 : 1))
}

export function useData() {
  const { vertical, config } = useVertical()
  const ds = DATASETS[vertical]

  return useMemo(
    () => ({
      vertical,
      config,
      ds,
      today: TODAY,
      todayISO: TODAY_ISO,
    }),
    [vertical, config, ds],
  )
}

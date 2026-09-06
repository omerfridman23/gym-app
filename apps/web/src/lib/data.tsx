'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  dataApi,
  type ApiClient,
  type ApiPackage,
  type ApiPayment,
  type ApiSession,
  type CoachProfile,
  type UpdateCoachInput,
  type UpdateSessionInput,
} from './api'
import { useAuth } from './auth-context'
import { useVertical } from './vertical-context'
import { addDays, fromISODate, toISODate } from './format'
import type {
  Client,
  CoachSettings,
  Dataset,
  Payment,
  PaymentMethod,
  Session,
  SessionPackage,
} from './mock-data'

export const TODAY_ISO = toISODate(new Date())
export const TODAY = fromISODate(TODAY_ISO)

/** How far back/forward sessions are loaded (enough for reports + calendar). */
const PAST_DAYS = 365
const FUTURE_DAYS = 120

export const DEFAULT_TEMPLATES = {
  reminder: 'היי {שם}, מזכיר לך את האימון מחר ב-{שעה} ב{מיקום}. מאשר/ת? {קישור}',
  debt: 'היי {שם}, נותר חוב פתוח של {סכום} על {מספר} אימונים. אפשר להסדיר כאן: {קישור}',
}

const EMPTY_SETTINGS: CoachSettings = {
  name: '',
  defaultPriceAgorot: 0,
  reminderHoursBefore: 24,
  cancellationPolicy: '',
  templates: DEFAULT_TEMPLATES,
}

const EMPTY_DATASET: Dataset = {
  settings: EMPTY_SETTINGS,
  clients: [],
  sessions: [],
  packages: [],
  payments: [],
}

// --- API row → UI shape mapping (dates shown in the browser's local time) ---

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toUiSession(s: ApiSession): Session {
  const start = new Date(s.startsAt)
  const ended = start.getTime() + s.durationMin * 60_000 < Date.now()
  return {
    id: s.id,
    clientId: s.clientId,
    typeId: s.typeId,
    date: toISODate(start),
    time: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    durationMin: s.durationMin,
    location: s.location ?? undefined,
    priceAgorot: s.priceAgorot,
    // A confirmed session whose time has passed counts as done (debt accrues).
    status: s.status === 'confirmed' && ended ? 'done' : s.status,
    paid: s.paid,
    fromPackage: s.packageId !== null,
    reminderSent: s.reminderSent,
    reminderAnswered: s.reminderAnswered,
    attendance: s.attendance ?? undefined,
    cancelReason: s.cancelReason ?? undefined,
  }
}

function toUiPackage(p: ApiPackage): SessionPackage {
  return {
    id: p.id,
    clientId: p.clientId,
    total: p.totalSessions,
    remaining: p.remaining,
    purchasedAgorot: p.purchasedAgorot,
    date: toISODate(new Date(p.purchasedAt)),
  }
}

function toUiPayment(p: ApiPayment): Payment {
  return {
    id: p.id,
    clientId: p.clientId,
    amountAgorot: p.amountAgorot,
    method: p.method,
    date: toISODate(new Date(p.paidAt)),
  }
}

function toUiClient(c: ApiClient, packages: SessionPackage[]): Client {
  const activePackage = packages.find((p) => p.clientId === c.id && p.remaining > 0)
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    fields: c.fields ?? {},
    priceAgorot: c.priceAgorot,
    packageId: activePackage?.id,
  }
}

function toSettings(profile: CoachProfile): CoachSettings {
  return {
    name: profile.name,
    defaultPriceAgorot: profile.defaultPriceAgorot,
    reminderHoursBefore: profile.reminderHoursBefore,
    cancellationPolicy: profile.cancellationPolicy,
    templates: {
      reminder: profile.templates.reminder || DEFAULT_TEMPLATES.reminder,
      debt: profile.templates.debt || DEFAULT_TEMPLATES.debt,
    },
  }
}

// --- Pure helpers shared by the pages (unchanged from the prototype) ---

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

// --- Provider: loads the coach's real data and exposes mutations ---

export interface NewSessionInput {
  clientId: string
  typeId: string
  date: string // yyyy-mm-dd
  time: string // HH:MM
  durationMin: number
  location?: string
  priceAgorot: number
}

export interface NewClientInput {
  name: string
  phone: string
  fields: Record<string, string>
  priceAgorot: number
}

export interface DataActions {
  addClient: (input: NewClientInput) => Promise<void>
  addSession: (input: NewSessionInput, repeatWeekly: boolean) => Promise<void>
  updateSession: (id: string, patch: UpdateSessionInput) => Promise<void>
  /** Record a payment and mark the given sessions as settled, in one transaction. */
  recordPayment: (
    clientId: string,
    amountAgorot: number,
    method: PaymentMethod,
    sessionIds: string[],
  ) => Promise<void>
  saveSettings: (patch: UpdateCoachInput) => Promise<void>
  refresh: () => Promise<void>
}

type DataContextValue = { ds: Dataset; ready: boolean; actions: DataActions }

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { coach } = useAuth()
  const [ds, setDs] = useState<Dataset>(EMPTY_DATASET)
  const [ready, setReady] = useState(false)
  const authed = Boolean(coach?.onboarded)

  const refresh = useCallback(async () => {
    const from = addDays(new Date(), -PAST_DAYS).toISOString()
    const to = addDays(new Date(), FUTURE_DAYS).toISOString()
    const [profile, clients, sessions, packages, payments] = await Promise.all([
      dataApi.getProfile(),
      dataApi.listClients(),
      dataApi.listSessions(from, to),
      dataApi.listPackages(),
      dataApi.listPayments(),
    ])
    const uiPackages = packages.map(toUiPackage)
    setDs({
      settings: toSettings(profile),
      clients: clients.map((c) => toUiClient(c, uiPackages)),
      sessions: sessions.map(toUiSession),
      packages: uiPackages,
      payments: payments.map(toUiPayment),
    })
  }, [])

  useEffect(() => {
    if (!authed) {
      setDs(EMPTY_DATASET)
      setReady(false)
      return
    }
    let cancelled = false
    refresh()
      .catch((error) => {
        console.error('טעינת נתונים נכשלה', error)
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [authed, refresh])

  const addClient = useCallback(async (input: NewClientInput) => {
    const created = await dataApi.createClient(input)
    setDs((prev) => ({
      ...prev,
      clients: [...prev.clients, toUiClient(created, prev.packages)],
    }))
  }, [])

  const addSession = useCallback(async (input: NewSessionInput, repeatWeekly: boolean) => {
    const startsAt = new Date(`${input.date}T${input.time}:00`).toISOString()
    const created = await dataApi.createSession({
      clientId: input.clientId,
      typeId: input.typeId,
      startsAt,
      durationMin: input.durationMin,
      location: input.location,
      priceAgorot: input.priceAgorot,
      repeatWeekly,
    })
    setDs((prev) => ({ ...prev, sessions: [...prev.sessions, ...created.map(toUiSession)] }))
  }, [])

  const updateSession = useCallback(async (id: string, patch: UpdateSessionInput) => {
    const updated = await dataApi.updateSession(id, patch)
    setDs((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => (s.id === id ? toUiSession(updated) : s)),
    }))
  }, [])

  const recordPayment = useCallback(
    async (
      clientId: string,
      amountAgorot: number,
      method: PaymentMethod,
      sessionIds: string[],
    ) => {
      const payment = await dataApi.createPayment({ clientId, amountAgorot, method, sessionIds })
      const settled = new Set(sessionIds)
      setDs((prev) => ({
        ...prev,
        payments: [toUiPayment(payment), ...prev.payments],
        sessions: prev.sessions.map((s) => (settled.has(s.id) ? { ...s, paid: true } : s)),
      }))
    },
    [],
  )

  const saveSettings = useCallback(async (patch: UpdateCoachInput) => {
    const profile = await dataApi.updateProfile(patch)
    setDs((prev) => ({ ...prev, settings: toSettings(profile) }))
  }, [])

  const value = useMemo<DataContextValue>(
    () => ({
      ds,
      ready,
      actions: { addClient, addSession, updateSession, recordPayment, saveSettings, refresh },
    }),
    [ds, ready, addClient, addSession, updateSession, recordPayment, saveSettings, refresh],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within a DataProvider')
  const { vertical, config } = useVertical()

  return useMemo(
    () => ({
      vertical,
      config,
      ds: ctx.ds,
      ready: ctx.ready,
      actions: ctx.actions,
      today: TODAY,
      todayISO: TODAY_ISO,
    }),
    [vertical, config, ctx],
  )
}

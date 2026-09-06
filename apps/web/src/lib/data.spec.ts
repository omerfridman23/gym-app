import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Dataset, Session } from './mock-data'

let helpers: typeof import('./data')

beforeAll(async () => {
  vi.stubGlobal('window', { __API_URL__: undefined })
  helpers = await import('./data')
})

afterAll(() => {
  vi.unstubAllGlobals()
})

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    clientId: 'client-1',
    typeId: 'private',
    date: '2026-09-01',
    time: '18:00',
    durationMin: 60,
    priceAgorot: 18_000,
    status: 'done',
    paid: false,
    fromPackage: false,
    reminderSent: false,
    reminderAnswered: false,
    ...overrides,
  }
}

function dataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    settings: {
      name: 'דני',
      defaultPriceAgorot: 18_000,
      reminderHoursBefore: 24,
      cancellationPolicy: '',
      templates: { reminder: '', debt: '' },
    },
    clients: [
      { id: 'client-1', name: 'יוסי', phone: '0501', fields: {}, priceAgorot: 18_000 },
      { id: 'client-2', name: 'נועה', phone: '0502', fields: {}, priceAgorot: 20_000 },
    ],
    sessions: [],
    packages: [],
    payments: [],
    ...overrides,
  }
}

describe('isUnpaidDebt', () => {
  it('counts a done, unpaid, chargeable, non-package session', () => {
    expect(helpers.isUnpaidDebt(session())).toBe(true)
  })

  it.each([
    ['pending', { status: 'pending' as const }],
    ['confirmed', { status: 'confirmed' as const }],
    ['cancelled', { status: 'cancelled' as const }],
    ['paid', { paid: true }],
    ['package-backed', { fromPackage: true }],
    ['free', { priceAgorot: 0 }],
    ['negative-price', { priceAgorot: -1 }],
  ])('excludes %s sessions', (_label, patch) => {
    expect(helpers.isUnpaidDebt(session(patch))).toBe(false)
  })
})

describe('debt aggregation', () => {
  const ds = () =>
    dataset({
      sessions: [
        session({ id: 'old', clientId: 'client-1', date: '2026-08-01', priceAgorot: 10_000 }),
        session({ id: 'new', clientId: 'client-1', date: '2026-09-01', priceAgorot: 18_000 }),
        session({ id: 'paid', clientId: 'client-1', paid: true, priceAgorot: 99_000 }),
        session({ id: 'other', clientId: 'client-2', priceAgorot: 20_000 }),
      ],
    })

  it('returns only the selected client debt newest-first', () => {
    expect(helpers.unpaidSessions(ds(), 'client-1').map((s) => s.id)).toEqual(['new', 'old'])
  })

  it('sums only listed sessions', () => {
    expect(helpers.outstandingFor(ds(), 'client-1')).toBe(28_000)
  })

  it('sorts debtors by amount descending', () => {
    const result = helpers.debtors(ds())
    expect(result.map((d) => [d.client.id, d.amount])).toEqual([
      ['client-1', 28_000],
      ['client-2', 20_000],
    ])
    expect(result[0].lastDateISO).toBe('2026-09-01')
  })

  it('totals outstanding debt across clients without counting paid sessions', () => {
    expect(helpers.totalOutstanding(ds())).toBe(48_000)
  })

  it('drops clients with no debt', () => {
    expect(helpers.debtors(dataset())).toEqual([])
  })
})

describe('lookup and calendar helpers', () => {
  it('finds a client by id and returns undefined for a foreign id', () => {
    const ds = dataset()
    expect(helpers.clientById(ds, 'client-1')?.name).toBe('יוסי')
    expect(helpers.clientById(ds, 'missing')).toBeUndefined()
  })

  it('resolves only the package selected on the client', () => {
    const pkg = {
      id: 'package-1',
      clientId: 'client-1',
      total: 10,
      remaining: 3,
      purchasedAgorot: 100_000,
      date: '2026-01-01',
    }
    const ds = dataset({ packages: [pkg] })
    const client = { ...ds.clients[0], packageId: 'package-1' }
    expect(helpers.packageFor(ds, client)).toBe(pkg)
    expect(helpers.packageFor(ds, { ...client, packageId: undefined })).toBeUndefined()
  })

  it('returns one day sessions ordered by time', () => {
    const ds = dataset({
      sessions: [
        session({ id: 'late', date: '2026-09-06', time: '20:00' }),
        session({ id: 'other-day', date: '2026-09-07', time: '08:00' }),
        session({ id: 'early', date: '2026-09-06', time: '08:00' }),
      ],
    })
    expect(helpers.sessionsOn(ds, '2026-09-06').map((s) => s.id)).toEqual(['early', 'late'])
  })
})

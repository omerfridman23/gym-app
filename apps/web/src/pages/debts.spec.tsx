// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DebtsPage from './debts'

const dataset = {
  settings: {
    name: 'דנה',
    defaultPriceAgorot: 12500,
    reminderHoursBefore: 24,
    cancellationPolicy: '',
    templates: {
      reminder: '',
      debt: 'היי {שם}, חוב {סכום} על {מספר} אימונים: {קישור}',
    },
    bookingSlug: null,
    bookingEnabled: false,
    bookingStartHour: 8,
    bookingEndHour: 21,
  },
  clients: [
    {
      id: 'client-a',
      name: 'אבי כהן',
      phone: '050-1111111',
      fields: {},
      priceAgorot: 12500,
    },
    {
      id: 'client-b',
      name: 'בתיה לוי',
      phone: '052-2222222',
      fields: {},
      priceAgorot: 18000,
    },
  ],
  sessions: [
    {
      id: 'session-a',
      clientId: 'client-a',
      typeId: 'private',
      date: '2026-09-01',
      time: '10:00',
      durationMin: 60,
      priceAgorot: 12500,
      status: 'done',
      paid: false,
      fromPackage: false,
      reminderSent: false,
      reminderAnswered: false,
    },
    {
      id: 'session-b',
      clientId: 'client-b',
      typeId: 'private',
      date: '2026-09-02',
      time: '11:00',
      durationMin: 60,
      priceAgorot: 18000,
      status: 'done',
      paid: false,
      fromPackage: false,
      reminderSent: false,
      reminderAnswered: false,
    },
  ],
  packages: [],
  payments: [],
}

const mocks = vi.hoisted(() => ({
  recordPayment: vi.fn(),
}))

vi.mock('@/lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data')>()
  return {
    ...actual,
    useData: () => ({
      ds: dataset,
      today: new Date(2026, 8, 8),
      config: { terms: { clients: 'מתאמנים' } },
      actions: { recordPayment: mocks.recordPayment },
    }),
  }
})

vi.mock('@/components/app-header', () => ({
  AppHeader: ({ title }: { title: string }) => <header>{title}</header>,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <DebtsPage />
    </MemoryRouter>,
  )
}

describe('DebtsPage nudge-all flow', () => {
  it('shows the bulk action when more than one client owes money', () => {
    renderPage()
    expect(
      screen.getByRole('button', { name: /בקש תשלום בוואטסאפ/ }),
    ).toBeTruthy()
    expect(screen.getByText('₪305')).toBeTruthy()
  })

  it('opens the largest debt first with a personalized WhatsApp pay link', () => {
    renderPage()
    fireEvent.click(
      screen.getByRole('button', { name: /בקש תשלום בוואטסאפ/ }),
    )

    const dialog = screen.getByRole('dialog', { name: 'תזכורות תשלום' })
    expect(dialog).toBeTruthy()
    expect(within(dialog).getByText('בתיה לוי')).toBeTruthy()
    expect(within(dialog).getByText('1 מתוך 2')).toBeTruthy()

    const link = within(dialog).getByRole('link', { name: 'פתח בוואטסאפ' })
    expect(link.getAttribute('href')).toContain('https://wa.me/972522222222')
    expect(decodeURIComponent(link.getAttribute('href') ?? '')).toContain(
      'http://localhost:3000/pay/client-b',
    )
    expect(decodeURIComponent(link.getAttribute('href') ?? '')).toContain('₪180')
  })

  it('advances after each WhatsApp action and reports the count', () => {
    renderPage()
    fireEvent.click(
      screen.getByRole('button', { name: /בקש תשלום בוואטסאפ/ }),
    )

    fireEvent.click(screen.getByRole('link', { name: 'פתח בוואטסאפ' }))
    const dialog = screen.getByRole('dialog', { name: 'תזכורות תשלום' })
    expect(within(dialog).getByText('אבי כהן')).toBeTruthy()
    expect(within(dialog).getByText('2 מתוך 2')).toBeTruthy()

    fireEvent.click(screen.getByRole('link', { name: 'פתח בוואטסאפ' }))
    expect(screen.getByText('נפתחו 2 שיחות בוואטסאפ')).toBeTruthy()
  })

  it('does not count skipped debtors as sent', () => {
    renderPage()
    fireEvent.click(
      screen.getByRole('button', { name: /בקש תשלום בוואטסאפ/ }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'דלג' }))
    fireEvent.click(screen.getByRole('link', { name: 'פתח בוואטסאפ' }))
    expect(screen.getByText('נפתחו 1 שיחות בוואטסאפ')).toBeTruthy()
  })

  it('moves focus into the dialog and restores it on Escape', async () => {
    renderPage()
    const opener = screen.getByRole('button', {
      name: /בקש תשלום בוואטסאפ/,
    })
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'תזכורות תשלום' })
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'תזכורות תשלום' })).toBeNull()
    expect(opener).toBe(document.activeElement)
  })

  it('omits invalid WhatsApp recipients and explains why', () => {
    const originalPhone = dataset.clients[1].phone
    dataset.clients[1].phone = 'לא מספר'
    try {
      renderPage()
      fireEvent.click(
        screen.getByRole('button', { name: /בקש תשלום בוואטסאפ \(1\)/ }),
      )

      const dialog = screen.getByRole('dialog', { name: 'תזכורות תשלום' })
      expect(within(dialog).getByText('אבי כהן')).toBeTruthy()
      expect(
        within(dialog).getByText('1 לא נכללו בגלל מספר טלפון לא תקין'),
      ).toBeTruthy()
      expect(screen.getAllByText('טלפון לא תקין')).toHaveLength(1)
    } finally {
      dataset.clients[1].phone = originalPhone
    }
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ReportsPage from './reports'

const dataset = {
  settings: {
    name: 'דנה',
    defaultPriceAgorot: 12500,
    reminderHoursBefore: 24,
    cancellationPolicy: '',
    templates: { reminder: '', debt: '' },
  },
  clients: [
    { id: 'august-client', name: 'אוגוסט', phone: '0500000001', fields: {}, priceAgorot: 12500 },
    { id: 'september-client', name: 'ספטמבר', phone: '0500000002', fields: {}, priceAgorot: 12500 },
    { id: 'october-client', name: 'אוקטובר', phone: '0500000003', fields: {}, priceAgorot: 12500 },
  ],
  sessions: [
    {
      id: 'august',
      clientId: 'august-client',
      typeId: 'private',
      date: '2026-08-15',
      time: '10:00',
      durationMin: 60,
      priceAgorot: 10000,
      status: 'done',
      paid: true,
      fromPackage: false,
      reminderSent: false,
      reminderAnswered: false,
      attendance: 'arrived',
    },
    {
      id: 'september',
      clientId: 'september-client',
      typeId: 'private',
      date: '2026-09-07',
      time: '10:00',
      durationMin: 60,
      priceAgorot: 12500,
      status: 'done',
      paid: true,
      fromPackage: false,
      reminderSent: false,
      reminderAnswered: false,
      attendance: 'arrived',
    },
    {
      id: 'october',
      clientId: 'october-client',
      typeId: 'private',
      date: '2026-10-02',
      time: '10:00',
      durationMin: 60,
      priceAgorot: 20000,
      status: 'done',
      paid: true,
      fromPackage: false,
      reminderSent: false,
      reminderAnswered: false,
      attendance: 'no_show',
    },
  ],
  packages: [
    {
      id: 'october-package',
      clientId: 'october-client',
      total: 10,
      remaining: 10,
      purchasedAgorot: 50000,
      date: '2026-10-03',
    },
  ],
  payments: [],
}

vi.mock('@/lib/data', () => ({
  useData: () => ({
    ds: dataset,
    today: new Date(2026, 8, 7),
    config: { terms: { clients: 'מתאמנים', sessions: 'אימונים' } },
  }),
  totalOutstanding: () => 0,
}))

vi.mock('@/components/app-header', () => ({
  AppHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  ),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

afterEach(cleanup)

describe('ReportsPage month navigation', () => {
  it('starts on the current month and shows only its totals', () => {
    render(<ReportsPage />)

    expect(screen.getAllByText('ספטמבר 2026').length).toBeGreaterThan(0)
    expect(screen.getAllByText('₪125').length).toBeGreaterThan(0)
    expect(screen.getByText('ספטמבר')).toBeTruthy()
    expect(screen.queryByText('אוגוסט')).toBeNull()
  })

  it('moves to the previous month and recalculates every report card', () => {
    render(<ReportsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'חודש קודם' }))

    expect(screen.getAllByText('אוגוסט 2026').length).toBeGreaterThan(0)
    expect(screen.getAllByText('₪100').length).toBeGreaterThan(0)
    expect(screen.getByText('אוגוסט')).toBeTruthy()
    expect(screen.queryByText('ספטמבר')).toBeNull()
  })

  it('moves forward and includes package income in the selected month', () => {
    render(<ReportsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'חודש הבא' }))

    expect(screen.getAllByText('אוקטובר 2026').length).toBeGreaterThan(0)
    expect(screen.getByText('₪700')).toBeTruthy()
    expect(screen.getByText('אוקטובר')).toBeTruthy()
    expect(screen.getByText('0%')).toBeTruthy()
  })

  it('shows month controls only for the monthly report', () => {
    render(<ReportsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'חודש קודם' }))
    fireEvent.click(screen.getByRole('tab', { name: 'השבוע' }))
    expect(screen.queryByRole('button', { name: 'חודש קודם' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'חודש הבא' })).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'החודש' }))
    expect(screen.getByRole('button', { name: 'חודש קודם' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'חודש הבא' })).toBeTruthy()
    expect(screen.getAllByText('אוגוסט 2026').length).toBeGreaterThan(0)
  })

  it('crosses year boundaries correctly', () => {
    render(<ReportsPage />)

    for (let i = 0; i < 9; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'חודש קודם' }))
    }

    expect(screen.getAllByText('דצמבר 2025').length).toBeGreaterThan(0)
  })
})

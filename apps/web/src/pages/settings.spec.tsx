// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsPage from './settings'

const mocks = vi.hoisted(() => ({
  saveSettings: vi.fn(),
  logout: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ logout: mocks.logout }),
}))

vi.mock('@/lib/data', () => ({
  useData: () => ({
    ds: {
      settings: {
        name: 'דנה',
        defaultPriceAgorot: 12500,
        defaultCourtCostAgorot: 7500,
        reminderHoursBefore: 24,
        cancellationPolicy: '',
        templates: { reminder: 'תזכורת', debt: 'חוב' },
        bookingSlug: null,
        bookingEnabled: false,
        bookingStartHour: 8,
        bookingEndHour: 21,
      },
    },
    config: { terms: { session: 'אימון' } },
    vertical: 'padel',
    actions: { saveSettings: mocks.saveSettings },
  }),
}))

vi.mock('@/components/app-header', () => ({
  AppHeader: ({ title }: { title: string }) => <header>{title}</header>,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.saveSettings.mockResolvedValue(undefined)
  mocks.logout.mockResolvedValue(undefined)
})

afterEach(cleanup)

describe('SettingsPage public booking controls', () => {
  it('updates the default session price in whole agorot', async () => {
    render(<SettingsPage />)
    const price = screen.getByRole('spinbutton', {
      name: 'מחיר ברירת מחדל בשקלים',
    })

    fireEvent.change(price, { target: { value: '180' } })
    fireEvent.blur(price)

    await waitFor(() =>
      expect(mocks.saveSettings).toHaveBeenCalledWith({
        defaultPriceAgorot: 18000,
      }),
    )
  })

  it('updates the default court cost for padel coaches', async () => {
    render(<SettingsPage />)
    const cost = screen.getByRole('spinbutton', {
      name: 'עלות מגרש ברירת מחדל בשקלים',
    })

    fireEvent.change(cost, { target: { value: '90' } })
    fireEvent.blur(cost)

    await waitFor(() =>
      expect(mocks.saveSettings).toHaveBeenCalledWith({
        defaultCourtCostAgorot: 9000,
      }),
    )
  })

  it('creates the booking link automatically with one switch', async () => {
    render(<SettingsPage />)

    expect(
      screen.queryByRole('textbox', { name: 'כתובת הקישור שלך' }),
    ).toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: 'הפעל קביעת תורים' }))

    await waitFor(() =>
      expect(mocks.saveSettings).toHaveBeenCalledWith({
        bookingEnabled: true,
      }),
    )
    expect(mocks.saveSettings).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a clear error when activation fails', async () => {
    mocks.saveSettings.mockRejectedValueOnce(new Error('offline'))
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'הפעל קביעת תורים' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'השמירה נכשלה',
      ),
    )
  })

  it('logs out and returns to the login page', async () => {
    render(<SettingsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'התנתקות' }))

    await waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(1))
    expect(mocks.navigate).toHaveBeenCalledWith('/login', { replace: true })
  })
})

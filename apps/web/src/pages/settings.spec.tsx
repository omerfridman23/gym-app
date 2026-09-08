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
  it('saves a freshly typed slug and enable flag in one request', async () => {
    render(<SettingsPage />)

    const slug = screen.getByRole('textbox', { name: 'כתובת הקישור שלך' })
    const toggle = screen.getByRole('switch', { name: 'קביעת תורים פתוחה' })
    fireEvent.change(slug, { target: { value: 'Dana-Coach' } })

    // Browser order when the focused input is followed by a toggle click.
    fireEvent.pointerDown(toggle)
    fireEvent.blur(slug)
    fireEvent.click(toggle)

    await waitFor(() =>
      expect(mocks.saveSettings).toHaveBeenCalledWith({
        bookingEnabled: true,
        bookingSlug: 'dana-coach',
      }),
    )
    expect(mocks.saveSettings).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('does not enable booking with an empty slug', () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'קביעת תורים פתוחה' }))

    expect(screen.getByRole('alert').textContent).toContain(
      'קודם בוחרים כתובת לקישור',
    )
    expect(mocks.saveSettings).not.toHaveBeenCalled()
  })

  it('logs out and returns to the login page', async () => {
    render(<SettingsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'התנתקות' }))

    await waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(1))
    expect(mocks.navigate).toHaveBeenCalledWith('/login', { replace: true })
  })
})

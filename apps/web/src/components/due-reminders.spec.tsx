// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DueReminders } from './due-reminders'

const mocks = vi.hoisted(() => ({
  listDueReminders: vi.fn(),
  markReminderSent: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  dataApi: {
    listDueReminders: mocks.listDueReminders,
    markReminderSent: mocks.markReminderSent,
  },
}))

function reminder(overrides = {}) {
  return {
    sessionId: 'session-1',
    clientId: 'client-1',
    clientName: 'יוסי כהן',
    clientPhone: '+972501234567',
    startsAt: '2026-09-07T15:00:00.000Z',
    timeLocal: '18:00',
    durationMin: 60,
    location: 'מגרש 1',
    message: 'תזכורת',
    confirmUrl: 'https://app.example.com/confirm/token',
    whatsappUrl: 'https://wa.me/972501234567?text=hello',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'open').mockImplementation(() => null)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('DueReminders', () => {
  it('renders nothing when no reminders are due', async () => {
    mocks.listDueReminders.mockResolvedValue([])
    const { container } = render(<DueReminders />)
    await waitFor(() => expect(mocks.listDueReminders).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })

  it('fails closed to an empty list when loading errors', async () => {
    mocks.listDueReminders.mockRejectedValue(new Error('offline'))
    const { container } = render(<DueReminders />)
    await waitFor(() => expect(mocks.listDueReminders).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })

  it('renders client, local time, location and due count', async () => {
    mocks.listDueReminders.mockResolvedValue([reminder()])
    render(<DueReminders />)

    expect(await screen.findByText('יוסי כהן')).toBeTruthy()
    expect(screen.getByText('18:00 · מגרש 1')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('omits the location separator when there is no location', async () => {
    mocks.listDueReminders.mockResolvedValue([reminder({ location: null })])
    render(<DueReminders />)
    expect(await screen.findByText('18:00')).toBeTruthy()
    expect(screen.queryByText(/·/)).toBeNull()
  })

  it('opens WhatsApp synchronously before awaiting the mark-sent request', async () => {
    let release!: () => void
    mocks.listDueReminders.mockResolvedValue([reminder()])
    mocks.markReminderSent.mockReturnValue(new Promise<void>((resolve) => { release = resolve }))
    const onSent = vi.fn()
    render(<DueReminders onSent={onSent} />)

    fireEvent.click(await screen.findByRole('button', { name: 'שליחה' }))

    expect(window.open).toHaveBeenCalledWith(
      'https://wa.me/972501234567?text=hello',
      '_blank',
      'noopener,noreferrer',
    )
    expect(mocks.markReminderSent).toHaveBeenCalledWith('session-1')
    expect((screen.getByRole('button', { name: 'שליחה' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('יוסי כהן')).toBeTruthy()

    release()
    await waitFor(() => expect(screen.queryByText('יוסי כהן')).toBeNull())
    expect(onSent).toHaveBeenCalledTimes(1)
  })

  it('disables only the reminder currently being sent', async () => {
    mocks.listDueReminders.mockResolvedValue([
      reminder({ sessionId: 's1', clientName: 'יוסי' }),
      reminder({ sessionId: 's2', clientName: 'נועה' }),
    ])
    mocks.markReminderSent.mockReturnValue(new Promise(() => undefined))
    render(<DueReminders />)

    const buttons = await screen.findAllByRole('button', { name: 'שליחה' })
    fireEvent.click(buttons[0])

    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true)
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(false)
  })
})

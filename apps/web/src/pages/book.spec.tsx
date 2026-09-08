// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BookPage from './book'

const mocks = vi.hoisted(() => ({
  getBookingInfo: vi.fn(),
  createBooking: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'dana' }),
}))

vi.mock('@/lib/api', () => {
  class ApiError extends Error {
    readonly status: number

    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  }

  return {
    ApiError,
    publicApi: {
      getBookingInfo: mocks.getBookingInfo,
      createBooking: mocks.createBooking,
    },
  }
})

function bookingInfo(overrides: Record<string, unknown> = {}) {
  return {
    coachName: 'דנה המאמנת',
    vertical: 'padel',
    durationMin: 60,
    priceAgorot: 12500,
    days: [
      { date: '2026-09-09', slots: [] },
      {
        date: '2026-09-10',
        slots: [
          { startsAt: '2026-09-10T07:00:00.000Z', timeLocal: '10:00' },
          { startsAt: '2026-09-10T08:00:00.000Z', timeLocal: '11:00' },
        ],
      },
    ],
    ...overrides,
  }
}

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BookPage public booking journey', () => {
  it('shows loading until availability resolves', () => {
    mocks.getBookingInfo.mockReturnValue(new Promise(() => undefined))
    render(<BookPage />)
    expect(screen.getByLabelText('טוען…')).toBeTruthy()
  })

  it('shows a safe not-found state when booking is disabled or missing', async () => {
    mocks.getBookingInfo.mockRejectedValue(new Error('404'))
    render(<BookPage />)
    expect(await screen.findByText('הקישור לא נמצא')).toBeTruthy()
    expect(screen.queryByText('דנה המאמנת')).toBeNull()
  })

  it('renders coach details and only enables days with free slots', async () => {
    mocks.getBookingInfo.mockResolvedValue(bookingInfo())
    render(<BookPage />)

    expect(await screen.findByText('דנה המאמנת')).toBeTruthy()
    expect(screen.getByText('אימון של 60 דקות · ₪125')).toBeTruthy()
    expect(screen.getByText('9').closest('button')).toHaveProperty('disabled', true)
    expect(screen.getByText('10').closest('button')).toHaveProperty('disabled', false)
    expect(screen.getByRole('button', { name: '10:00' })).toBeTruthy()
  })

  it('submits the selected slot, name and phone and shows success', async () => {
    mocks.getBookingInfo.mockResolvedValue(bookingInfo())
    mocks.createBooking.mockResolvedValue({
      coachName: 'דנה המאמנת',
      clientFirstName: 'יוסי',
      startsAt: '2026-09-10T07:00:00.000Z',
      date: '2026-09-10',
      timeLocal: '10:00',
      durationMin: 60,
    })
    render(<BookPage />)

    fireEvent.click(await screen.findByRole('button', { name: '10:00' }))
    fireEvent.change(screen.getByPlaceholderText('שם מלא'), {
      target: { value: 'יוסי כהן' },
    })
    fireEvent.change(screen.getByPlaceholderText('נייד (05X-XXXXXXX)'), {
      target: { value: '050-1234567' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'אשר קביעת אימון' }))

    await waitFor(() =>
      expect(mocks.createBooking).toHaveBeenCalledWith('dana', {
        startsAt: '2026-09-10T07:00:00.000Z',
        name: 'יוסי כהן',
        phone: '050-1234567',
      }),
    )
    expect(await screen.findByText('האימון נקבע!')).toBeTruthy()
    expect(screen.getByText('10:00')).toBeTruthy()
  })

  it('prevents duplicate submission while the first request is pending', async () => {
    mocks.getBookingInfo.mockResolvedValue(bookingInfo())
    mocks.createBooking.mockReturnValue(new Promise(() => undefined))
    render(<BookPage />)

    fireEvent.click(await screen.findByRole('button', { name: '10:00' }))
    fireEvent.change(screen.getByPlaceholderText('שם מלא'), {
      target: { value: 'יוסי' },
    })
    fireEvent.change(screen.getByPlaceholderText('נייד (05X-XXXXXXX)'), {
      target: { value: '0501234567' },
    })
    const submit = screen.getByRole('button', { name: 'אשר קביעת אימון' })
    fireEvent.click(submit)
    fireEvent.click(submit)

    expect(mocks.createBooking).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'קובע…' })).toHaveProperty('disabled', true)
  })

  it('shows an error and refreshes availability when a slot was just taken', async () => {
    mocks.getBookingInfo.mockResolvedValue(bookingInfo())
    mocks.createBooking.mockRejectedValue(new Error('conflict'))
    render(<BookPage />)

    fireEvent.click(await screen.findByRole('button', { name: '10:00' }))
    fireEvent.change(screen.getByPlaceholderText('שם מלא'), {
      target: { value: 'יוסי' },
    })
    fireEvent.change(screen.getByPlaceholderText('נייד (05X-XXXXXXX)'), {
      target: { value: '0501234567' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'אשר קביעת אימון' }))

    expect((await screen.findByRole('alert')).textContent).toContain('משהו השתבש, נסו שוב')
    await waitFor(() => expect(mocks.getBookingInfo).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('button', { name: 'אשר קביעת אימון' })).toBeNull()
  })

  it('shows a clear empty state when the next 14 days are full', async () => {
    mocks.getBookingInfo.mockResolvedValue(
      bookingInfo({
        days: [
          { date: '2026-09-09', slots: [] },
          { date: '2026-09-10', slots: [] },
        ],
      }),
    )
    render(<BookPage />)
    expect(
      await screen.findByText('אין שעות פנויות בשבועיים הקרובים. פנו למאמן ישירות.'),
    ).toBeTruthy()
  })
})

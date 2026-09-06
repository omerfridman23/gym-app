// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ConfirmPage from './confirm'

const mocks = vi.hoisted(() => ({
  getConfirmInfo: vi.fn(),
  answerConfirm: vi.fn(),
  downloadSessionIcs: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'stable-token' }),
}))

vi.mock('@/lib/api', () => ({
  publicApi: {
    getConfirmInfo: mocks.getConfirmInfo,
    answerConfirm: mocks.answerConfirm,
  },
}))

vi.mock('@/lib/ics', () => ({
  downloadSessionIcs: mocks.downloadSessionIcs,
}))

function info(status: 'pending' | 'confirmed' | 'cancelled' | 'done', overrides = {}) {
  return {
    clientFirstName: 'יוסי',
    coachName: 'דני המאמן',
    startsAt: '2026-12-01T16:00:00.000Z',
    durationMin: 60,
    location: 'מגרש 1',
    status,
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ConfirmPage state machine', () => {
  it('shows a loading state until the public API resolves', () => {
    mocks.getConfirmInfo.mockReturnValue(new Promise(() => undefined))
    render(<ConfirmPage />)
    expect(screen.getByLabelText('טוען…')).toBeTruthy()
  })

  it('shows confirm and decline actions for a pending session, without calendar', async () => {
    mocks.getConfirmInfo.mockResolvedValue(info('pending'))
    render(<ConfirmPage />)

    expect(await screen.findByText('שלום יוסי')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'מאשר/ת הגעה' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'לא אוכל להגיע' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'הוספה ליומן' })).toBeNull()
  })

  it.each(['confirmed', 'done'] as const)(
    'shows calendar for a %s session',
    async (status) => {
      mocks.getConfirmInfo.mockResolvedValue(info(status))
      render(<ConfirmPage />)

      expect(await screen.findByText('ההגעה אושרה')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'הוספה ליומן' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'מאשר/ת הגעה' })).toBeNull()
    },
  )

  it('never shows calendar for a cancelled session', async () => {
    mocks.getConfirmInfo.mockResolvedValue(info('cancelled'))
    render(<ConfirmPage />)

    expect(await screen.findByText('עדכנו את המאמן')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'הוספה ליומן' })).toBeNull()
  })

  it('omits the location row when location is null', async () => {
    mocks.getConfirmInfo.mockResolvedValue(info('pending', { location: null }))
    render(<ConfirmPage />)
    await screen.findByText('שלום יוסי')
    expect(screen.queryByText('מגרש 1')).toBeNull()
  })

  it('confirms and switches to the result/calendar state', async () => {
    mocks.getConfirmInfo.mockResolvedValue(info('pending'))
    mocks.answerConfirm.mockResolvedValue(info('confirmed'))
    render(<ConfirmPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'מאשר/ת הגעה' }))

    await waitFor(() =>
      expect(mocks.answerConfirm).toHaveBeenCalledWith('stable-token', 'confirm'),
    )
    expect(await screen.findByText('ההגעה אושרה')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'הוספה ליומן' })).toBeTruthy()
  })

  it('declines and never exposes the calendar action', async () => {
    mocks.getConfirmInfo.mockResolvedValue(info('pending'))
    mocks.answerConfirm.mockResolvedValue(info('cancelled'))
    render(<ConfirmPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'לא אוכל להגיע' }))

    await waitFor(() =>
      expect(mocks.answerConfirm).toHaveBeenCalledWith('stable-token', 'decline'),
    )
    expect(await screen.findByText('עדכנו את המאמן')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'הוספה ליומן' })).toBeNull()
  })

  it('lets the client reopen the answer buttons', async () => {
    mocks.getConfirmInfo.mockResolvedValue(info('confirmed'))
    render(<ConfirmPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'שינוי תשובה' }))

    expect(screen.getByRole('button', { name: 'מאשר/ת הגעה' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'לא אוכל להגיע' })).toBeTruthy()
    // Status is still confirmed until a new answer completes.
    expect(screen.getByRole('button', { name: 'הוספה ליומן' })).toBeTruthy()
  })

  it('builds the calendar event from real response fields and stable route token', async () => {
    mocks.getConfirmInfo.mockResolvedValue(
      info('confirmed', { durationMin: 90, location: 'מגרש 2' }),
    )
    render(<ConfirmPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'הוספה ליומן' }))

    expect(mocks.downloadSessionIcs).toHaveBeenCalledWith({
      id: 'stable-token',
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      time: expect.stringMatching(/^\d{2}:\d{2}$/),
      durationMin: 90,
      title: 'אימון עם דני המאמן',
      location: 'מגרש 2',
    })
  })

  it('shows not-found when loading fails', async () => {
    mocks.getConfirmInfo.mockRejectedValue(new Error('404'))
    render(<ConfirmPage />)
    expect(await screen.findByText('הקישור לא נמצא')).toBeTruthy()
  })

  it('shows not-found when saving an answer fails', async () => {
    mocks.getConfirmInfo.mockResolvedValue(info('pending'))
    mocks.answerConfirm.mockRejectedValue(new Error('network'))
    render(<ConfirmPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'מאשר/ת הגעה' }))

    expect(await screen.findByText('הקישור לא נמצא')).toBeTruthy()
  })
})

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './auth-context'

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  updateCoach: vi.fn(),
  logout: vi.fn(),
  setVertical: vi.fn(),
}))

vi.mock('./api', () => ({
  authApi: {
    me: mocks.me,
    updateCoach: mocks.updateCoach,
    logout: mocks.logout,
  },
}))

vi.mock('./vertical-context', () => ({
  useVertical: () => ({ setVertical: mocks.setVertical }),
}))

function Probe() {
  const { coach, completeOnboarding, logout } = useAuth()
  return (
    <div>
      <span data-testid="state">
        {coach === undefined ? 'loading' : coach === null ? 'none' : coach.name}
      </span>
      <button
        onClick={() =>
          void completeOnboarding({ name: 'דני', vertical: 'fitness' }).catch(() => undefined)
        }
      >
        onboard
      </button>
      <button onClick={() => void logout().catch(() => undefined)}>logout</button>
    </div>
  )
}

function coach(overrides = {}) {
  return {
    id: 'coach-1',
    phone: '+972501234567',
    name: 'דני',
    vertical: 'fitness' as const,
    onboarded: true,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('AuthProvider', () => {
  it('starts loading, then exposes the current session', async () => {
    let resolve!: (value: ReturnType<typeof coach>) => void
    mocks.me.mockReturnValue(new Promise((done) => { resolve = done }))
    render(<AuthProvider><Probe /></AuthProvider>)

    expect(screen.getByTestId('state').textContent).toBe('loading')
    await act(async () => resolve(coach()))
    expect(screen.getByTestId('state').textContent).toBe('דני')
  })

  it('represents an unauthenticated session as null', async () => {
    mocks.me.mockResolvedValue(null)
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('none'))
  })

  it('fails closed to logged-out state when the session probe errors', async () => {
    mocks.me.mockRejectedValue(new Error('network'))
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('none'))
  })

  it('syncs the persisted coach vertical into UI state', async () => {
    mocks.me.mockResolvedValue(coach({ vertical: 'padel' }))
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(mocks.setVertical).toHaveBeenCalledWith('padel'))
  })

  it('does not set a vertical for an incomplete coach', async () => {
    mocks.me.mockResolvedValue(coach({ vertical: null, onboarded: false }))
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('דני'))
    expect(mocks.setVertical).not.toHaveBeenCalled()
  })

  it('replaces local coach state after onboarding succeeds', async () => {
    mocks.me.mockResolvedValue(null)
    mocks.updateCoach.mockResolvedValue(coach({ name: 'דני החדש' }))
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('none'))

    fireEvent.click(screen.getByRole('button', { name: 'onboard' }))

    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('דני החדש'))
    expect(mocks.updateCoach).toHaveBeenCalledWith({ name: 'דני', vertical: 'fitness' })
  })

  it('does not change local state when onboarding fails', async () => {
    mocks.me.mockResolvedValue(null)
    mocks.updateCoach.mockRejectedValue(new Error('save failed'))
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('none'))

    fireEvent.click(screen.getByRole('button', { name: 'onboard' }))

    await waitFor(() => expect(mocks.updateCoach).toHaveBeenCalled())
    expect(screen.getByTestId('state').textContent).toBe('none')
  })

  it('clears local state only after logout succeeds', async () => {
    mocks.me.mockResolvedValue(coach())
    mocks.logout.mockResolvedValue(undefined)
    render(<AuthProvider><Probe /></AuthProvider>)
    await screen.findByText('דני')

    fireEvent.click(screen.getByRole('button', { name: 'logout' }))

    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('none'))
    expect(mocks.logout).toHaveBeenCalledTimes(1)
  })

  it('retains the session when logout fails', async () => {
    mocks.me.mockResolvedValue(coach())
    mocks.logout.mockRejectedValue(new Error('offline'))
    render(<AuthProvider><Probe /></AuthProvider>)
    await screen.findByText('דני')

    fireEvent.click(screen.getByRole('button', { name: 'logout' }))

    await waitFor(() => expect(mocks.logout).toHaveBeenCalled())
    expect(screen.getByTestId('state').textContent).toBe('דני')
  })
})

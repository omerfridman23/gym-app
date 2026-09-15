// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import LoginPage from './login'

const mocks = vi.hoisted(() => ({
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
  setCoach: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ setCoach: mocks.setCoach }),
}))

vi.mock('@/lib/api', async () => {
  class ApiError extends Error {
    readonly status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  }
  return {
    ApiError,
    authApi: {
      requestOtp: mocks.requestOtp,
      verifyOtp: mocks.verifyOtp,
    },
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requestOtp.mockResolvedValue(undefined)
})

afterEach(cleanup)

describe('LoginPage OTP spend cap', () => {
  it('shows the server monthly-cap message instead of a generic error', async () => {
    mocks.requestOtp.mockRejectedValue(
      new ApiError(429, 'הגעתם לתקרת שליחת הקודים החודשית, נסו שוב בחודש הבא'),
    )

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('מספר טלפון'), {
      target: { value: '0501234567' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'שלחו לי קוד' }))

    await waitFor(() => {
      expect(
        screen.getByText('הגעתם לתקרת שליחת הקודים החודשית, נסו שוב בחודש הבא'),
      ).toBeTruthy()
    })
    expect(screen.queryByText('שגיאה, נסו שוב')).toBeNull()
    expect(mocks.requestOtp).toHaveBeenCalledWith('0501234567')
  })
})

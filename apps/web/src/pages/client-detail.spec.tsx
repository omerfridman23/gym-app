// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ClientDetailPage from './client-detail'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  updateClient: vi.fn(),
  deleteClient: vi.fn(),
  sellPackage: vi.fn(),
  recordPayment: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'client-1' }),
  useRouter: () => ({ push: mocks.push, back: vi.fn() }),
}))

vi.mock('@/lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data')>()
  return {
    ...actual,
    useData: () => ({
      ds: {
        settings: {
          name: 'דנה',
          templates: { debt: 'חוב {סכום}' },
        },
        clients: [
          {
            id: 'client-1',
            name: 'רון אביב',
            phone: '0501234567',
            fields: { level: 'B' },
            priceAgorot: 12000,
          },
        ],
        sessions: [],
        packages: [],
        payments: [],
      },
      config: {
        terms: { client: 'מתאמן', sessions: 'אימונים' },
        clientFields: [{ key: 'level', label: 'רמה' }],
      },
      today: new Date('2026-09-09T00:00:00Z'),
      actions: {
        updateClient: mocks.updateClient,
        deleteClient: mocks.deleteClient,
        sellPackage: mocks.sellPackage,
        recordPayment: mocks.recordPayment,
      },
    }),
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateClient.mockResolvedValue(undefined)
  mocks.deleteClient.mockResolvedValue(undefined)
  mocks.sellPackage.mockResolvedValue(undefined)
})

afterEach(cleanup)

describe('ClientDetailPage management actions', () => {
  it('edits the client from the profile', async () => {
    render(<ClientDetailPage />)
    fireEvent.click(screen.getByRole('button', { name: 'עריכה' }))
    fireEvent.change(screen.getByLabelText('שם מלא'), {
      target: { value: 'רון אביבי' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }))

    await waitFor(() =>
      expect(mocks.updateClient).toHaveBeenCalledWith(
        'client-1',
        expect.objectContaining({ name: 'רון אביבי' }),
      ),
    )
  })

  it('sells a package and records the selected payment method', async () => {
    render(<ClientDetailPage />)
    fireEvent.click(screen.getByRole('button', { name: 'מכירת כרטיסייה' }))
    fireEvent.change(screen.getByLabelText('מספר אימונים'), {
      target: { value: '12' },
    })
    fireEvent.change(screen.getByLabelText('סכום ששולם (₪)'), {
      target: { value: '1440' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'מזומן' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'אשר מכירת כרטיסייה' }),
    )

    await waitFor(() =>
      expect(mocks.sellPackage).toHaveBeenCalledWith(
        'client-1',
        12,
        144000,
        'cash',
      ),
    )
  })

  it('requires a second explicit click before deleting the client', async () => {
    render(<ClientDetailPage />)
    fireEvent.click(screen.getByRole('button', { name: 'עריכה' }))
    fireEvent.click(screen.getByRole('button', { name: 'מחיקת מתאמן' }))
    expect(mocks.deleteClient).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'כן, למחוק' }))
    await waitFor(() =>
      expect(mocks.deleteClient).toHaveBeenCalledWith('client-1'),
    )
  })
})

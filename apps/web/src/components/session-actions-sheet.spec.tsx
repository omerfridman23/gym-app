// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionActionsSheet } from './session-actions-sheet'

vi.mock('@/lib/data', () => ({
  useData: () => ({
    ds: {
      settings: {
        name: 'דנה',
        templates: { reminder: 'שלום {שם}' },
      },
    },
    config: {
      sessionTypes: [{ id: 'private', label: 'אישי' }],
      terms: { location: 'מיקום' },
      cancelReasons: ['אישי'],
    },
  }),
}))

const session = {
  id: 'session-1',
  clientId: 'client-1',
  seriesId: 'series-1',
  typeId: 'private',
  date: '2026-01-01',
  time: '10:00',
  durationMin: 60,
  priceAgorot: 12000,
  status: 'pending' as const,
  paid: false,
  fromPackage: false,
  reminderSent: false,
  reminderAnswered: false,
}

const client = {
  id: 'client-1',
  name: 'רון אביב',
  phone: '0501234567',
  fields: {},
  priceAgorot: 12000,
}

afterEach(cleanup)

function renderSheet(overrides: Record<string, unknown> = {}) {
  const props = {
    session,
    client,
    open: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    onMarkPaid: vi.fn(),
    onCancel: vi.fn(),
    onAttendance: vi.fn(),
    onEdit: vi.fn(async () => undefined),
    onDelete: vi.fn(async () => undefined),
    ...overrides,
  }
  render(
    <MemoryRouter>
      <SessionActionsSheet {...props} />
    </MemoryRouter>,
  )
  return props
}

describe('SessionActionsSheet', () => {
  it('marks attendance for an ended session', () => {
    const props = renderSheet({
      session: { ...session, status: 'done' as const },
    })
    fireEvent.click(screen.getByRole('button', { name: 'הגיע' }))
    expect(props.onAttendance).toHaveBeenCalledWith('session-1', 'arrived')
  })

  it('asks whether a recurring edit applies to one or future sessions', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'ערוך אימון' }))
    expect(
      screen.getByRole('button', { name: 'רק האימון הזה' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'זה וכל הבאים' }),
    ).toBeTruthy()
  })

  it('passes future scope when deleting a recurring session', () => {
    const props = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'מחק מהיומן' }))
    fireEvent.click(screen.getByRole('button', { name: 'זה וכל הבאים' }))
    fireEvent.click(screen.getByRole('button', { name: 'מחק אימון' }))
    expect(props.onDelete).toHaveBeenCalledWith('session-1', 'future')
  })
})

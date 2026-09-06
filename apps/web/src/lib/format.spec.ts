import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMinutesToTime,
  daysAgoLabel,
  formatHebrewDate,
  formatHebrewDateShort,
  formatShekel,
  fromISODate,
  startOfWeek,
  toISODate,
  weekdayLetter,
} from './format'

describe('toISODate / fromISODate', () => {
  it('round-trips a local calendar date', () => {
    const d = new Date(2026, 8, 7, 18, 0)
    expect(toISODate(d)).toBe('2026-09-07')
    expect(fromISODate('2026-09-07')).toEqual(new Date(2026, 8, 7))
  })

  it('does not shift a late-evening local time onto the next UTC day', () => {
    expect(toISODate(new Date(2026, 0, 4, 23, 30))).toBe('2026-01-04')
  })

  it('pads single-digit months and days', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('addMinutesToTime', () => {
  it.each([
    ['18:00', 60, '19:00'],
    ['18:00', 90, '19:30'],
    ['23:30', 60, '00:30'],
    ['23:59', 1, '00:00'],
    ['00:00', 0, '00:00'],
    ['09:05', 10, '09:15'],
  ])('adds %i minutes to %s giving %s', (time, minutes, expected) => {
    expect(addMinutesToTime(time, minutes)).toBe(expected)
  })
})

describe('formatShekel', () => {
  it.each([
    [0, '₪0'],
    [50, '₪1'],
    [49, '₪0'],
    [18_000, '₪180'],
    [1_800_000, '₪18,000'],
    [-18_000, '₪-180'],
  ])('renders %i agorot as %s', (agorot, expected) => {
    expect(formatShekel(agorot)).toBe(expected)
  })
})

describe('Hebrew dates', () => {
  it('formats Sunday 6 September 2026', () => {
    expect(formatHebrewDate('2026-09-06')).toBe('יום א׳, 6 בספטמבר')
    expect(formatHebrewDateShort('2026-09-06')).toBe('6 בספטמבר')
    expect(weekdayLetter('2026-09-06')).toBe('א׳')
  })

  it('formats Saturday as ש׳', () => {
    expect(weekdayLetter('2026-09-12')).toBe('ש׳')
  })
})

describe('week helpers', () => {
  it('starts the week on Sunday', () => {
    expect(toISODate(startOfWeek(fromISODate('2026-09-10')))).toBe('2026-09-06')
  })

  it('adds days without mutating the original', () => {
    const d = fromISODate('2026-09-06')
    const next = addDays(d, 7)
    expect(toISODate(next)).toBe('2026-09-13')
    expect(toISODate(d)).toBe('2026-09-06')
  })
})

describe('daysAgoLabel', () => {
  const today = fromISODate('2026-09-06')

  it.each([
    ['2026-09-06', 'היום'],
    ['2026-09-05', 'אתמול'],
    ['2026-09-03', 'לפני 3 ימים'],
    ['2026-09-07', 'היום'],
  ])('labels %s as %s', (iso, expected) => {
    expect(daysAgoLabel(iso, today)).toBe(expected)
  })
})

import { describe, expect, it } from 'vitest'
import { fillTemplate } from './templates'
import { initials, normalizePhone, telLink, waLink } from './whatsapp'

describe('fillTemplate', () => {
  it('replaces every known Hebrew placeholder', () => {
    expect(
      fillTemplate('היי {שם}, אימון ב-{שעה}, {מיקום}. {קישור}', {
        שם: 'יוסי',
        שעה: '18:00',
        מיקום: 'מגרש 1',
        קישור: 'https://example.com/c/1',
      }),
    ).toBe('היי יוסי, אימון ב-18:00, מגרש 1. https://example.com/c/1')
  })

  it('replaces repeated placeholders', () => {
    expect(fillTemplate('{שם} {שם}', { שם: 'יוסי' })).toBe('יוסי יוסי')
  })

  it('preserves unknown placeholders for later processing', () => {
    expect(fillTemplate('{שם} {לא_ידוע}', { שם: 'יוסי' })).toBe('יוסי {לא_ידוע}')
  })

  it('supports empty replacement values', () => {
    expect(fillTemplate('מיקום: {מיקום}', { מיקום: '' })).toBe('מיקום: ')
  })

  it('does not interpret replacement dollar signs', () => {
    expect(fillTemplate('{סכום}', { סכום: '$&100' })).toBe('$&100')
  })
})

describe('WhatsApp phone normalization', () => {
  it.each([
    ['050-123-4567', '972501234567'],
    ['050 123 4567', '972501234567'],
    ['(050) 123-4567', '972501234567'],
    ['+972 50-123-4567', '972501234567'],
    ['972501234567', '972501234567'],
    ['501234567', '501234567'],
    ['', ''],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected)
  })

  it('builds a WhatsApp URL without a text query when no message is supplied', () => {
    expect(waLink('0501234567')).toBe('https://wa.me/972501234567')
  })

  it('percent-encodes Hebrew text, spaces, ampersands and URL characters', () => {
    const text = 'שלום יוסי & אשר כאן: https://example.com/a?x=1'
    expect(waLink('0501234567', text)).toBe(
      `https://wa.me/972501234567?text=${encodeURIComponent(text)}`,
    )
  })

  it('does not add an empty text query', () => {
    expect(waLink('0501234567', '')).toBe('https://wa.me/972501234567')
  })
})

describe('telLink', () => {
  it.each([
    ['050-123-4567', 'tel:0501234567'],
    ['+972 50-123-4567', 'tel:+972501234567'],
    ['(050) 123 4567', 'tel:0501234567'],
  ])('converts %j to %j', (input, expected) => {
    expect(telLink(input)).toBe(expected)
  })
})

describe('initials', () => {
  it.each([
    ['יוסי כהן', 'יכ'],
    ['  יוסי   כהן  ', 'יכ'],
    ['יוסי', 'י'],
    ['יוסי בן כהן', 'יב'],
    ['', ''],
    ['   ', ''],
  ])('returns initials for %j', (name, expected) => {
    expect(initials(name)).toBe(expected)
  })
})

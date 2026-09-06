import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSessionIcs, downloadSessionIcs } from './ics'

const TOKEN = '3f2b1c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d'

function confirmPageEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: TOKEN,
    date: '2026-09-07',
    time: '18:00',
    durationMin: 60,
    title: 'אימון עם דני המאמן',
    location: 'מגרש 1',
    ...overrides,
  }
}

describe('buildSessionIcs', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits a VCALENDAR/VEVENT with CRLF endings', () => {
    const ics = buildSessionIcs(confirmPageEvent())
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.includes('\r\nBEGIN:VEVENT\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.includes('\n') && !ics.includes('\r\n') ? 'bare LF' : 'crlf').toBe('crlf')
  })

  it('uses the route token as a stable UID so re-adding updates', () => {
    const ics = buildSessionIcs(confirmPageEvent())
    expect(ics).toContain(`UID:session-${TOKEN}@hameamen.app`)
  })

  it('writes floating local times, not UTC or a TZID', () => {
    const ics = buildSessionIcs(confirmPageEvent())
    expect(ics).toContain('DTSTART:20260907T180000')
    expect(ics).toContain('DTEND:20260907T190000')
    expect(ics).not.toContain('TZID')
    expect(ics).not.toMatch(/DT(?:START|END):[^\r\n]*Z/)
  })

  it('stamps DTSTAMP from "now" in UTC compact form', () => {
    const ics = buildSessionIcs(confirmPageEvent())
    expect(ics).toContain('DTSTAMP:20260906T120000Z')
  })

  it('escapes RFC 5545 specials in the title, location and description', () => {
    const ics = buildSessionIcs(
      confirmPageEvent({
        title: 'אימון; עם, דני\\מאמן',
        location: 'מגרש 1, אולם A',
        description: 'שורה 1\nשורה 2',
      }),
    )
    expect(ics).toContain('SUMMARY:אימון\\; עם\\, דני\\\\מאמן')
    expect(ics).toContain('LOCATION:מגרש 1\\, אולם A')
    expect(ics).toContain('DESCRIPTION:שורה 1\\nשורה 2')
  })

  it('omits LOCATION when the confirm page has no location', () => {
    const ics = buildSessionIcs(confirmPageEvent({ location: undefined }))
    expect(ics).not.toContain('LOCATION:')
  })

  it('omits DESCRIPTION when none is given', () => {
    const ics = buildSessionIcs(confirmPageEvent())
    expect(ics).not.toContain('DESCRIPTION:')
  })

  it('rolls DTEND past midnight', () => {
    const ics = buildSessionIcs(confirmPageEvent({ time: '23:30', durationMin: 60 }))
    expect(ics).toContain('DTSTART:20260907T233000')
    expect(ics).toContain('DTEND:20260908T003000')
  })

  it('handles a 90 minute padel slot', () => {
    const ics = buildSessionIcs(confirmPageEvent({ durationMin: 90 }))
    expect(ics).toContain('DTEND:20260907T193000')
  })

  it('matches the confirm-page title shape', () => {
    const ics = buildSessionIcs(confirmPageEvent({ title: `אימון עם ${'דני המאמן'}` }))
    expect(ics).toContain('SUMMARY:אימון עם דני המאמן')
  })
})

describe('downloadSessionIcs', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('downloads a .ics named after the session date', () => {
    const click = vi.fn()
    const remove = vi.fn()
    const append = vi.fn()
    const revoke = vi.fn()
    const createObjectURL = vi.fn().mockReturnValue('blob:ics')
    const created: { href?: string; download?: string; click: () => void; remove: () => void } = {
      click,
      remove,
    }

    vi.stubGlobal(
      'Blob',
      class {
        type: string
        constructor(_parts: unknown[], opts: { type: string }) {
          this.type = opts.type
        }
      },
    )
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: revoke })
    vi.stubGlobal('document', {
      createElement: () => created,
      body: { appendChild: append },
    })

    downloadSessionIcs(confirmPageEvent())

    expect(created.href).toBe('blob:ics')
    expect(created.download).toBe('session-2026-09-07.ics')
    expect(append).toHaveBeenCalled()
    expect(click).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('creates a text/calendar UTF-8 blob and revokes its URL after 10 seconds', () => {
    vi.useFakeTimers()
    const revoke = vi.fn()
    const createObjectURL = vi.fn().mockReturnValue('blob:calendar')
    const blobs: { parts: unknown[]; type: string }[] = []
    const created = { click: vi.fn(), remove: vi.fn(), href: '', download: '' }

    vi.stubGlobal(
      'Blob',
      class {
        constructor(parts: unknown[], opts: { type: string }) {
          blobs.push({ parts, type: opts.type })
        }
      },
    )
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: revoke })
    vi.stubGlobal('document', {
      createElement: () => created,
      body: { appendChild: vi.fn() },
    })

    downloadSessionIcs(confirmPageEvent())

    expect(blobs).toHaveLength(1)
    expect(blobs[0].type).toBe('text/calendar;charset=utf-8')
    expect(String(blobs[0].parts[0])).toContain('BEGIN:VCALENDAR')
    expect(revoke).not.toHaveBeenCalled()

    vi.advanceTimersByTime(9_999)
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(revoke).toHaveBeenCalledWith('blob:calendar')
    vi.useRealTimers()
  })
})

// Generates an iCalendar (.ics) file for a single session and hands it to the
// device. On iPhone, Safari opens the file in the native Calendar add sheet;
// on Android/desktop it imports into the default calendar app.
//
// Times are written as "floating" local times (no TZID): the session's
// date/time fields are Asia/Jerusalem wall-clock values (see SPEC), and both
// coach and client operate in that timezone, so the event lands at the right
// hour without needing a VTIMEZONE block.

export interface SessionCalendarEvent {
  /** Stable id used for the UID so re-adding updates instead of duplicating */
  id: string
  /** yyyy-mm-dd */
  date: string
  /** HH:MM */
  time: string
  durationMin: number
  title: string
  location?: string
  description?: string
}

/** Escape text per RFC 5545 (backslash, semicolon, comma, newline). */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** "2026-09-07" + "09:00" -> "20260907T090000" (floating local time) */
function toIcsDateTime(date: string, time: string): string {
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`
}

function addMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  const end = new Date(y, m - 1, d, h, min + minutes)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
    time: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
  }
}

export function buildSessionIcs(event: SessionCalendarEvent): string {
  const end = addMinutes(event.date, event.time, event.durationMin)
  const dtstamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HaMeamen//Session//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:session-${event.id}@hameamen.app`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${toIcsDateTime(event.date, event.time)}`,
    `DTEND:${toIcsDateTime(end.date, end.time)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${escapeIcsText(event.description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  // RFC 5545 requires CRLF line endings.
  return lines.join('\r\n') + '\r\n'
}

/** Trigger a download of the .ics file; iOS offers "Add to Calendar". */
export function downloadSessionIcs(event: SessionCalendarEvent): void {
  const blob = new Blob([buildSessionIcs(event)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `session-${event.date}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

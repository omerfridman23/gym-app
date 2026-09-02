// Hebrew weekday letters, Sunday-first (getDay: 0=Sun .. 6=Sat)
export const WEEKDAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] as const

export const MONTHS_HE = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
] as const

/** yyyy-mm-dd in local time */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse a yyyy-mm-dd string into a local Date (no timezone drift) */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

/** Sunday as the first day of the week (Israeli week) */
export function startOfWeek(d: Date): Date {
  return addDays(d, -d.getDay())
}

export function weekdayLetter(iso: string): string {
  return WEEKDAY_LETTERS[fromISODate(iso).getDay()]
}

/** "יום ג׳, 2 בספטמבר" */
export function formatHebrewDate(iso: string): string {
  const d = fromISODate(iso)
  return `יום ${WEEKDAY_LETTERS[d.getDay()]}, ${d.getDate()} ב${MONTHS_HE[d.getMonth()]}`
}

/** "2 בספטמבר" (no weekday) */
export function formatHebrewDateShort(iso: string): string {
  const d = fromISODate(iso)
  return `${d.getDate()} ב${MONTHS_HE[d.getMonth()]}`
}

/** Money is stored as integer agorot. Display "₪180", shekel-first, no decimals. */
export function formatShekel(agorot: number): string {
  const shekels = Math.round(agorot / 100)
  return `₪${shekels.toLocaleString('en-US')}`
}

/** Add minutes to a "HH:MM" clock string, returns "HH:MM" */
export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/** relative "לפני N ימים" */
export function daysAgoLabel(iso: string, today: Date): string {
  const then = fromISODate(iso)
  const diff = Math.round((today.getTime() - then.getTime()) / (1000 * 60 * 60 * 24))
  if (diff <= 0) return 'היום'
  if (diff === 1) return 'אתמול'
  return `לפני ${diff} ימים`
}

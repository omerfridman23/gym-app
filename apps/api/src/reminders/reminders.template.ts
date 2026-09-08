/**
 * Pure helpers shared by the manual reminder list (`RemindersService`) and the
 * automatic worker (`RemindersWorker`), so a reminder reads exactly the same
 * whether the coach taps it out over WhatsApp or the server sends it as SMS.
 */

/** Kept in sync with DEFAULT_TEMPLATES in apps/web/src/lib/data.tsx. */
export const DEFAULT_REMINDER_TEMPLATE =
  'היי {שם}, כאן {מאמן}. מזכיר לך את האימון מחר ב-{שעה} ב{מיקום}. מאשר/ת? {קישור}';

/** Shared placeholders for a coach-authored WhatsApp reminder. */
export function reminderVars(input: {
  clientName: string;
  coachName: string;
  time: string;
  location: string | null | undefined;
  confirmUrl: string;
}): Record<string, string> {
  return {
    שם: input.clientName.split(' ')[0],
    מאמן: input.coachName.trim() || 'המאמן',
    שעה: input.time,
    מיקום: input.location ?? '',
    קישור: input.confirmUrl,
  };
}

/**
 * Public origin for client-facing links. `WEB_ORIGIN` may hold a comma-
 * separated CORS list, so only the first entry is used; `PUBLIC_WEB_URL`
 * overrides it when the app is served from a different host than the API's
 * allowed origins.
 */
export function resolveWebOrigin(
  ...candidates: (string | undefined)[]
): string {
  const configured = candidates.find((value) => value?.trim());
  const origin = configured?.split(',')[0].trim() ?? 'http://localhost:5173';
  return origin.replace(/\/+$/, '');
}

/** Fill a Hebrew template like "היי {שם}..."; unknown keys are left as-is. */
export function fillTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(
    /\{([^}]+)\}/g,
    (_, key: string) => vars[key] ?? `{${key}}`,
  );
}

/** "HH:MM" of a UTC instant as seen in Israel. */
export function israelTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

/** Hour of day (0–23) of a UTC instant as seen in Israel. */
export function israelHour(date: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(date),
  );
}

/** 05X-XXXXXXX -> 9725XXXXXXX, for wa.me links. */
export function toWhatsappNumber(phone: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
}

/**
 * Israeli mobile number in E.164 (+9725XXXXXXXX) for the SMS gateways, or
 * `null` when it isn't a number we can dial. Client phones are free text, so
 * the worker must not hand junk to a paid gateway.
 */
export function toE164Israel(phone: string): string | null {
  let digits = (phone ?? '').replace(/\D/g, '');

  if (digits.startsWith('00972')) digits = digits.slice(5);
  else if (digits.startsWith('972')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  else return null; // no country code and no leading 0 — not a number we know

  // Israeli mobile: 5X followed by 7 digits (e.g. 50-123-4567).
  if (!/^5\d{8}$/.test(digits)) return null;
  return `+972${digits}`;
}

/**
 * Whether `date` falls inside the coach's no-SMS window (Israel local hours).
 * The window wraps midnight when start > end, and an empty window
 * (start === end) means "never quiet".
 */
export function inQuietHours(
  date: Date,
  startHour: number,
  endHour: number,
): boolean {
  if (startHour === endHour) return false;
  const hour = israelHour(date);
  return startHour < endHour
    ? hour >= startHour && hour < endHour
    : hour >= startHour || hour < endHour;
}

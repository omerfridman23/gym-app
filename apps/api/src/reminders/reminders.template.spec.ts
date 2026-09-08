import { describe, expect, it } from 'vitest';
import {
  inQuietHours,
  israelHour,
  resolveWebOrigin,
  toE164Israel,
} from './reminders.template.js';

describe('israelHour', () => {
  it('reads the hour in Israel, not UTC', () => {
    expect(israelHour(new Date('2026-09-06T06:00:00Z'))).toBe(9); // DST, UTC+3
    expect(israelHour(new Date('2026-01-06T06:00:00Z'))).toBe(8); // winter, UTC+2
  });

  it('reports midnight as 0, never 24', () => {
    expect(israelHour(new Date('2026-09-06T21:00:00Z'))).toBe(0);
  });
});

describe('inQuietHours', () => {
  it('covers a window that wraps midnight', () => {
    const at = (hour: number) => new Date(Date.UTC(2026, 8, 6, hour - 3)); // Israel DST
    expect(inQuietHours(at(21), 22, 8)).toBe(false);
    expect(inQuietHours(at(22), 22, 8)).toBe(true);
    expect(inQuietHours(at(3), 22, 8)).toBe(true);
    expect(inQuietHours(at(8), 22, 8)).toBe(false);
  });

  it('covers a same-day window', () => {
    const at = (hour: number) => new Date(Date.UTC(2026, 8, 6, hour - 3));
    expect(inQuietHours(at(7), 8, 20)).toBe(false);
    expect(inQuietHours(at(12), 8, 20)).toBe(true);
    expect(inQuietHours(at(20), 8, 20)).toBe(false);
  });

  it('is never quiet when the window is empty', () => {
    expect(inQuietHours(new Date('2026-09-06T00:00:00Z'), 9, 9)).toBe(false);
  });
});

describe('toE164Israel', () => {
  it('accepts the formats coaches actually type', () => {
    expect(toE164Israel('0545551201')).toBe('+972545551201');
    expect(toE164Israel('054-555-1201')).toBe('+972545551201');
    expect(toE164Israel('054 555 1201')).toBe('+972545551201');
    expect(toE164Israel('+972545551201')).toBe('+972545551201');
    expect(toE164Israel('972545551201')).toBe('+972545551201');
    expect(toE164Israel('00972545551201')).toBe('+972545551201');
  });

  it('rejects anything it cannot dial rather than guessing', () => {
    expect(toE164Israel('')).toBeNull();
    expect(toE164Israel('לא-טלפון')).toBeNull();
    expect(toE164Israel('054555120')).toBeNull(); // too short
    expect(toE164Israel('05455512012')).toBeNull(); // too long
    expect(toE164Israel('031234567')).toBeNull(); // landline, not mobile
    expect(toE164Israel('5551201')).toBeNull(); // no prefix at all
  });
});

describe('resolveWebOrigin', () => {
  it('prefers the first configured value and trims trailing slashes', () => {
    expect(resolveWebOrigin('https://app.example.com/')).toBe(
      'https://app.example.com',
    );
    expect(resolveWebOrigin(undefined, 'https://second.example.com')).toBe(
      'https://second.example.com',
    );
  });

  it('takes the first entry of a comma-separated CORS list', () => {
    expect(
      resolveWebOrigin('https://a.example.com, https://b.example.com'),
    ).toBe('https://a.example.com');
  });

  it('falls back to the dev web server when nothing is configured', () => {
    expect(resolveWebOrigin(undefined, '   ')).toBe('http://localhost:5173');
  });
});

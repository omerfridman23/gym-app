import { describe, expect, it } from 'vitest';
import {
  findMissingEnv,
  formatMissingEnv,
  validateEnv,
} from './required-env.js';

const COMPLETE = {
  DATABASE_URL: 'postgresql://app_user:pw@host/db',
  DATABASE_URL_UNPOOLED: 'postgresql://owner:pw@host/db',
  JWT_SECRET: 'a-long-random-string',
  WEB_ORIGIN: 'https://app.example.com',
  NODE_ENV: 'production',
};

describe('required env', () => {
  it('passes a fully configured production environment through untouched', () => {
    expect(validateEnv({ ...COMPLETE })).toMatchObject(COMPLETE);
  });

  it('names every missing variable at once, not just the first', () => {
    const missing = findMissingEnv({
      DATABASE_URL: COMPLETE.DATABASE_URL,
      NODE_ENV: 'production',
    });

    expect(missing.map((v) => v.key)).toEqual([
      'DATABASE_URL_UNPOOLED',
      'JWT_SECRET',
      'WEB_ORIGIN',
    ]);
  });

  it('treats blank and whitespace-only values as missing', () => {
    // Railway happily stores an empty string; the app must not accept one.
    const missing = findMissingEnv({ ...COMPLETE, JWT_SECRET: '   ' });

    expect(missing.map((v) => v.key)).toEqual(['JWT_SECRET']);
  });

  it('does not demand WEB_ORIGIN outside production', () => {
    const { WEB_ORIGIN: _omitted, ...withoutOrigin } = COMPLETE;

    expect(
      findMissingEnv({ ...withoutOrigin, NODE_ENV: 'development' }),
    ).toEqual([]);
  });

  it('still demands the database and signing key outside production', () => {
    const missing = findMissingEnv({ NODE_ENV: 'development' });

    expect(missing.map((v) => v.key)).toEqual([
      'DATABASE_URL',
      'DATABASE_URL_UNPOOLED',
      'JWT_SECRET',
    ]);
  });

  it('explains what each missing variable is for', () => {
    const message = formatMissingEnv(
      findMissingEnv({ NODE_ENV: 'production' }),
    );

    expect(message).toContain('JWT_SECRET: signing key for the session cookie');
    expect(message).toContain('DATABASE_URL_UNPOOLED');
    expect(message).toContain('.env.example');
  });

  it('throws that message so the boot log says what to fix', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
  });

  it('leaks no secret values into the error message', () => {
    const message = formatMissingEnv(
      findMissingEnv({ ...COMPLETE, JWT_SECRET: '' }),
    );

    expect(message).not.toContain(COMPLETE.DATABASE_URL);
  });
});

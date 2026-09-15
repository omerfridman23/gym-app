import { describe, expect, it } from 'vitest';
import { resolveCorsOrigin } from './cors.js';

/** Mirrors how the `cors` package matches an incoming Origin against the allowlist. */
function allows(origin: (string | RegExp)[], candidate: string): boolean {
  return origin.some((entry) =>
    entry instanceof RegExp ? entry.test(candidate) : entry === candidate,
  );
}

describe('resolveCorsOrigin', () => {
  it.each(['development', 'test', undefined])(
    'allows localhost on any port outside production (%s)',
    (nodeEnv) => {
      const origin = resolveCorsOrigin(nodeEnv, 'https://ignored.example.com');
      expect(allows(origin, 'http://localhost:5175')).toBe(true);
      expect(allows(origin, 'http://localhost:3000')).toBe(true);
      expect(allows(origin, 'https://ignored.example.com')).toBe(false);
    },
  );

  it.each([
    'https://localhost:5175',
    'http://127.0.0.1:5175',
    'http://evil-localhost:5175',
    'http://localhost.evil.example:5175',
    'https://app.example.com',
  ])('rejects non-localhost development origin %s', (candidate) => {
    expect(allows(resolveCorsOrigin('development'), candidate)).toBe(false);
  });

  it('returns the exact production allowlist with whitespace removed', () => {
    expect(
      resolveCorsOrigin(
        'production',
        ' https://app.example.com,https://admin.example.com ,  ',
      ),
    ).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
      'capacitor://localhost',
      'ionic://localhost',
    ]);
  });

  it('does not allow any web origin when WEB_ORIGIN is absent', () => {
    const origin = resolveCorsOrigin('production', undefined);
    expect(allows(origin, 'https://app.example.com')).toBe(false);
  });

  it('does not interpret production origins as regular expressions', () => {
    const origin = resolveCorsOrigin('production', 'https://*.example.com');
    expect(allows(origin, 'https://app.example.com')).toBe(false);
    expect(allows(origin, 'https://*.example.com')).toBe(true);
  });

  it.each(['capacitor://localhost', 'ionic://localhost'])(
    'allows the native iOS WebView origin %s in production',
    (candidate) => {
      const origin = resolveCorsOrigin('production', 'https://app.example.com');
      expect(allows(origin, candidate)).toBe(true);
    },
  );

  it('does not allow a spoofed native origin', () => {
    const origin = resolveCorsOrigin('production', 'https://app.example.com');
    expect(allows(origin, 'capacitor://evil.example.com')).toBe(false);
  });
});

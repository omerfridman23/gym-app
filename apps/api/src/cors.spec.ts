import { describe, expect, it } from 'vitest';
import { resolveCorsOrigin } from './cors.js';

describe('resolveCorsOrigin', () => {
  it.each(['development', 'test', undefined])(
    'allows localhost on any port outside production (%s)',
    (nodeEnv) => {
      const origin = resolveCorsOrigin(nodeEnv, 'https://ignored.example.com');
      expect(origin).toBeInstanceOf(RegExp);
      expect((origin as RegExp).test('http://localhost:5175')).toBe(true);
      expect((origin as RegExp).test('http://localhost:3000')).toBe(true);
    },
  );

  it.each([
    'https://localhost:5175',
    'http://127.0.0.1:5175',
    'http://evil-localhost:5175',
    'http://localhost.evil.example:5175',
    'https://app.example.com',
  ])('rejects non-localhost development origin %s', (candidate) => {
    const origin = resolveCorsOrigin('development');
    expect((origin as RegExp).test(candidate)).toBe(false);
  });

  it('returns the exact production allowlist with whitespace removed', () => {
    expect(
      resolveCorsOrigin(
        'production',
        ' https://app.example.com,https://admin.example.com ,  ',
      ),
    ).toEqual(['https://app.example.com', 'https://admin.example.com']);
  });

  it('does not allow any production origin when WEB_ORIGIN is absent', () => {
    expect(resolveCorsOrigin('production', undefined)).toEqual([]);
  });

  it('does not interpret production origins as regular expressions', () => {
    expect(resolveCorsOrigin('production', 'https://*.example.com')).toEqual([
      'https://*.example.com',
    ]);
  });
});

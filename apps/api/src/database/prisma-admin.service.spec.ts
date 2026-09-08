import { describe, expect, it } from 'vitest';
import { adminPoolMax } from './prisma-admin.service.js';

describe('adminPoolMax', () => {
  it.each([undefined, null, '', 'not-a-number'])(
    'uses the production default for %j',
    (value) => {
      expect(adminPoolMax(value)).toBe(10);
    },
  );

  it.each([
    ['1', 1],
    ['7', 7],
    ['20', 20],
    ['50', 20],
    ['0', 1],
    ['-5', 1],
  ])('normalizes %s to %i', (value, expected) => {
    expect(adminPoolMax(value)).toBe(expected);
  });
});

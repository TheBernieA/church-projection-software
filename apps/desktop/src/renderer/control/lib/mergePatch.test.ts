import { describe, expect, it } from 'vitest';
import { mergePatch } from './mergePatch';

describe('mixer changes sent together', () => {
  it('merge nested sections, the later change winning', () => {
    const a = { gainDb: -3, eq: { bands: { '2': { db: 3, hz: 900 } } } };
    const b = { eq: { on: true, bands: { '2': { db: 4 }, '3': { q: 2 } } } };
    expect(mergePatch<Record<string, unknown>>(a, b)).toEqual({
      gainDb: -3,
      eq: { on: true, bands: { '2': { db: 4, hz: 900 }, '3': { q: 2 } } },
    });
  });
});

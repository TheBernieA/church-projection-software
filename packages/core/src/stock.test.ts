import { describe, expect, it } from 'vitest';
import { BackgroundRefSchema } from './schemas/theme';
import { STOCK_BACKGROUNDS, STOCK_COUNTDOWN_BACKGROUNDS } from './stock';

describe('stock media', () => {
  it('every stock background is a valid, uniquely named generated background', () => {
    const ids = STOCK_BACKGROUNDS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of STOCK_BACKGROUNDS)
      expect(BackgroundRefSchema.safeParse(b.ref).success).toBe(true);
  });
  it('countdowns use stock backgrounds that exist', () => {
    for (const id of STOCK_COUNTDOWN_BACKGROUNDS)
      expect(STOCK_BACKGROUNDS.some((b) => b.id === id)).toBe(true);
  });
});

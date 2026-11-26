import { describe, expect, it } from 'vitest';
import { DipTrace, type DipSummary } from './dipTrace';

/** Readings a second apart; the summaries written. */
function feed(t: DipTrace, delays: number[], from = 0): DipSummary[] {
  const out: DipSummary[] = [];
  delays.forEach((d, i) => {
    const s = t.next(d, from + i * 1000);
    if (s) out.push(s);
  });
  return out;
}

describe('DipTrace', () => {
  it('says nothing while the stream keeps up', () => {
    expect(feed(new DipTrace(), [100, 200, 150, 900, 300])).toEqual([]);
  });

  it('a stall that drains by itself: its shape, peak, and ~1 s/s growth', () => {
    const [s] = feed(
      new DipTrace(),
      [100, 1200, 2200, 3200, 4200, 5200, 6200, 7200, 4000, 1000, 200],
    );
    expect(s).toMatchObject({ end: 'drained', peakMs: 7200, seconds: 9, growth: 1 });
    expect(s?.shape).toEqual([1.2, 2.2, 3.2, 4.2, 5.2, 6.2, 7.2, 4, 1]);
  });

  it('an upload carrying part of the stream grows slower; the guard ending it says so', () => {
    const t = new DipTrace();
    feed(t, [1100, 1400, 1700, 2000, 2300, 2600, 2900, 3200]);
    const s = t.end('lower', 8000);
    expect(s).toMatchObject({ end: 'lower', growth: 0.3, peakMs: 3200 });
    expect(t.end('restart', 9000)).toBeNull();
  });

  it('a short dip still has a growth (up to its last reading)', () => {
    const [s] = feed(new DipTrace(), [1000, 2000, 3000, 100]);
    expect(s?.growth).toBe(1);
  });

  it('keeps at most 2 minutes of shape', () => {
    const t = new DipTrace();
    feed(
      t,
      Array.from({ length: 300 }, () => 2000),
    );
    expect(t.end('catchUp', 300_000)?.shape).toHaveLength(120);
  });
});

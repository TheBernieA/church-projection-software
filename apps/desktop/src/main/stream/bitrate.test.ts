import { describe, expect, it } from 'vitest';
import { BitrateController } from './bitrate';

describe('adaptive bitrate', () => {
  it('stays put while the stream is live', () => {
    const c = new BitrateController(6000);
    for (let t = 0; t < 60_000; t += 1000)
      expect(c.next({ delayMs: 80, sentKbps: 5800, at: t })).toBeNull();
    expect(c.current).toBe(6000);
  });

  it('drops well under what was getting through when the stream falls behind', () => {
    const c = new BitrateController(6000);
    // Asked for 6000, actually sending 1700 (the encoder undershoots), and falling behind.
    expect(c.next({ delayMs: 2000, sentKbps: 1700, at: 0 })).toEqual({
      kind: 'set',
      kbps: 1020,
      reason: 'congested',
    });
    // The change needs a moment to arrive before judging again.
    expect(c.next({ delayMs: 2500, sentKbps: 1600, at: 1000 })).toBeNull();
    // 60% of 1000 is 600, but a 6000 target never goes below 720 (12%).
    expect(c.next({ delayMs: 2600, sentKbps: 1000, at: 5000 })).toEqual({
      kind: 'set',
      kbps: 720,
      reason: 'congested',
    });
  });

  it('never goes below its floor', () => {
    const c = new BitrateController(3000);
    for (let t = 0; t < 60_000; t += 5000) c.next({ delayMs: 2000, sentKbps: 100, at: t });
    expect(c.current).toBe(500);
  });

  it('reconnects once a backlog has built up that lowering cannot drain', () => {
    const c = new BitrateController(6000);
    c.next({ delayMs: 2000, sentKbps: 2000, at: 0 });
    expect(c.next({ delayMs: 3500, sentKbps: 1100, at: 5000 })).toEqual({ kind: 'reconnect' });
    c.reconnected(5000);
    // Not again straight away.
    expect(c.next({ delayMs: 6000, sentKbps: 1100, at: 10_000 })?.kind).not.toBe('reconnect');
  });

  it('does not reconnect before it has tried lowering', () => {
    const c = new BitrateController(6000);
    expect(c.next({ delayMs: 9000, sentKbps: 3000, at: 0 })?.kind).toBe('set');
  });

  it('creeps back up once the stream has been live and steady', () => {
    const c = new BitrateController(4000);
    c.next({ delayMs: 2000, sentKbps: 4000, at: 0 }); // → 2400
    let t = 1000;
    const ups: number[] = [];
    for (; t < 600_000; t += 1000) {
      const a = c.next({ delayMs: 100, sentKbps: c.current, at: t });
      if (a?.kind === 'set') ups.push(a.kbps);
    }
    expect(ups[0]).toBe(3000);
    expect(c.current).toBe(4000); // back to the target (once the ceiling fades), and no higher
    expect(ups.at(-1)).toBe(4000);
  });

  it('does not climb back to a rate that choked the upload twice (for a while)', () => {
    const c = new BitrateController(6000);
    c.next({ delayMs: 2000, sentKbps: 1700, at: 0 }); // → 1020
    let t = 1000;
    for (; t < 60_000; t += 1000) c.next({ delayMs: 100, sentKbps: c.current, at: t });
    const climbed = c.current;
    // Chokes again at what it climbed to: that rate is too much for this upload.
    c.next({ delayMs: 2000, sentKbps: climbed, at: t });
    const ceiling = Math.round(climbed * 0.85);
    for (t += 1000; t < 180_000; t += 1000) c.next({ delayMs: 100, sentKbps: c.current, at: t });
    expect(c.current).toBeLessThanOrEqual(ceiling);
    // After five minutes it may try higher again.
    for (; t < 700_000; t += 1000) c.next({ delayMs: 100, sentKbps: c.current, at: t });
    expect(c.current).toBe(6000);
  });

  it('recovers fully after a one-off stall (no ceiling)', () => {
    const c = new BitrateController(6000);
    c.next({ delayMs: 1500, sentKbps: 1700, at: 0 });
    for (let t = 1000; t < 200_000; t += 1000) c.next({ delayMs: 100, sentKbps: c.current, at: t });
    expect(c.current).toBe(6000);
  });
});

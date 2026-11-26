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

  it('climbs back to just under the rate that choked, even when it hit the floor on the way', () => {
    // A real stream (1080p30 to YouTube over a ~1.1 Mb/s upload): choked at 1116, recovered,
    // choked again at 1103, and was still behind 4 s later while a still slide sent 484.
    const c = new BitrateController(4500);
    c.next({ delayMs: 1277, sentKbps: 1116, at: 0 });
    for (let t = 1000; t < 37_000; t += 1000) c.next({ delayMs: 50, sentKbps: 500, at: t });
    c.next({ delayMs: 1322, sentKbps: 1103, at: 37_000 });
    c.next({ delayMs: 2003, sentKbps: 484, at: 41_000 });
    expect(c.current).toBe(662); // 60% of the 1103 that choked, not of the 484 sent later
    for (let t = 42_000; t < 120_000; t += 1000) c.next({ delayMs: 50, sentKbps: 400, at: t });
    // 85% of the 1103 that choked; not stuck at the floor under a ceiling below it.
    expect(c.current).toBe(938);
  });

  it('says when the upload has held the bitrate well under the target for a while', () => {
    const c = new BitrateController(4500);
    c.next({ delayMs: 2000, sentKbps: 1100, at: 0 }); // → 660
    expect(c.starved(10_000)).toBe(false);
    for (let t = 1000; t < 40_000; t += 1000) c.next({ delayMs: 2000, sentKbps: 600, at: t });
    expect(c.starved(40_000)).toBe(true);
    c.reset(4500);
    expect(c.starved(40_000)).toBe(false);
  });

  it('sets no ceiling when a dip hits well under what the upload had been carrying', () => {
    // A real stream (720p30, a still picture, 3500 target): dips at 1817 and, 2 minutes later,
    // at 866, while the upload carried 2600 in between. The second dip held it at 736 for five
    // minutes; it should climb straight back instead.
    const c = new BitrateController(3500);
    let t = 0;
    for (; t < 60_000; t += 1000) c.next({ delayMs: 45, sentKbps: 2600, at: t });
    c.next({ delayMs: 1267, sentKbps: 1817, at: t });
    for (t += 1000; t < 170_000; t += 1000)
      c.next({ delayMs: 45, sentKbps: Math.min(c.current * 0.8, 2600), at: t });
    expect(c.current).toBe(3500);
    c.next({ delayMs: 1203, sentKbps: 866, at: t });
    expect(c.current).toBeLessThan(866);
    for (t += 1000; t < 300_000; t += 1000)
      c.next({ delayMs: 45, sentKbps: Math.min(c.current * 0.8, 2600), at: t });
    expect(c.current).toBe(3500);
  });
});

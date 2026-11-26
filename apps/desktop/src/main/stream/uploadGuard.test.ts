import { describe, expect, it } from 'vitest';
import { floorFor, UploadGuard } from './uploadGuard';

/** Feed one reading a second from `from` for `seconds`, at this delay; the actions taken. */
function feed(g: UploadGuard, delayMs: number, from: number, seconds: number) {
  const out = [];
  for (let s = 0; s < seconds; s++) {
    const a = g.next(delayMs, from + s * 1000);
    if (a) out.push(a);
  }
  return out;
}

/** Readings a second apart: delay from `start`, changing by `perSecond` ms each second. */
function ramp(g: UploadGuard, start: number, perSecond: number, from: number, seconds: number) {
  const out = [];
  for (let s = 0; s < seconds; s++) {
    const a = g.next(start + perSecond * s, from + s * 1000);
    if (a) out.push(a);
  }
  return out;
}

describe('UploadGuard', () => {
  it('leaves a stream that keeps up alone, and lets a short blip pass', () => {
    const g = new UploadGuard(6000);
    expect(feed(g, 200, 0, 60)).toEqual([]);
    expect(feed(g, 2500, 60_000, 4)).toEqual([]);
    expect(feed(g, 100, 64_000, 10)).toEqual([]);
    expect(g.current).toBe(6000);
  });

  it('behind for a while: restarts lower, then waits before the next step', () => {
    const g = new UploadGuard(6000);
    const first = feed(g, 3000, 0, 10);
    expect(first).toEqual([{ kind: 'lower', kbps: 4200 }]);
    // Still behind right after: no second restart within the gap.
    expect(feed(g, 3000, 10_000, 15)).toEqual([]);
    expect(feed(g, 3000, 31_000, 10)).toEqual([{ kind: 'lower', kbps: 2940 }]);
  });

  it('at the floor it only throws the backlog away, and says so', () => {
    const g = new UploadGuard(6000);
    let t = 0;
    const kinds: string[] = [];
    for (let i = 0; i < 6; i++) {
      for (const a of feed(g, 12_000, t, 40))
        kinds.push(a.kind === 'lower' ? String(a.kbps) : a.kind);
      t += 40_000;
    }
    expect(kinds.slice(0, 4)).toEqual(['4200', '2940', '2100', 'catchUp']);
    expect(kinds.slice(3).every((k) => k === 'catchUp')).toBe(true);
    expect(g.atFloor).toBe(true);
    expect(g.floor).toBe(2100);
  });

  it('a restart for another reason resets the watch', () => {
    const g = new UploadGuard(6000);
    feed(g, 3000, 0, 5);
    g.restarted(5000);
    expect(feed(g, 3000, 5000, 20)).toEqual([]);
  });

  it('a stall (nothing getting through) isn’t a slow upload: no lower bitrate', () => {
    const g = new UploadGuard(6000);
    // Wi-Fi drops out for 10 s (1 s behind per second), then the backlog drains.
    expect(ramp(g, 1600, 1000, 0, 10)).toEqual([]);
    expect(ramp(g, 11_000, -1500, 10_000, 7)).toEqual([]);
    expect(feed(g, 100, 17_000, 5)).toEqual([]);
    expect(g.current).toBe(6000);
  });

  it('a long stall gets one fresh connection after 20 s, at the same bitrate', () => {
    const g = new UploadGuard(6000);
    expect(ramp(g, 1600, 1000, 0, 25)).toEqual([{ kind: 'catchUp' }]);
    expect(g.current).toBe(6000);
  });

  it('an upload that carries only part of the bitrate falls behind slowly: lower', () => {
    const g = new UploadGuard(6000);
    // Carries 4,000 of 6,000: a third of a second behind each second.
    expect(ramp(g, 1600, 333, 0, 10)).toEqual([{ kind: 'lower', kbps: 4200 }]);
  });

  it('draining by itself is left alone, even while still behind', () => {
    const g = new UploadGuard(6000);
    expect(ramp(g, 5000, -300, 0, 12)).toEqual([]);
  });

  it('at the floor, a small backlog isn’t worth a break; a big one is', () => {
    const g = new UploadGuard(3000);
    expect(g.floor).toBe(1500);
    feed(g, 3000, 0, 10); // 2100
    feed(g, 3000, 40_000, 10); // 1500
    expect(g.atFloor).toBe(true);
    expect(feed(g, 4000, 80_000, 40)).toEqual([]);
    expect(feed(g, 12_000, 120_000, 10)).toEqual([{ kind: 'catchUp' }]);
  });

  it('a lighter mode can start at what the upload was carrying', () => {
    expect(new UploadGuard(3500, undefined, 2100).current).toBe(2100);
    expect(new UploadGuard(3500, undefined, 9000).current).toBe(3500);
    expect(new UploadGuard(3500, undefined, 800).current).toBe(1500);
  });

  it('a smaller picture may go lower before it only restarts', () => {
    expect(floorFor(6000, 1080)).toBe(2100);
    expect(floorFor(3500, 720)).toBe(1225);
    expect(floorFor(2000, 540)).toBe(700);
    expect(floorFor(1200, 540)).toBe(600);
    expect(floorFor(500, 540)).toBe(500); // a target under the minimum is its own floor
    // 540p at 2000 on an upload carrying ~600 kb/s: steps down three times, then holds.
    const g = new UploadGuard(2000, floorFor(2000, 540));
    let t = 0;
    const kinds: string[] = [];
    for (let i = 0; i < 4; i++) {
      for (const a of ramp(g, 2000, 600, t, 40))
        kinds.push(a.kind === 'lower' ? String(a.kbps) : a.kind);
      t += 40_000;
    }
    expect(kinds.slice(0, 3)).toEqual(['1400', '980', '700']);
  });
});

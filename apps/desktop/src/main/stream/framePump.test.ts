import { afterEach, describe, expect, it, vi } from 'vitest';
import { framesDue, msToNextFrame } from '@lampstand/core';
import { FramePump } from './framePump';

afterEach(() => vi.useRealTimers());

describe('frame clock', () => {
  it('counts the frames due by now', () => {
    expect(framesDue(0, 0, 30, 0)).toBe(1);
    expect(framesDue(0, 100, 30, 1)).toBe(3); // frames 1, 2, 3 at 33, 67, 100 ms
    expect(framesDue(0, 100, 30, 4)).toBe(0);
    expect(msToNextFrame(0, 40, 30, 2)).toBeCloseTo(26.7, 1);
  });

  it('keeps time after late ticks: exactly fps frames per second of clock', () => {
    vi.useFakeTimers();
    let clock = 0;
    let written = 0;
    const pump = new FramePump(30, { write: () => (written++, true) }, () => clock);
    pump.begin();
    // Ticks run late (a busy main process): every 50 ms instead of 33.
    for (let t = 0; t < 2000; t += 50) {
      clock = t;
      pump.tick();
    }
    expect(pump.framesSent).toBe(framesDue(0, 1950, 30, 0));
    expect(written).toBe(pump.framesSent);
    expect(pump.dropped).toBe(0);
    pump.stop();
  });

  it('catches up after a long stall a few frames a tick, never skipping (picture stays with the sound)', () => {
    vi.useFakeTimers();
    let clock = 0;
    let written = 0;
    const pump = new FramePump(30, { write: () => (written++, true) }, () => clock, 4);
    pump.begin();
    clock = 1000; // a one-second freeze
    pump.tick();
    expect(written).toBe(5); // the first frame, then at most 4
    expect(pump.behind).toBe(26);
    // The next ticks (on time again) repay what's owed, 4 at a time.
    for (let i = 0; i < 20; i++) {
      clock += 1000 / 30;
      pump.tick();
    }
    expect(pump.behind).toBe(0);
    expect(pump.framesSent).toBe(framesDue(0, clock, 30, 0));
    pump.stop();
  });

  it('frames the encoder could not take are written once it can (none lost)', () => {
    vi.useFakeTimers();
    let clock = 0;
    let open = false;
    let written = 0;
    const pump = new FramePump(30, { write: () => open && (written++, true) }, () => clock);
    pump.begin();
    clock = 100;
    pump.tick();
    expect(pump.dropped).toBe(4);
    expect(written).toBe(0);
    open = true;
    for (let i = 0; i < 3; i++) {
      clock += 1000 / 30;
      pump.tick();
    }
    expect(pump.behind).toBe(0);
    expect(written).toBe(framesDue(0, clock, 30, 0));
    pump.stop();
  });
});

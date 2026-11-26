import { describe, expect, it } from 'vitest';
import { LoudnessMeter } from './loudness';

/** A block's mean square (both sides) for a sine at this peak on both sides. */
const sine = (peak: number): number => (2 * (peak * peak)) / 2;

describe('loudness (BS.1770)', () => {
  it('a full-scale sine on both sides reads about 0 LUFS', () => {
    const m = new LoudnessMeter();
    for (let i = 0; i < 40; i++) m.add(sine(1));
    const l = m.read();
    // 10·log10(1) − 0.691 = −0.69 (K-weighting at 1 kHz is about 0 dB).
    expect(l.momentary).toBeCloseTo(-0.69, 1);
    expect(l.shortTerm).toBeCloseTo(-0.69, 1);
    expect(l.integrated).toBeCloseTo(-0.69, 0);
  });

  it('short-term follows the last 3 s, momentary the last 400 ms', () => {
    const m = new LoudnessMeter();
    for (let i = 0; i < 30; i++) m.add(sine(0.1)); // about −20.7 LUFS
    for (let i = 0; i < 4; i++) m.add(sine(1));
    const l = m.read();
    expect(l.momentary).toBeCloseTo(-0.69, 1);
    expect(l.shortTerm).toBeGreaterThan(-20);
    expect(l.shortTerm).toBeLessThan(-5);
  });

  it('silence and quiet gaps don’t drag the integrated loudness down (gating)', () => {
    const steady = new LoudnessMeter();
    const gappy = new LoudnessMeter();
    for (let i = 0; i < 100; i++) steady.add(sine(0.1));
    // Speech in 4 s stretches with 4 s pauses: silence, or a room 40 dB down. BS.1770 gates
    // 400 ms windows, so only the windows straddling an edge count partly.
    for (let n = 0; n < 5; n++) {
      for (let i = 0; i < 40; i++) gappy.add(sine(0.1));
      for (let i = 0; i < 40; i++) gappy.add(n % 2 ? 0 : sine(0.001));
    }
    expect(Math.abs(gappy.read().integrated - steady.read().integrated)).toBeLessThan(0.5);
  });

  it('silence reads −∞, and reset starts over', () => {
    const m = new LoudnessMeter();
    for (let i = 0; i < 10; i++) m.add(0);
    expect(m.read().integrated).toBe(-Infinity);
    for (let i = 0; i < 10; i++) m.add(sine(1));
    m.reset();
    expect(m.read()).toEqual({ momentary: -Infinity, shortTerm: -Infinity, integrated: -Infinity });
  });
});

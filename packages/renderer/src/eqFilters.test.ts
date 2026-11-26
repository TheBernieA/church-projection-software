import { describe, expect, it } from 'vitest';
import { eqDefaults, type EqBand } from '@lampstand/core';
import {
  bandStage,
  biquadDb,
  cutStages,
  eqStages,
  HPF_OFF_HZ,
  LPF_OFF_HZ,
  stagesDb,
  type FilterStage,
} from './eqFilters';

const SR = 48_000;
const bell = (o: Partial<FilterStage> = {}): FilterStage => ({
  type: 'peaking',
  hz: 1000,
  q: 1,
  db: 6,
  ...o,
});

describe('the EQ’s filters, as Web Audio runs them', () => {
  it('a bell boosts by its gain at its centre and leaves the far ends alone', () => {
    expect(biquadDb(bell(), 1000, SR)).toBeCloseTo(6, 5);
    expect(biquadDb(bell({ db: -9 }), 1000, SR)).toBeCloseTo(-9, 5);
    expect(Math.abs(biquadDb(bell(), 30, SR))).toBeLessThan(0.1);
    expect(Math.abs(biquadDb(bell(), 18_000, SR))).toBeLessThan(0.3);
  });

  it('a narrower bell (higher Q) touches less of its neighbours', () => {
    const wide = biquadDb(bell({ q: 0.5 }), 2000, SR);
    const narrow = biquadDb(bell({ q: 4 }), 2000, SR);
    expect(wide).toBeGreaterThan(narrow + 2);
  });

  it('shelves lift one end by their gain and leave the other', () => {
    const low: FilterStage = { type: 'lowshelf', hz: 200, q: 1, db: 6 };
    expect(biquadDb(low, 25, SR)).toBeCloseTo(6, 1);
    expect(biquadDb(low, 200, SR)).toBeCloseTo(3, 1);
    expect(Math.abs(biquadDb(low, 10_000, SR))).toBeLessThan(0.05);
    const high: FilterStage = { type: 'highshelf', hz: 5000, q: 1, db: -6 };
    expect(biquadDb(high, 20_000, SR)).toBeCloseTo(-6, 0);
    expect(Math.abs(biquadDb(high, 100, SR))).toBeLessThan(0.05);
  });

  it('a notch takes out its frequency', () => {
    const n: FilterStage = { type: 'notch', hz: 60, q: 8, db: 0 };
    expect(biquadDb(n, 60, SR)).toBeLessThan(-60);
    expect(Math.abs(biquadDb(n, 200, SR))).toBeLessThan(0.1);
  });

  it('cuts are Butterworth: −3 dB at the corner, then 12, 24 or 48 dB an octave', () => {
    for (const slope of [12, 24, 48] as const) {
      const s = cutStages('highpass', true, 100, slope);
      expect(stagesDb(s, 100, SR)).toBeCloseTo(-3, 0);
      // Two octaves below, close to the full slope.
      expect(stagesDb(s, 25, SR)).toBeLessThan(-slope * 2 + 4);
      expect(Math.abs(stagesDb(s, 1000, SR))).toBeLessThan(0.1);
    }
    const lp = cutStages('lowpass', true, 8000, 24);
    expect(stagesDb(lp, 8000, SR)).toBeCloseTo(-3, 0);
    expect(Math.abs(stagesDb(lp, 1000, SR))).toBeLessThan(0.1);
  });

  it('cuts switched off (and the stages a gentle slope doesn’t use) pass everything', () => {
    const hp = cutStages('highpass', false, 300, 48);
    expect(hp.every((s) => s.hz === HPF_OFF_HZ)).toBe(true);
    expect(Math.abs(stagesDb(hp, 40, SR))).toBeLessThan(0.2);
    const lp = cutStages('lowpass', false, 3000, 48);
    expect(lp.every((s) => s.hz === LPF_OFF_HZ)).toBe(true);
    expect(stagesDb(lp, 19_000, SR)).toBe(0);
    expect(
      cutStages('lowpass', true, 3000, 12)
        .slice(1)
        .every((s) => s.hz === LPF_OFF_HZ),
    ).toBe(true);
  });

  it('bands follow their switch and the EQ’s bypass without changing type (no clicks)', () => {
    const b: EqBand = { type: 'bell', on: true, hz: 500, db: 4, q: 2 };
    expect(bandStage(b, true)).toEqual({ type: 'peaking', hz: 500, q: 2, db: 4 });
    expect(bandStage(b, false)).toEqual({ type: 'peaking', hz: 500, q: 2, db: 0 });
    expect(bandStage({ ...b, on: false }, true).db).toBe(0);
    expect(bandStage({ ...b, type: 'highShelf' }, false).type).toBe('highshelf');
  });

  it('a flat EQ is flat everywhere', () => {
    const c = {
      eq: eqDefaults(),
      hpf: false,
      hpfHz: 80,
      hpfSlope: 12 as const,
      lpf: false,
      lpfHz: 16_000,
      lpfSlope: 12 as const,
    };
    const s = eqStages(c);
    for (const f of [40, 100, 1000, 10_000])
      expect(Math.abs(stagesDb([...s.hpf, ...s.lpf, ...s.bands], f, SR))).toBeLessThan(0.1);
  });
});

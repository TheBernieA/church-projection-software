import type { CutSlope, EqBand, EqBandType, MixerChannel } from '@lampstand/core';

/**
 * One Web Audio biquad as the strip sets it: its type, frequency, Q and gain exactly as the node
 * takes them (so `biquadDb` draws what the strip really does). Note the Web Audio convention:
 * a low-pass or high-pass's Q is in dB, every other type's is the usual linear Q.
 */
export interface FilterStage {
  type: BiquadFilterType;
  hz: number;
  q: number;
  db: number;
}

/** Each cut is built from this many biquads (48 dB/octave needs four). */
export const CUT_STAGES = 4;
/** The low cut's "off": a high-pass below hearing. */
export const HPF_OFF_HZ = 5;
/**
 * The high cut's "off": above Nyquist, where a Web Audio low-pass passes everything unchanged
 * (the strip clamps it to its context's Nyquist). Ramping there opens the cut smoothly.
 */
export const LPF_OFF_HZ = 96_000;

/**
 * Butterworth Qs for 2, 4 and 8 poles (a flat pass band, −3 dB at the corner), as Web Audio's
 * dB Q for low- and high-pass filters.
 */
const BUTTERWORTH: Record<CutSlope, number[]> = {
  12: [0.7071],
  24: [0.5412, 1.3066],
  48: [0.5098, 0.6013, 0.9, 2.5629],
};
const qDb = (q: number): number => 20 * Math.log10(q);

/** A low or high cut as its four biquads (the ones its slope doesn't need stand open). */
export function cutStages(
  kind: 'highpass' | 'lowpass',
  on: boolean,
  hz: number,
  slope: CutSlope,
): FilterStage[] {
  const qs = BUTTERWORTH[slope];
  const open = kind === 'highpass' ? HPF_OFF_HZ : LPF_OFF_HZ;
  return Array.from({ length: CUT_STAGES }, (_, i) => {
    const q = qs[i];
    return on && q !== undefined
      ? { type: kind, hz, q: qDb(q), db: 0 }
      : { type: kind, hz: open, q: qDb(0.7071), db: 0 };
  });
}

const NODE_TYPE: Record<EqBandType, BiquadFilterType> = {
  bell: 'peaking',
  lowShelf: 'lowshelf',
  highShelf: 'highshelf',
  notch: 'notch',
};

/**
 * An EQ band as its biquad. Off (or the EQ bypassed), a bell or shelf stays its type at 0 dB,
 * which leaves the sound exactly as it is, so bypassing never clicks; a notch has no 0 dB, so
 * it becomes a 0 dB bell.
 */
export function bandStage(b: EqBand, active: boolean): FilterStage {
  const on = active && b.on;
  if (b.type === 'notch' && !on) return { type: 'peaking', hz: b.hz, q: b.q, db: 0 };
  return { type: NODE_TYPE[b.type], hz: b.hz, q: b.q, db: on ? b.db : 0 };
}

/** Every filter a channel's EQ section runs, in order: low cut, high cut, the six bands. */
export function eqStages(
  c: Pick<MixerChannel, 'eq' | 'hpf' | 'hpfHz' | 'hpfSlope' | 'lpf' | 'lpfHz' | 'lpfSlope'>,
): { hpf: FilterStage[]; lpf: FilterStage[]; bands: FilterStage[] } {
  return {
    hpf: cutStages('highpass', c.hpf, c.hpfHz, c.hpfSlope),
    lpf: cutStages('lowpass', c.lpf, c.lpfHz, c.lpfSlope),
    bands: c.eq.bands.map((b) => bandStage(b, c.eq.on)),
  };
}

/**
 * A biquad's gain in dB at `f` Hz, from the coefficients the Web Audio spec gives each type
 * (Robert Bristow-Johnson's cookbook, with its conventions: shelves have a fixed slope, and
 * low- and high-pass Q is in dB).
 */
export function biquadDb(s: FilterStage, f: number, sampleRate: number): number {
  const nyquist = sampleRate / 2;
  const hz = Math.min(s.hz, nyquist);
  // At or past Nyquist a low-pass passes everything; at 0 Hz a high-pass does.
  if (s.type === 'lowpass' && hz >= nyquist) return 0;
  if (s.type === 'highpass' && hz <= 0) return 0;
  const w0 = (2 * Math.PI * hz) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const A = Math.pow(10, s.db / 40);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  switch (s.type) {
    case 'lowpass':
    case 'highpass': {
      const alpha = sin / (2 * Math.pow(10, s.q / 20));
      const k = s.type === 'lowpass' ? (1 - cos) / 2 : (1 + cos) / 2;
      b0 = k;
      b1 = s.type === 'lowpass' ? 1 - cos : -(1 + cos);
      b2 = k;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    }
    case 'peaking': {
      const alpha = sin / (2 * s.q);
      b0 = 1 + alpha * A;
      b1 = -2 * cos;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cos;
      a2 = 1 - alpha / A;
      break;
    }
    case 'notch': {
      const alpha = sin / (2 * s.q);
      b0 = 1;
      b1 = -2 * cos;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    }
    case 'lowshelf':
    case 'highshelf': {
      // Shelf slope S = 1 (Web Audio has no shelf Q).
      const t = 2 * Math.sqrt(A) * (sin / 2) * Math.SQRT2;
      const sign = s.type === 'lowshelf' ? 1 : -1;
      b0 = A * (A + 1 - sign * (A - 1) * cos + t);
      b1 = sign * 2 * A * (A - 1 - sign * (A + 1) * cos);
      b2 = A * (A + 1 - sign * (A - 1) * cos - t);
      a0 = A + 1 + sign * (A - 1) * cos + t;
      a1 = -sign * 2 * (A - 1 + sign * (A + 1) * cos);
      a2 = A + 1 + sign * (A - 1) * cos - t;
      break;
    }
    case 'allpass':
    case 'bandpass':
      // Not used by the strip.
      return 0;
  }
  // |H(e^jw)|² for w at f.
  const w = (2 * Math.PI * Math.min(f, nyquist)) / sampleRate;
  const c1 = Math.cos(w);
  const s1 = Math.sin(w);
  const c2 = Math.cos(2 * w);
  const s2 = Math.sin(2 * w);
  const nr = b0 + b1 * c1 + b2 * c2;
  const ni = -(b1 * s1 + b2 * s2);
  const dr = a0 + a1 * c1 + a2 * c2;
  const di = -(a1 * s1 + a2 * s2);
  const mag2 = (nr * nr + ni * ni) / (dr * dr + di * di);
  return mag2 > 0 ? 10 * Math.log10(mag2) : -120;
}

/** Several biquads in a row: their gains in dB add up. */
export const stagesDb = (stages: FilterStage[], f: number, sampleRate: number): number =>
  stages.reduce((sum, s) => sum + biquadDb(s, f, sampleRate), 0);

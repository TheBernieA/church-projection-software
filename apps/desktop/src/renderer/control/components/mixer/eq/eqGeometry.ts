import { EQ_MAX_DB, type EqBand, type MixerChannel } from '@lampstand/core';
import { biquadDb, eqStages, stagesDb, type FilterStage } from '@lampstand/renderer';

/** The graph's frequency range (log scale) and gain range (linear dB). */
export const LO_HZ = 20;
export const HI_HZ = 20_000;
export const GRAPH_DB = EQ_MAX_DB;
/** The rate the curve is drawn at (the mixer's contexts run at 48 kHz). */
export const SAMPLE_RATE = 48_000;

/** A node on the graph: the low cut, the six bands, the high cut. */
export type NodeId = 'hpf' | 0 | 1 | 2 | 3 | 4 | 5 | 'lpf';
export const NODE_IDS: readonly NodeId[] = ['hpf', 0, 1, 2, 3, 4, 5, 'lpf'];

/**
 * Each node's colour: the cuts in a neutral steel, the bands around the wheel from warm lows to
 * cool highs (no tally red or green, which mean on air and preview).
 */
export const NODE_COLOUR: Record<string, string> = {
  hpf: '#9aa3b5',
  0: '#f29f4c',
  1: '#e9c46a',
  2: '#4fc1b0',
  3: '#5aa9f0',
  4: '#9d8cf2',
  5: '#e57fb8',
  lpf: '#9aa3b5',
};
export const nodeColour = (id: NodeId): string => NODE_COLOUR[String(id)] ?? '#9aa3b5';

/** x (0…1) of a frequency on the graph, and back. */
export const hzToX = (hz: number): number => Math.log(hz / LO_HZ) / Math.log(HI_HZ / LO_HZ);
export const xToHz = (x: number): number =>
  Math.min(HI_HZ, Math.max(LO_HZ, LO_HZ * Math.pow(HI_HZ / LO_HZ, x)));
/** y (0 top … 1 bottom) of a gain, and back (±`GRAPH_DB`). */
export const dbToY = (db: number, range = GRAPH_DB): number => 0.5 - db / (2 * range);
export const yToDb = (y: number, range = GRAPH_DB): number => (0.5 - y) * 2 * range;

/** A frequency rounded the way people read it (5 Hz steps under 1 kHz, 50 Hz over, 100 over 10 k). */
export function roundHz(hz: number): number {
  const step = hz < 100 ? 1 : hz < 1000 ? 5 : hz < 10_000 ? 50 : 100;
  return Math.round(hz / step) * step;
}

/** "80 Hz", "1.25 kHz", "12 kHz". */
export function formatHz(hz: number): string {
  if (hz < 1000) return `${Math.round(hz)} Hz`;
  const k = hz / 1000;
  return `${k >= 10 ? k.toFixed(1).replace(/\.0$/, '') : k.toFixed(2).replace(/0$/, '')} kHz`;
}

/** "+3.5 dB", "−6 dB", "0 dB". */
export const formatGain = (db: number): string =>
  `${db > 0.04 ? '+' : db < -0.04 ? '−' : ''}${Math.abs(db).toFixed(1).replace(/\.0$/, '')} dB`;

const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
/** The nearest musical note to a frequency ("A4" is 440 Hz): handy for finding a ring. */
export function noteOf(hz: number): string {
  const n = Math.round(12 * Math.log2(hz / 440)) + 57;
  return `${NOTES[((n % 12) + 12) % 12] ?? ''}${Math.floor(n / 12)}`;
}

type EqPart = Pick<
  MixerChannel,
  'eq' | 'hpf' | 'hpfHz' | 'hpfSlope' | 'lpf' | 'lpfHz' | 'lpfSlope'
>;

/** The whole EQ section's gain at `hz`: what the strip really does there. */
export function responseDb(c: EqPart, hz: number): number {
  const s = eqStages(c);
  return stagesDb([...s.hpf, ...s.lpf, ...s.bands], hz, SAMPLE_RATE);
}

/** One node's own filters (to draw its share of the curve). */
export function nodeStages(c: EqPart, id: NodeId): FilterStage[] {
  const s = eqStages({ ...c, eq: { ...c.eq, on: true } });
  if (id === 'hpf') return c.hpf ? s.hpf : [];
  if (id === 'lpf') return c.lpf ? s.lpf : [];
  const b = s.bands[id];
  return b ? [b] : [];
}

/** Gains of some filters at `points` frequencies evenly spread on the graph. */
export function curve(stages: FilterStage[], points: number): number[] {
  return Array.from({ length: points }, (_, i) => {
    const hz = xToHz(i / (points - 1));
    return stages.reduce((sum, s) => sum + biquadDb(s, hz, SAMPLE_RATE), 0);
  });
}

/** Where a node sits on the graph (x, and its gain: cuts and notches sit on the 0 dB line). */
export function nodePoint(c: EqPart, id: NodeId): { hz: number; db: number } {
  if (id === 'hpf') return { hz: c.hpfHz, db: 0 };
  if (id === 'lpf') return { hz: c.lpfHz, db: 0 };
  const b: EqBand | undefined = c.eq.bands[id];
  if (!b) return { hz: 1000, db: 0 };
  return { hz: b.hz, db: b.type === 'notch' ? 0 : b.db };
}

/** Is this node doing anything (a cut that's on, a band that's on and not flat)? */
export function nodeActive(c: EqPart, id: NodeId): boolean {
  if (id === 'hpf') return c.hpf;
  if (id === 'lpf') return c.lpf;
  const b = c.eq.bands[id];
  return !!b && c.eq.on && b.on && (b.type === 'notch' || Math.abs(b.db) >= 0.05);
}

/** The ranges each control keeps to (the mixer's own schema limits). */
export const HPF_RANGE = [20, 400] as const;
export const LPF_RANGE = [1000, 20_000] as const;
export const BAND_RANGE = [LO_HZ, HI_HZ] as const;
export const Q_RANGE = [0.1, 18] as const;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

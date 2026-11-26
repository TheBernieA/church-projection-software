import {
  CUT_SLOPES,
  EQ_BAND_COUNT,
  EQ_DEFAULT_BANDS,
  EQ_MAX_DB,
  type CutSlope,
  type EqBand,
  type EqBandType,
  type MixerChannel,
  type MixerChannelPatch,
} from './schemas/mixer';
import {
  PRESET_FILE_FORMAT,
  PresetFileSchema,
  type Filter,
  type FilterKind,
  type PresetScope,
  type Processing,
  type ProcessingPreset,
} from './schemas/processing';

/**
 * Converting processing between Lampstand's channels and the device-neutral `Processing`, and
 * fitting it to what a destination can do. One path for every destination: a Lampstand channel,
 * a sound desk (its capabilities come from its profile), or an imported file.
 */

export interface Range {
  min: number;
  max: number;
}

/** What a destination's EQ and dynamics can do. */
export interface ProcessingCaps {
  /** General-purpose EQ bands. */
  bands: number;
  /** The shapes a band can take (a desk whose bands can be cuts lists them here too). */
  bandKinds: readonly FilterKind[];
  hz: Range;
  db: Range;
  q: Range;
  /** A dedicated low cut (beside the bands), with the slopes it has; null: none. */
  lowCut: { hz: Range; slopes: readonly number[] } | null;
  highCut: { hz: Range; slopes: readonly number[] } | null;
  gate: { thresholdDb: Range } | null;
  comp: {
    thresholdDb: Range;
    /** The ratios it has (a stepped control), or a range. */
    ratio: Range | readonly number[];
    attackMs: Range;
    releaseMs: Range;
    makeupDb: Range;
  } | null;
}

/** What Lampstand's own channels can do (the mixer schema's limits). */
export const LAMPSTAND_CAPS: ProcessingCaps = {
  bands: EQ_BAND_COUNT,
  bandKinds: ['bell', 'lowShelf', 'highShelf', 'notch'],
  hz: { min: 20, max: 20_000 },
  db: { min: -EQ_MAX_DB, max: EQ_MAX_DB },
  q: { min: 0.1, max: 18 },
  lowCut: { hz: { min: 20, max: 400 }, slopes: CUT_SLOPES },
  highCut: { hz: { min: 1000, max: 20_000 }, slopes: CUT_SLOPES },
  gate: { thresholdDb: { min: -80, max: 0 } },
  comp: {
    thresholdDb: { min: -60, max: 0 },
    ratio: { min: 1, max: 20 },
    attackMs: { min: 0.1, max: 200 },
    releaseMs: { min: 10, max: 1000 },
    makeupDb: { min: 0, max: 24 },
  },
};

/** Something that couldn't go over exactly, for the operator to read before it's applied. */
export type FitNote =
  | { code: 'bandDropped'; hz: number; db: number }
  | { code: 'kindChanged'; hz: number; from: FilterKind; to: FilterKind }
  | { code: 'clamped'; what: 'hz' | 'db' | 'q'; hz: number }
  | { code: 'cutDropped'; which: 'lowCut' | 'highCut' }
  | { code: 'cutAsBand'; which: 'lowCut' | 'highCut' }
  | { code: 'slopeChanged'; which: 'lowCut' | 'highCut'; from: number; to: number }
  | { code: 'gateDropped' }
  | { code: 'compDropped' }
  | { code: 'compChanged'; what: 'ratio' | 'thresholdDb' | 'attackMs' | 'releaseMs' | 'makeupDb' };

const BAND_TO_FILTER: Record<EqBandType, FilterKind> = {
  bell: 'bell',
  lowShelf: 'lowShelf',
  highShelf: 'highShelf',
  notch: 'notch',
};
const FILTER_TO_BAND: Partial<Record<FilterKind, EqBandType>> = {
  bell: 'bell',
  lowShelf: 'lowShelf',
  highShelf: 'highShelf',
  notch: 'notch',
};

const isCut = (k: FilterKind): k is 'lowCut' | 'highCut' => k === 'lowCut' || k === 'highCut';
/** A band doing nothing: off, or a bell or shelf at 0 dB (a notch always does something). */
export const isFlat = (f: Filter): boolean =>
  !f.on || (f.kind !== 'notch' && !isCut(f.kind) && Math.abs(f.db) < 0.05);

/** A Lampstand channel's processing, device-neutral (`eq`: the EQ and cuts only). */
export function channelProcessing(
  c: Pick<
    MixerChannel,
    'eq' | 'hpf' | 'hpfHz' | 'hpfSlope' | 'lpf' | 'lpfHz' | 'lpfSlope' | 'gate' | 'comp'
  >,
  scope: PresetScope = 'all',
): Processing {
  const filters: Filter[] = [];
  if (c.hpf)
    filters.push({ kind: 'lowCut', on: true, hz: c.hpfHz, db: 0, q: 0.71, slope: c.hpfSlope });
  if (c.lpf)
    filters.push({ kind: 'highCut', on: true, hz: c.lpfHz, db: 0, q: 0.71, slope: c.lpfSlope });
  for (const b of c.eq.bands)
    filters.push({ kind: BAND_TO_FILTER[b.type], on: b.on, hz: b.hz, db: b.db, q: b.q });
  const p: Processing = { eqOn: c.eq.on, filters };
  if (scope === 'all') {
    p.gate = { ...c.gate };
    p.comp = { ...c.comp };
  }
  return p;
}

const clamp = (v: number, r: Range): number => Math.min(r.max, Math.max(r.min, v));
const nearest = (v: number, list: readonly number[]): number =>
  list.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), list[0] ?? v);

/** How much a band matters: a notch most, then the bigger boost or cut. */
const weight = (f: Filter): number => (f.kind === 'notch' ? 99 : isFlat(f) ? -1 : Math.abs(f.db));

/**
 * Adapt processing to a destination: cuts to its own low and high cut (or a band, if its bands can
 * be cuts), the bands that matter most into the bands it has, shapes it lacks approximated, values
 * kept in its ranges, and the gate and compressor if it has them. Every change is in `notes`.
 */
export function fitProcessing(
  p: Processing,
  caps: ProcessingCaps,
): { processing: Processing; notes: FitNote[] } {
  const notes: FitNote[] = [];
  const out: Filter[] = [];
  let slots = caps.bands;

  // Cuts first: the first of each kind that's on.
  for (const which of ['lowCut', 'highCut'] as const) {
    const cuts = p.filters.filter((f) => f.kind === which && f.on);
    const cut = cuts[0];
    if (!cut) continue;
    const own = caps[which];
    if (own) {
      const hz = clamp(cut.hz, own.hz);
      if (Math.abs(hz - cut.hz) > 0.5) notes.push({ code: 'clamped', what: 'hz', hz: cut.hz });
      const from = cut.slope ?? 12;
      const slope = nearest(from, own.slopes);
      if (slope !== from) notes.push({ code: 'slopeChanged', which, from, to: slope });
      out.push({ ...cut, hz, slope });
    } else if (caps.bandKinds.includes(which) && slots > 0) {
      slots--;
      notes.push({ code: 'cutAsBand', which });
      out.push({ ...cut, hz: clamp(cut.hz, caps.hz) });
    } else notes.push({ code: 'cutDropped', which });
    for (const extra of cuts.slice(1)) notes.push({ code: 'bandDropped', hz: extra.hz, db: 0 });
  }

  // The bands that matter most, as many as fit; flat ones only fill spare room.
  const bands = p.filters
    .filter((f) => !isCut(f.kind))
    .map((f, i) => ({ f, i }))
    .sort((a, b) => weight(b.f) - weight(a.f) || a.i - b.i);
  const kept = bands.slice(0, slots);
  for (const { f } of bands.slice(slots))
    if (!isFlat(f)) notes.push({ code: 'bandDropped', hz: f.hz, db: f.db });

  for (const { f } of kept.sort((a, b) => a.i - b.i)) {
    let g: Filter = { ...f };
    if (!caps.bandKinds.includes(g.kind)) {
      // A shape it lacks: a notch becomes a deep, narrow bell; a shelf a wide bell.
      const to: FilterKind = 'bell';
      g =
        g.kind === 'notch'
          ? { ...g, kind: to, db: caps.db.min, q: caps.q.max }
          : { ...g, kind: to, q: Math.min(g.q, 0.7) };
      notes.push({ code: 'kindChanged', hz: f.hz, from: f.kind, to });
    }
    const hz = clamp(g.hz, caps.hz);
    const db = clamp(g.db, caps.db);
    const q = clamp(g.q, caps.q);
    if (Math.abs(hz - g.hz) > 0.5) notes.push({ code: 'clamped', what: 'hz', hz: g.hz });
    if (Math.abs(db - g.db) > 0.05 && !isFlat(g))
      notes.push({ code: 'clamped', what: 'db', hz: g.hz });
    if (Math.abs(q - g.q) > 0.01 && g.kind !== 'lowShelf' && g.kind !== 'highShelf' && !isFlat(g))
      notes.push({ code: 'clamped', what: 'q', hz: g.hz });
    out.push({ ...g, hz, db, q });
  }

  const processing: Processing = { eqOn: p.eqOn, filters: out };
  if (p.gate) {
    if (caps.gate)
      processing.gate = {
        ...p.gate,
        thresholdDb: clamp(p.gate.thresholdDb, caps.gate.thresholdDb),
      };
    else if (p.gate.on) notes.push({ code: 'gateDropped' });
  }
  if (p.comp) {
    const c = caps.comp;
    if (c) {
      const fit = {
        ...p.comp,
        thresholdDb: clamp(p.comp.thresholdDb, c.thresholdDb),
        ratio: Array.isArray(c.ratio)
          ? nearest(p.comp.ratio, c.ratio)
          : clamp(p.comp.ratio, c.ratio as Range),
        attackMs: clamp(p.comp.attackMs, c.attackMs),
        releaseMs: clamp(p.comp.releaseMs, c.releaseMs),
        makeupDb: clamp(p.comp.makeupDb, c.makeupDb),
      };
      if (p.comp.on)
        for (const what of ['ratio', 'thresholdDb', 'attackMs', 'releaseMs', 'makeupDb'] as const)
          if (Math.abs(fit[what] - p.comp[what]) > 0.05 * Math.max(1, Math.abs(p.comp[what])))
            notes.push({ code: 'compChanged', what });
      processing.comp = fit;
    } else if (p.comp.on) notes.push({ code: 'compDropped' });
  }
  return { processing, notes };
}

const toSlope = (s: number | undefined): CutSlope => nearest(s ?? 12, CUT_SLOPES) as CutSlope;

/**
 * Processing (already fitted to `LAMPSTAND_CAPS`) as a change to a Lampstand channel: cuts set or
 * switched off, the bands in its six slots (lowest first; spare slots back to flat), and the gate
 * and compressor when it has them.
 */
export function processingPatch(p: Processing): MixerChannelPatch {
  const low = p.filters.find((f) => f.kind === 'lowCut' && f.on);
  const high = p.filters.find((f) => f.kind === 'highCut' && f.on);
  const bands = p.filters
    .filter((f) => !isCut(f.kind))
    .slice(0, EQ_BAND_COUNT)
    .sort((a, b) => a.hz - b.hz);
  const slots: Partial<Record<'0' | '1' | '2' | '3' | '4' | '5', EqBand>> = {};
  for (let i = 0; i < EQ_BAND_COUNT; i++) {
    const f = bands[i];
    const flat = EQ_DEFAULT_BANDS[i];
    const key = String(i) as '0';
    if (f)
      slots[key] = {
        type: FILTER_TO_BAND[f.kind] ?? 'bell',
        on: f.on,
        hz: f.hz,
        db: f.db,
        q: f.q,
      };
    else if (flat) slots[key] = { ...flat };
  }
  const patch: MixerChannelPatch = {
    hpf: !!low,
    lpf: !!high,
    ...(low ? { hpfHz: low.hz, hpfSlope: toSlope(low.slope) } : {}),
    ...(high ? { lpfHz: high.hz, lpfSlope: toSlope(high.slope) } : {}),
    eq: { on: p.eqOn, bands: slots },
  };
  if (p.gate) patch.gate = { ...p.gate };
  if (p.comp) patch.comp = { ...p.comp };
  return patch;
}

/** A preset (or any processing) ready to apply to a Lampstand channel, with what changed. */
export function presetForChannel(p: Processing): { patch: MixerChannelPatch; notes: FitNote[] } {
  const fit = fitProcessing(p, LAMPSTAND_CAPS);
  return { patch: processingPatch(fit.processing), notes: fit.notes };
}

/** Presets as a file's text (pretty JSON). */
export function presetFileText(presets: ProcessingPreset[]): string {
  return JSON.stringify({ format: PRESET_FILE_FORMAT, version: 1, presets }, null, 2);
}

/** A presets file's presets, or null if it isn't one. */
export function readPresetFile(text: string): ProcessingPreset[] | null {
  try {
    const parsed = PresetFileSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.presets : null;
  } catch {
    return null;
  }
}

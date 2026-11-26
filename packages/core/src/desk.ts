import type { OscArg } from './schemas/surfaces';
import {
  DESK_PROFILE_FORMAT,
  DeskProfileFileSchema,
  DeskProfileSchema,
  type DeskParam,
  type DeskProfile,
} from './schemas/desk';
import type { Filter, FilterKind, Processing } from './schemas/processing';
import { fitProcessing, isFlat, type FitNote, type ProcessingCaps, type Range } from './processing';
import type { OscValue } from './surfaces';

/**
 * Speaking to a sound desk, as pure functions over its profile: which addresses hold a channel's
 * processing, what those values mean, and the messages that set it. The main process only sends
 * and receives; everything here is tested without a desk.
 */

const X32_RATIOS = [1.1, 1.3, 1.5, 2, 2.5, 3, 4, 5, 7, 10, 20, 100];
const X32_NOTE =
  'Written from Behringer’s published OSC documentation; not yet tested on a desk. Turn on ' +
  'nothing special on the desk: it answers on the network by itself.';

/** The X32 family's channel layout (the X Air family uses the same addresses). */
function behringer(
  id: string,
  name: string,
  port: number,
  channels: number,
  probe: string,
): DeskProfile {
  return DeskProfileSchema.parse({
    id,
    name,
    note: X32_NOTE,
    transport: 'osc-udp',
    port,
    channels,
    channelFormat: 'pad2',
    bandFormat: 'plain',
    probe,
    channelName: '/ch/{ch}/config/name',
    eq: {
      on: { address: '/ch/{ch}/eq/on' },
      bands: 4,
      type: {
        address: '/ch/{ch}/eq/{band}/type',
        kinds: { lowCut: 0, lowShelf: 1, bell: 2, highShelf: 4, highCut: 5 },
      },
      hz: { address: '/ch/{ch}/eq/{band}/f', scale: 'log', min: 20, max: 20_000 },
      db: { address: '/ch/{ch}/eq/{band}/g', scale: 'lin', min: -15, max: 15 },
      q: { address: '/ch/{ch}/eq/{band}/q', scale: 'log', min: 10, max: 0.3 },
    },
    lowCut: {
      on: { address: '/ch/{ch}/preamp/hpon' },
      hz: { address: '/ch/{ch}/preamp/hpf', scale: 'log', min: 20, max: 400 },
      slopes: [12],
    },
    gate: {
      on: { address: '/ch/{ch}/gate/on' },
      threshold: { address: '/ch/{ch}/gate/thr', scale: 'lin', min: -80, max: 0 },
    },
    comp: {
      on: { address: '/ch/{ch}/dyn/on' },
      threshold: { address: '/ch/{ch}/dyn/thr', scale: 'lin', min: -60, max: 0 },
      ratio: { address: '/ch/{ch}/dyn/ratio', scale: 'steps', steps: X32_RATIOS, type: 'i' },
      attack: { address: '/ch/{ch}/dyn/attack', scale: 'lin', min: 0, max: 120 },
      release: { address: '/ch/{ch}/dyn/release', scale: 'log', min: 5, max: 4000 },
      makeup: { address: '/ch/{ch}/dyn/mgain', scale: 'lin', min: 0, max: 24 },
    },
  });
}

/** The desks Lampstand knows out of the box; any other OSC desk can be added with a profile file. */
export const BUILT_IN_DESKS: readonly DeskProfile[] = [
  behringer('behringer-x32', 'Behringer X32 / Midas M32', 10023, 32, '/info'),
  behringer(
    'behringer-xair',
    'Behringer X Air (XR12, XR16, XR18) / Midas MR18',
    10024,
    16,
    '/xinfo',
  ),
];

/** Every profile on offer: the built-in ones, then the operator's (a same id replaces). */
export function deskProfiles(custom: readonly DeskProfile[]): DeskProfile[] {
  const ids = new Set(custom.map((p) => p.id));
  return [...BUILT_IN_DESKS.filter((p) => !ids.has(p.id)), ...custom];
}

const fmt = (n: number, f: 'pad2' | 'plain'): string =>
  f === 'pad2' ? String(n).padStart(2, '0') : String(n);

/** An address for a channel (and band). */
export function deskAddress(profile: DeskProfile, template: string, ch: number, band = 1): string {
  return template
    .replaceAll('{ch}', fmt(ch, profile.channelFormat))
    .replaceAll('{band}', fmt(band, profile.bandFormat));
}

const range = (p: DeskParam): Range => ({
  min: Math.min(p.min, p.max),
  max: Math.max(p.min, p.max),
});

/** A value as the desk takes it. */
export function encodeParam(p: DeskParam, v: number): OscArg {
  if (p.scale === 'steps') {
    const steps = p.steps ?? [];
    let best = 0;
    steps.forEach((s, i) => {
      if (Math.abs(s - v) < Math.abs((steps[best] ?? s) - v)) best = i;
    });
    return { type: 'i', value: best };
  }
  const r = range(p);
  const x = Math.min(r.max, Math.max(r.min, v));
  if (!p.normalized)
    return p.type === 'i' ? { type: 'i', value: Math.round(x) } : { type: 'f', value: x };
  const n =
    p.scale === 'log'
      ? Math.log(x / p.min) / Math.log(p.max / p.min)
      : (x - p.min) / (p.max - p.min);
  return { type: 'f', value: Math.min(1, Math.max(0, n)) };
}

/** A value the desk reported, as the real value (null: not a number). */
export function decodeParam(p: DeskParam, raw: OscValue | undefined): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (p.scale === 'steps') return p.steps?.[Math.round(raw)] ?? null;
  if (!p.normalized) return raw;
  const n = Math.min(1, Math.max(0, raw));
  return p.scale === 'log' ? p.min * Math.pow(p.max / p.min, n) : p.min + n * (p.max - p.min);
}

const switchArg = (type: 'i' | 'f', on: boolean): OscArg =>
  type === 'i' ? { type: 'i', value: on ? 1 : 0 } : { type: 'f', value: on ? 1 : 0 };
const isOn = (raw: OscValue | undefined): boolean => typeof raw === 'number' && raw >= 0.5;

/** What a desk can do, from its profile (for `fitProcessing`). */
export function deskCaps(profile: DeskProfile): ProcessingCaps {
  const kinds = profile.eq.type
    ? (Object.keys(profile.eq.type.kinds) as FilterKind[])
    : (['bell'] as FilterKind[]);
  const ratio = profile.comp?.ratio;
  return {
    bands: profile.eq.bands,
    bandKinds: kinds,
    hz: range(profile.eq.hz),
    db: range(profile.eq.db),
    q: range(profile.eq.q),
    lowCut: profile.lowCut ? { hz: range(profile.lowCut.hz), slopes: profile.lowCut.slopes } : null,
    highCut: profile.highCut
      ? { hz: range(profile.highCut.hz), slopes: profile.highCut.slopes }
      : null,
    gate: profile.gate ? { thresholdDb: range(profile.gate.threshold) } : null,
    comp:
      profile.comp && ratio
        ? {
            thresholdDb: range(profile.comp.threshold),
            ratio: ratio.scale === 'steps' && ratio.steps ? ratio.steps : range(ratio),
            attackMs: range(profile.comp.attack),
            releaseMs: range(profile.comp.release),
            makeupDb: range(profile.comp.makeup),
          }
        : null,
  };
}

/** Every address that holds a channel's processing (and its name), to read it all. */
export function deskReadAddresses(profile: DeskProfile, ch: number): string[] {
  const a = (t: string, band = 1): string => deskAddress(profile, t, ch, band);
  const out: string[] = [];
  if (profile.channelName) out.push(a(profile.channelName));
  out.push(a(profile.eq.on.address));
  for (let b = 1; b <= profile.eq.bands; b++) {
    if (profile.eq.type) out.push(a(profile.eq.type.address, b));
    out.push(a(profile.eq.hz.address, b), a(profile.eq.db.address, b), a(profile.eq.q.address, b));
  }
  for (const cut of [profile.lowCut, profile.highCut])
    if (cut) out.push(a(cut.on.address), a(cut.hz.address));
  if (profile.gate) out.push(a(profile.gate.on.address), a(profile.gate.threshold.address));
  const c = profile.comp;
  if (c)
    out.push(
      ...[
        c.on.address,
        c.threshold.address,
        c.ratio.address,
        c.attack.address,
        c.release.address,
        c.makeup.address,
      ].map((x) => a(x)),
    );
  return out;
}

/**
 * A channel's processing from the values the desk reported (address → first argument); null if
 * the EQ's own values are missing (the desk didn't answer).
 */
export function deskProcessing(
  profile: DeskProfile,
  ch: number,
  values: ReadonlyMap<string, OscValue>,
): { processing: Processing; name: string | null } | null {
  const a = (t: string, band = 1): string => deskAddress(profile, t, ch, band);
  const get = (t: string, band = 1): OscValue | undefined => values.get(a(t, band));
  const filters: Filter[] = [];
  for (let b = 1; b <= profile.eq.bands; b++) {
    const hz = decodeParam(profile.eq.hz, get(profile.eq.hz.address, b));
    const db = decodeParam(profile.eq.db, get(profile.eq.db.address, b));
    const q = decodeParam(profile.eq.q, get(profile.eq.q.address, b));
    if (hz === null || db === null || q === null) return null;
    let kind: FilterKind = 'bell';
    if (profile.eq.type) {
      const raw = get(profile.eq.type.address, b);
      const found = Object.entries(profile.eq.type.kinds).find(([, n]) => n === raw);
      // A shape Lampstand doesn't have (an X32's "VEQ") reads as a bell.
      kind = (found?.[0] as FilterKind | undefined) ?? 'bell';
    }
    const cut = kind === 'lowCut' || kind === 'highCut';
    filters.push({ kind, on: true, hz, db: cut ? 0 : db, q, ...(cut ? { slope: 12 } : {}) });
  }
  for (const [which, cut] of [
    ['lowCut', profile.lowCut],
    ['highCut', profile.highCut],
  ] as const) {
    if (!cut || !isOn(get(cut.on.address))) continue;
    const hz = decodeParam(cut.hz, get(cut.hz.address));
    if (hz !== null)
      filters.unshift({ kind: which, on: true, hz, db: 0, q: 0.71, slope: cut.slopes[0] });
  }
  const processing: Processing = { eqOn: isOn(get(profile.eq.on.address)), filters };
  const g = profile.gate;
  if (g) {
    const thr = decodeParam(g.threshold, get(g.threshold.address));
    if (thr !== null) processing.gate = { on: isOn(get(g.on.address)), thresholdDb: thr };
  }
  const c = profile.comp;
  if (c) {
    const v = (p: DeskParam): number | null => decodeParam(p, get(p.address));
    const [thr, ratio, attack, release, makeup] = [
      c.threshold,
      c.ratio,
      c.attack,
      c.release,
      c.makeup,
    ].map(v);
    if (thr != null && ratio != null && attack != null && release != null && makeup != null)
      processing.comp = {
        on: isOn(get(c.on.address)),
        thresholdDb: thr,
        ratio,
        attackMs: attack,
        releaseMs: release,
        makeupDb: makeup,
      };
  }
  const name = profile.channelName ? get(profile.channelName) : undefined;
  return { processing, name: typeof name === 'string' ? name : null };
}

export interface DeskWrite {
  address: string;
  args: OscArg[];
}

/**
 * The messages that put processing on a desk channel, fitted to the desk first (`notes`: what
 * changed). Bands go lowest first; spare bands are set flat (and to bells where it can), so
 * nothing from before is left behind. Parts the processing doesn't carry (an EQ-only preset's
 * dynamics) are left as they are on the desk.
 */
export function deskWrites(
  profile: DeskProfile,
  ch: number,
  p: Processing,
): { messages: DeskWrite[]; notes: FitNote[] } {
  const { processing, notes } = fitProcessing(p, deskCaps(profile));
  const a = (t: string, band = 1): string => deskAddress(profile, t, ch, band);
  const messages: DeskWrite[] = [];
  const set = (address: string, arg: OscArg): void => void messages.push({ address, args: [arg] });

  // Cuts the desk has its own controls for go there; others went into bands when fitted.
  const own = { lowCut: !!profile.lowCut, highCut: !!profile.highCut };
  const low = processing.filters.find((f) => f.kind === 'lowCut' && own.lowCut);
  const high = processing.filters.find((f) => f.kind === 'highCut' && own.highCut);
  for (const [cut, f] of [
    [profile.lowCut, low],
    [profile.highCut, high],
  ] as const) {
    if (!cut) continue;
    set(a(cut.on.address), switchArg(cut.on.type, !!f));
    if (f) set(a(cut.hz.address), encodeParam(cut.hz, f.hz));
  }

  const bands = processing.filters
    .filter((f) => !((f.kind === 'lowCut' && own.lowCut) || (f.kind === 'highCut' && own.highCut)))
    .sort((x, y) => x.hz - y.hz);
  const bell = profile.eq.type?.kinds.bell;
  for (let b = 1; b <= profile.eq.bands; b++) {
    const f = bands[b - 1];
    const type = profile.eq.type;
    if (f) {
      const kindNo = type?.kinds[f.kind];
      if (type && kindNo !== undefined) set(a(type.address, b), { type: 'i', value: kindNo });
      set(a(profile.eq.hz.address, b), encodeParam(profile.eq.hz, f.hz));
      // A band switched off goes over flat (desks rarely switch single bands).
      set(a(profile.eq.db.address, b), encodeParam(profile.eq.db, isFlat(f) ? 0 : f.db));
      set(a(profile.eq.q.address, b), encodeParam(profile.eq.q, f.q));
    } else {
      if (type && bell !== undefined) set(a(type.address, b), { type: 'i', value: bell });
      set(a(profile.eq.db.address, b), encodeParam(profile.eq.db, 0));
    }
  }
  set(a(profile.eq.on.address), switchArg(profile.eq.on.type, processing.eqOn));

  if (profile.gate && processing.gate) {
    set(
      a(profile.gate.threshold.address),
      encodeParam(profile.gate.threshold, processing.gate.thresholdDb),
    );
    set(a(profile.gate.on.address), switchArg(profile.gate.on.type, processing.gate.on));
  }
  const c = profile.comp;
  const pc = processing.comp;
  if (c && pc) {
    set(a(c.threshold.address), encodeParam(c.threshold, pc.thresholdDb));
    set(a(c.ratio.address), encodeParam(c.ratio, pc.ratio));
    set(a(c.attack.address), encodeParam(c.attack, pc.attackMs));
    set(a(c.release.address), encodeParam(c.release, pc.releaseMs));
    set(a(c.makeup.address), encodeParam(c.makeup, pc.makeupDb));
    set(a(c.on.address), switchArg(c.on.type, pc.on));
  }
  return { messages, notes };
}

/** A desk profile file's profile, or null if it isn't one. */
export function readDeskProfileFile(text: string): DeskProfile | null {
  try {
    const parsed = DeskProfileFileSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.profile : null;
  } catch {
    return null;
  }
}

/** A desk profile as a file's text (to share it, or to start a new one from it). */
export const deskProfileFileText = (profile: DeskProfile): string =>
  JSON.stringify({ format: DESK_PROFILE_FORMAT, version: 1, profile }, null, 2);

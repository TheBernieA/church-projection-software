import { z } from 'zod';
import { IdSchema } from './common';

/** The quietest fader position: below this the channel is off (−∞). */
export const MIN_DB = -60;
export const MAX_DB = 12;

/** A level in dB as a gain multiplier (−60 dB and below is silence). */
export const dbToGain = (db: number): number => (db <= MIN_DB ? 0 : Math.pow(10, db / 20));
/** A gain multiplier as dB (silence is −∞). */
export const gainToDb = (gain: number): number =>
  gain <= 0 ? -Infinity : Math.round(2000 * Math.log10(gain)) / 100;
/** A level for people: "+3.0 dB", "−12.5 dB", "−∞". */
export const formatDb = (db: number): string =>
  db <= MIN_DB || !Number.isFinite(db)
    ? '−∞'
    : `${db > 0 ? '+' : db < 0 ? '−' : ''}${Math.abs(db).toFixed(1)} dB`;

const Db = z.number().min(MIN_DB).max(MAX_DB);
const Hz = (lo: number, hi: number) => z.number().min(lo).max(hi);

export const COMP_DEFAULTS = {
  on: false,
  thresholdDb: -18,
  ratio: 3,
  makeupDb: 0,
  attackMs: 5,
  releaseMs: 150,
} as const;
export const GATE_DEFAULTS = { on: false, thresholdDb: -50 } as const;
export const DUCK_DEFAULTS = { on: false, amountDb: 12, thresholdDb: -40 } as const;

/** How far an EQ band can boost or cut. */
export const EQ_MAX_DB = 18;
/** The EQ's bands: shelves at the ends, four bells between (each band can change its shape). */
export const EQ_BAND_COUNT = 6;
export const EQ_BAND_TYPES = ['bell', 'lowShelf', 'highShelf', 'notch'] as const;
export type EqBandType = (typeof EQ_BAND_TYPES)[number];
/** The low and high cut's steepness, in dB per octave. */
export const CUT_SLOPES = [12, 24, 48] as const;
export type CutSlope = (typeof CUT_SLOPES)[number];

const BandDb = z.number().min(-EQ_MAX_DB).max(EQ_MAX_DB);
const BandHz = Hz(20, 20_000);
const BandQ = z.number().min(0.1).max(18);
const Slope = z.union([z.literal(12), z.literal(24), z.literal(48)]);

export const EqBandSchema = z.object({
  type: z.enum(EQ_BAND_TYPES),
  /** Off: this band is left out (its settings kept). */
  on: z.boolean().default(true),
  hz: BandHz,
  db: BandDb.default(0),
  /** Width (higher is narrower); a shelf's Q sets how sharp its corner is. */
  q: BandQ.default(1),
});
export type EqBand = z.infer<typeof EqBandSchema>;

/** Where each band sits until moved: spread over the range a voice or an instrument uses. */
export const EQ_DEFAULT_BANDS: readonly EqBand[] = [
  { type: 'lowShelf', on: true, hz: 100, db: 0, q: 0.7 },
  { type: 'bell', on: true, hz: 250, db: 0, q: 1 },
  { type: 'bell', on: true, hz: 800, db: 0, q: 1 },
  { type: 'bell', on: true, hz: 2500, db: 0, q: 1 },
  { type: 'bell', on: true, hz: 6000, db: 0, q: 1 },
  { type: 'highShelf', on: true, hz: 10_000, db: 0, q: 0.7 },
];
export const eqDefaults = (): { on: boolean; bands: EqBand[] } => ({
  on: true,
  bands: EQ_DEFAULT_BANDS.map((b) => ({ ...b })),
});

/**
 * The 3-band EQ of earlier versions (low shelf, mid bell, high shelf): its settings move into
 * the new bands that do the same, so a saved mix sounds as it did.
 */
function fromThreeBand(v: unknown): unknown {
  if (!v || typeof v !== 'object' || 'bands' in v) return v;
  const o = v as Record<string, unknown>;
  const num = (k: string, d: number): number => {
    const x = o[k];
    return typeof x === 'number' ? x : d;
  };
  const bands = eqDefaults().bands;
  const [low, , mid, , , high] = bands;
  if (low) Object.assign(low, { hz: num('lowHz', 120), db: num('low', 0) });
  if (mid) Object.assign(mid, { hz: num('midHz', 1000), db: num('mid', 0), q: num('midQ', 0.9) });
  if (high) Object.assign(high, { hz: num('highHz', 8000), db: num('high', 0) });
  return { on: typeof o.on === 'boolean' ? o.on : true, bands };
}

const EqSchema = z
  .preprocess(
    fromThreeBand,
    z.object({
      /** Off: the EQ is bypassed (its settings kept). */
      on: z.boolean().default(true),
      bands: z.array(EqBandSchema).length(EQ_BAND_COUNT),
    }),
  )
  .default(eqDefaults);

const CompSchema = z
  .object({
    on: z.boolean().default(false),
    thresholdDb: z.number().min(-60).max(0).default(-18),
    ratio: z.number().min(1).max(20).default(3),
    makeupDb: z.number().min(0).max(24).default(0),
    /** How fast it reacts to a peak, and lets go after it. */
    attackMs: z.number().min(0.1).max(200).default(COMP_DEFAULTS.attackMs),
    releaseMs: z.number().min(10).max(1000).default(COMP_DEFAULTS.releaseMs),
  })
  .default({ ...COMP_DEFAULTS });

/** Closes a mic between words (room hum, a fan, the band bleeding in); opens instantly. */
const GateSchema = z
  .object({
    on: z.boolean().default(false),
    thresholdDb: z.number().min(-80).max(0).default(GATE_DEFAULTS.thresholdDb),
  })
  .default({ ...GATE_DEFAULTS });

/**
 * Ducking: this channel dips while someone speaks (any live input that "ducks others" is above
 * the threshold), and comes back up when they stop. Music under announcements, a video under a
 * presenter.
 */
const DuckSchema = z
  .object({
    on: z.boolean().default(false),
    /** How far it dips. */
    amountDb: z.number().min(3).max(40).default(DUCK_DEFAULTS.amountDb),
    /** How loud a voice must be to count as speaking. */
    thresholdDb: z.number().min(-60).max(-10).default(DUCK_DEFAULTS.thresholdDb),
  })
  .default({ ...DUCK_DEFAULTS });

/**
 * One mixer channel: the Audio tab's tracks, the sound of videos, or a live input (a microphone,
 * the desk's feed, a capture card's audio). Its strip runs, in order: low and high cut, a 6-band
 * parametric EQ, compressor, fader, pan; then it is sent to the room, the stream, or both.
 */
export const MixerChannelSchema = z.object({
  id: IdSchema,
  kind: z.enum(['tracks', 'video', 'input']),
  /** Inputs: which device (the computer's own id for it). */
  deviceId: z.string().max(300).default(''),
  name: z.string().min(1).max(40),
  gainDb: Db.default(0),
  mute: z.boolean().default(false),
  /** Listen to just this channel on the "Listen on" output (headphones), not the room. */
  solo: z.boolean().default(false),
  pan: z.number().min(-1).max(1).default(0),
  /** Inputs: one side of a stereo device only, or both (a mono mic plugged into input 1). */
  mono: z.boolean().default(false),
  /** Input gain before everything else: brings a quiet or hot source to a working level. */
  trimDb: z.number().min(-20).max(20).default(0),
  /** Flip the polarity (a mic wired the other way, two mics cancelling each other out). */
  invert: z.boolean().default(false),
  /** Hold this channel back so it lines up with the picture (0–1000 ms). */
  delayMs: z.number().int().min(0).max(1000).default(0),
  /** Inputs: the computer's noise suppression (fans, hiss); off keeps the sound untouched. */
  denoise: z.boolean().default(false),
  gate: GateSchema,
  /** Cut the rumble below the low cut's frequency (handling noise, stage thumps). */
  hpf: z.boolean().default(false),
  hpfHz: Hz(20, 400).default(80),
  hpfSlope: Slope.default(12),
  /** Cut the hiss and harshness above the high cut's frequency. */
  lpf: z.boolean().default(false),
  lpfHz: Hz(1000, 20_000).default(16_000),
  lpfSlope: Slope.default(12),
  eq: EqSchema,
  comp: CompSchema,
  duck: DuckSchema,
  /** Inputs: this channel's voice makes ducking channels dip. */
  ducksOthers: z.boolean().default(true),
  /** Locked: its controls don't move (no accidental changes during a service). */
  locked: z.boolean().default(false),
  /** The sound desk channel this one is linked to (Mixer › channel window › Desk), or none. */
  deskChannel: z.number().int().min(1).max(128).nullable().default(null),
  /** Heard in the room (the main output's speakers). */
  room: z.boolean().default(true),
  /** Goes out on the livestream and recording (and NDI feeds with sound). */
  stream: z.boolean().default(true),
});
export type MixerChannel = z.infer<typeof MixerChannelSchema>;

/** Where a mix goes: its master fader, mute, a safety limiter and a delay to line up with video. */
export const MixerBusSchema = z.object({
  gainDb: Db.default(0),
  mute: z.boolean().default(false),
  /** Stops the mix going over its ceiling (no harsh clipping when a mic is shouted into). */
  limiter: z.boolean().default(true),
  /** The limiter's ceiling in dBFS. */
  ceilingDb: z.number().min(-12).max(0).default(-1.5),
  /** Hold the sound back so it lines up with a camera that runs late (0–1000 ms). */
  delayMs: z.number().int().min(0).max(1000).default(0),
});
export type MixerBus = z.infer<typeof MixerBusSchema>;
export type MixerBusId = 'room' | 'stream';

export const MixerSchema = z.object({
  channels: z.array(MixerChannelSchema).max(24),
  room: MixerBusSchema,
  stream: MixerBusSchema,
});
export type Mixer = z.infer<typeof MixerSchema>;

const channel = (c: Partial<MixerChannel> & Pick<MixerChannel, 'id' | 'kind' | 'name'>) =>
  MixerChannelSchema.parse(c);

/** A fresh mixer: tracks and video sound, to the room and the stream. */
export function defaultMixer(): Mixer {
  return {
    channels: [
      channel({ id: 'tracks', kind: 'tracks', name: 'Tracks' }),
      channel({ id: 'video', kind: 'video', name: 'Video' }),
    ],
    room: MixerBusSchema.parse({}),
    stream: MixerBusSchema.parse({}),
  };
}

/**
 * A new input channel for a device: on the stream, not in the room. A mic or the desk's feed is
 * already on the room's speakers through the desk; playing it there again from the computer
 * would echo or howl, while a stream with no sound is the mistake nobody notices until later.
 */
function inputChannel(deviceId: string, name: string, id = `in-${deviceId.slice(0, 40)}`) {
  return channel({
    id,
    kind: 'input',
    deviceId,
    name: name.slice(0, 40) || 'Input',
    room: false,
    stream: true,
  });
}

/**
 * The mixer for these settings: the saved one, or one made from the older stream sound settings
 * (room on/off and level, and the stream's microphones).
 */
export function mixerFromSettings(s: {
  mixer?: Mixer | undefined;
  stream: {
    sound: { room: boolean; roomGain: number; mics: { deviceId: string; gain: number }[] };
  };
}): Mixer {
  if (s.mixer) return s.mixer;
  const m = defaultMixer();
  const { room, roomGain, mics } = s.stream.sound;
  for (const c of m.channels) c.stream = room;
  if (room && roomGain !== 1) m.stream.gainDb = Math.max(MIN_DB, gainToDb(roomGain));
  mics.forEach((mic, i) =>
    m.channels.push({
      ...inputChannel(mic.deviceId, `Mic ${i + 1}`),
      room: false,
      stream: true,
      gainDb: Math.max(MIN_DB, Math.min(MAX_DB, gainToDb(mic.gain))),
    }),
  );
  return m;
}

/**
 * Changes to a channel or bus: only the fields given (no defaults, which would quietly reset
 * everything not mentioned).
 */
const ChannelPatchSchema = z
  .object({
    deviceId: z.string().max(300),
    name: z.string().min(1).max(40),
    gainDb: Db,
    mute: z.boolean(),
    solo: z.boolean(),
    pan: z.number().min(-1).max(1),
    mono: z.boolean(),
    trimDb: z.number().min(-20).max(20),
    invert: z.boolean(),
    delayMs: z.number().int().min(0).max(1000),
    denoise: z.boolean(),
    gate: z.object({ on: z.boolean(), thresholdDb: z.number().min(-80).max(0) }).partial(),
    hpf: z.boolean(),
    hpfHz: Hz(20, 400),
    hpfSlope: Slope,
    lpf: z.boolean(),
    lpfHz: Hz(1000, 20_000),
    lpfSlope: Slope,
    eq: z
      .object({
        on: z.boolean(),
        /** Changes to some bands, by number ("0" … "5"). */
        bands: z.partialRecord(
          z.enum(['0', '1', '2', '3', '4', '5']),
          z
            .object({
              type: z.enum(EQ_BAND_TYPES),
              on: z.boolean(),
              hz: BandHz,
              db: BandDb,
              q: BandQ,
            })
            .partial(),
        ),
      })
      .partial(),
    comp: z
      .object({
        on: z.boolean(),
        thresholdDb: z.number().min(-60).max(0),
        ratio: z.number().min(1).max(20),
        makeupDb: z.number().min(0).max(24),
        attackMs: z.number().min(0.1).max(200),
        releaseMs: z.number().min(10).max(1000),
      })
      .partial(),
    duck: z
      .object({
        on: z.boolean(),
        amountDb: z.number().min(3).max(40),
        thresholdDb: z.number().min(-60).max(-10),
      })
      .partial(),
    ducksOthers: z.boolean(),
    locked: z.boolean(),
    deskChannel: z.number().int().min(1).max(128).nullable(),
    room: z.boolean(),
    stream: z.boolean(),
  })
  .partial();
export type MixerChannelPatch = z.infer<typeof ChannelPatchSchema>;

const BusPatchSchema = z
  .object({
    gainDb: Db,
    mute: z.boolean(),
    limiter: z.boolean(),
    ceilingDb: z.number().min(-12).max(0),
    delayMs: z.number().int().min(0).max(1000),
  })
  .partial();

/** One-click starting points for a channel's processing (its level, routing and device stay). */
export const PRESET_IDS = ['speech', 'singing', 'instrument', 'music', 'flat'] as const;
export type MixerPreset = (typeof PRESET_IDS)[number];

type Processing = Pick<
  MixerChannel,
  | 'gate'
  | 'hpf'
  | 'hpfHz'
  | 'hpfSlope'
  | 'lpf'
  | 'lpfHz'
  | 'lpfSlope'
  | 'eq'
  | 'comp'
  | 'duck'
  | 'denoise'
>;

/** The default EQ with some bands changed. */
function eqWith(changes: Record<number, Partial<EqBand>>): MixerChannel['eq'] {
  const eq = eqDefaults();
  eq.bands = eq.bands.map((b, i) => ({ ...b, ...changes[i] }));
  return eq;
}

const FLAT: Processing = {
  gate: { ...GATE_DEFAULTS },
  hpf: false,
  hpfHz: 80,
  hpfSlope: 12,
  lpf: false,
  lpfHz: 16_000,
  lpfSlope: 12,
  eq: eqDefaults(),
  comp: { ...COMP_DEFAULTS },
  duck: { ...DUCK_DEFAULTS },
  denoise: false,
};

/**
 * What each preset sets. Speech: rumble off, a little presence, an even level (3:1), a gentle
 * gate. Singing: less low cut, air on top, a softer and slower compressor. Instrument: just
 * rumble off and peaks held. Music (tracks, video): ducks under voices. Flat: nothing.
 */
export const PRESETS: Record<MixerPreset, Processing> = {
  speech: {
    ...FLAT,
    gate: { on: true, thresholdDb: -55 },
    hpf: true,
    hpfHz: 100,
    hpfSlope: 24,
    eq: eqWith({ 0: { hz: 200, db: -2 }, 3: { hz: 3000, db: 2 }, 5: { hz: 8000, db: 2 } }),
    comp: { on: true, thresholdDb: -20, ratio: 3, makeupDb: 4, attackMs: 5, releaseMs: 120 },
  },
  singing: {
    ...FLAT,
    hpf: true,
    hpfHz: 80,
    eq: eqWith({ 1: { hz: 400, db: -2, q: 1.2 }, 5: { hz: 10_000, db: 3 } }),
    comp: { on: true, thresholdDb: -18, ratio: 2.5, makeupDb: 3, attackMs: 10, releaseMs: 200 },
  },
  instrument: {
    ...FLAT,
    hpf: true,
    hpfHz: 40,
    comp: { on: true, thresholdDb: -10, ratio: 4, makeupDb: 0, attackMs: 3, releaseMs: 150 },
  },
  music: { ...FLAT, duck: { on: true, amountDb: 12, thresholdDb: -40 } },
  flat: FLAT,
};

/** Commands for the mixer (`live.mixer`). */
export const MixerActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('channel'),
    id: IdSchema,
    patch: ChannelPatchSchema,
  }),
  z.object({
    action: z.literal('bus'),
    bus: z.enum(['room', 'stream']),
    patch: BusPatchSchema,
  }),
  z.object({
    action: z.literal('add'),
    deviceId: z.string().max(300),
    name: z.string().max(40),
    room: z.boolean().optional(),
    stream: z.boolean().optional(),
  }),
  z.object({ action: z.literal('remove'), id: IdSchema }),
  z.object({ action: z.literal('move'), id: IdSchema, to: z.number().int().min(0).max(23) }),
  z.object({ action: z.literal('preset'), id: IdSchema, preset: z.enum(PRESET_IDS) }),
  z.object({ action: z.literal('soloClear') }),
  z.object({ action: z.literal('reset') }),
]);
export type MixerAction = z.infer<typeof MixerActionSchema>;

type EqPatch = NonNullable<z.infer<typeof ChannelPatchSchema>['eq']>;

/** An EQ with some of its settings changed (each band only in the fields given). */
function patchEq(eq: MixerChannel['eq'], p: EqPatch | undefined): MixerChannel['eq'] {
  if (!p) return eq;
  const bands = p.bands;
  return {
    on: p.on ?? eq.on,
    bands: bands
      ? eq.bands.map((b, i) => ({ ...b, ...bands[String(i) as keyof typeof bands] }))
      : eq.bands,
  };
}

type ChannelPatch = Extract<MixerAction, { action: 'channel' }>['patch'];

/**
 * A channel's EQ back to flat, as a new channel starts: every band at its default place and
 * 0 dB, the low and high cuts off at their default frequencies. The EQ switch stays as it is.
 */
export function eqResetPatch(): ChannelPatch {
  const bands = Object.fromEntries(EQ_DEFAULT_BANDS.map((b, i) => [String(i), { ...b }]));
  return {
    hpf: FLAT.hpf,
    hpfHz: FLAT.hpfHz,
    hpfSlope: FLAT.hpfSlope,
    lpf: FLAT.lpf,
    lpfHz: FLAT.lpfHz,
    lpfSlope: FLAT.lpfSlope,
    eq: { bands },
  };
}

/** A channel's gate, compressor and ducking back as a new channel starts (all off). */
export function dynamicsResetPatch(): ChannelPatch {
  return { gate: { ...FLAT.gate }, comp: { ...FLAT.comp }, duck: { ...FLAT.duck } };
}

/** Apply one mixer command (pure). */
export function applyMixerAction(m: Mixer, a: MixerAction): Mixer {
  switch (a.action) {
    case 'channel':
      return {
        ...m,
        channels: m.channels.map((c) =>
          c.id !== a.id
            ? c
            : c.locked && a.patch.locked !== false
              ? c
              : MixerChannelSchema.parse({
                  ...c,
                  ...a.patch,
                  gate: { ...c.gate, ...a.patch.gate },
                  eq: patchEq(c.eq, a.patch.eq),
                  comp: { ...c.comp, ...a.patch.comp },
                  duck: { ...c.duck, ...a.patch.duck },
                }),
        ),
      };
    case 'bus':
      return { ...m, [a.bus]: MixerBusSchema.parse({ ...m[a.bus], ...a.patch }) };
    case 'add': {
      if (m.channels.length >= 24) return m;
      let id = inputChannel(a.deviceId, a.name).id;
      for (let n = 2; m.channels.some((c) => c.id === id); n++) id = `${id.slice(0, 58)}-${n}`;
      const c = inputChannel(a.deviceId, a.name, id);
      if (a.room !== undefined) c.room = a.room;
      if (a.stream !== undefined) c.stream = a.stream;
      return { ...m, channels: [...m.channels, c] };
    }
    case 'remove':
      return {
        ...m,
        channels: m.channels.filter((c) => c.id !== a.id || c.kind !== 'input'),
      };
    case 'move': {
      const from = m.channels.findIndex((c) => c.id === a.id);
      if (from < 0) return m;
      const channels = [...m.channels];
      const [c] = channels.splice(from, 1);
      if (c) channels.splice(Math.min(a.to, channels.length), 0, c);
      return { ...m, channels };
    }
    case 'preset':
      return {
        ...m,
        channels: m.channels.map((c) =>
          c.id === a.id && !c.locked
            ? MixerChannelSchema.parse({ ...c, ...structuredClone(PRESETS[a.preset]) })
            : c,
        ),
      };
    case 'soloClear':
      return { ...m, channels: m.channels.map((c) => (c.solo ? { ...c, solo: false } : c)) };
    case 'reset': {
      // Back to flat: every level, EQ and dynamics setting; inputs and routing are kept.
      const flat = MixerChannelSchema.parse({ id: 'x', kind: 'input', name: 'x' });
      return {
        channels: m.channels.map((c) => ({
          ...c,
          gainDb: flat.gainDb,
          mute: false,
          solo: false,
          pan: 0,
          trimDb: 0,
          invert: false,
          delayMs: 0,
          denoise: false,
          gate: flat.gate,
          hpf: false,
          hpfHz: flat.hpfHz,
          hpfSlope: flat.hpfSlope,
          lpf: false,
          lpfHz: flat.lpfHz,
          lpfSlope: flat.lpfSlope,
          eq: eqDefaults(),
          comp: flat.comp,
          duck: flat.duck,
          locked: false,
        })),
        room: MixerBusSchema.parse({}),
        stream: MixerBusSchema.parse({}),
      };
    }
  }
}

/**
 * How loud a channel is sent to a bus (0 = not at all): its fader and mute, the bus routing,
 * and for the headphone "cue" bus whether it's soloed.
 */
export function sendGain(c: MixerChannel, bus: MixerBusId | 'cue'): number {
  if (bus === 'cue') return c.solo ? dbToGain(c.gainDb) : 0;
  if (c.mute || !c[bus]) return 0;
  return dbToGain(c.gainDb);
}

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
const EqBand = z.number().min(-15).max(15);

/**
 * One mixer channel: the Audio tab's tracks, the sound of videos, or a live input (a microphone,
 * the desk's feed, a capture card's audio). Its strip runs, in order: high-pass, 3-band EQ,
 * compressor, fader, pan; then it is sent to the room, the stream, or both.
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
  /** Cut the rumble below 80 Hz (handling noise, stage thumps). */
  hpf: z.boolean().default(false),
  eq: z
    .object({ low: EqBand.default(0), mid: EqBand.default(0), high: EqBand.default(0) })
    .default({ low: 0, mid: 0, high: 0 }),
  comp: z
    .object({
      on: z.boolean().default(false),
      thresholdDb: z.number().min(-60).max(0).default(-18),
      ratio: z.number().min(1).max(20).default(3),
      makeupDb: z.number().min(0).max(24).default(0),
    })
    .default({ on: false, thresholdDb: -18, ratio: 3, makeupDb: 0 }),
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
  /** Stops the mix going over −1 dBFS (no harsh clipping when a mic is shouted into). */
  limiter: z.boolean().default(true),
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

/** A new input channel for a device (on in the room, off on the stream until chosen). */
export function inputChannel(deviceId: string, name: string, id = `in-${deviceId.slice(0, 40)}`) {
  return channel({
    id,
    kind: 'input',
    deviceId,
    name: name.slice(0, 40) || 'Input',
    stream: false,
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
    hpf: z.boolean(),
    eq: z.object({ low: EqBand, mid: EqBand, high: EqBand }).partial(),
    comp: z
      .object({
        on: z.boolean(),
        thresholdDb: z.number().min(-60).max(0),
        ratio: z.number().min(1).max(20),
        makeupDb: z.number().min(0).max(24),
      })
      .partial(),
    room: z.boolean(),
    stream: z.boolean(),
  })
  .partial();
const BusPatchSchema = z
  .object({
    gainDb: Db,
    mute: z.boolean(),
    limiter: z.boolean(),
    delayMs: z.number().int().min(0).max(1000),
  })
  .partial();

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
  z.object({ action: z.literal('soloClear') }),
  z.object({ action: z.literal('reset') }),
]);
export type MixerAction = z.infer<typeof MixerActionSchema>;

/** Apply one mixer command (pure). */
export function applyMixerAction(m: Mixer, a: MixerAction): Mixer {
  switch (a.action) {
    case 'channel':
      return {
        ...m,
        channels: m.channels.map((c) =>
          c.id === a.id
            ? MixerChannelSchema.parse({
                ...c,
                ...a.patch,
                eq: { ...c.eq, ...a.patch.eq },
                comp: { ...c.comp, ...a.patch.comp },
              })
            : c,
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
          hpf: false,
          eq: flat.eq,
          comp: flat.comp,
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

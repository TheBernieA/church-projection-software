import { z } from 'zod';
import { IdSchema } from './common';

/**
 * Control surfaces: a sound desk, a MIDI controller or an OSC app driving Lampstand (its show
 * keys, cameras, T-bar and mixer), and Lampstand telling the desk what's happening (a video
 * starts: mute the pulpit mic). Works with any desk that speaks MIDI or OSC: nothing here is
 * specific to one make, the operator teaches it each control ("learn").
 */

/** Show actions a button can run (the same ones as the keyboard shortcuts). */
export const SURFACE_ACTIONS = [
  'goLive',
  'next',
  'previous',
  'clearContent',
  'clearMedia',
  'clearBackground',
  'clearOverlays',
  'clearAll',
  'black',
  'logo',
  'freeze',
  'panic',
  'switcherCut',
  'switcherAuto',
  'mediaToggle',
] as const;
export type SurfaceAction = (typeof SURFACE_ACTIONS)[number];

export const MIDI_TYPES = ['cc', 'note', 'pc', 'pitch'] as const;
export type MidiType = (typeof MIDI_TYPES)[number];

const Channel = z.number().int().min(1).max(16);
const Byte = z.number().int().min(0).max(127);

/** Where a control's messages come from. */
export const SurfaceSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('midi'),
    /** The MIDI port's name ('' for any port). */
    device: z.string().max(200).default(''),
    type: z.enum(MIDI_TYPES),
    channel: Channel,
    /** Controller or note number (0 for pitch bend). */
    number: Byte,
  }),
  z.object({
    kind: z.literal('osc'),
    address: z.string().min(1).max(200).startsWith('/'),
  }),
]);
export type SurfaceSource = z.infer<typeof SurfaceSourceSchema>;

/** Which mixer fader or mute: a channel, or the room or stream master. */
export const MixerTargetSchema = z.object({
  bus: z.enum(['channel', 'room', 'stream']),
  /** For `channel`: which (its mixer id). */
  channelId: z.string().max(64).optional(),
});
export type MixerTarget = z.infer<typeof MixerTargetSchema>;

/** What a control does in Lampstand. */
export const SurfaceTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('action'), action: z.enum(SURFACE_ACTIONS) }),
  /** Camera n (1–9, as in Media › Video input): to Preview, or straight on screen. */
  z.object({
    kind: z.literal('camera'),
    n: z.number().int().min(1).max(9),
    take: z.boolean().default(false),
  }),
  z.object({ kind: z.literal('fader'), ...MixerTargetSchema.shape }),
  z.object({ kind: z.literal('mute'), ...MixerTargetSchema.shape }),
  z.object({ kind: z.literal('tbar') }),
]);
export type SurfaceTarget = z.infer<typeof SurfaceTargetSchema>;

export const SurfaceBindingSchema = z.object({
  id: IdSchema,
  source: SurfaceSourceSchema,
  target: SurfaceTargetSchema,
});
export type SurfaceBinding = z.infer<typeof SurfaceBindingSchema>;

/** Moments Lampstand can tell the desk about. */
export const DESK_EVENTS = [
  'videoPlay',
  'videoStop',
  'cameraOn',
  'cameraOff',
  'streamLive',
  'streamEnd',
  'black',
  'clearAll',
] as const;
export type DeskEvent = (typeof DESK_EVENTS)[number];

/** An OSC argument: an integer, a float, a string, or none. */
export const OscArgSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('i'), value: z.number().int() }),
  z.object({ type: z.literal('f'), value: z.number() }),
  z.object({ type: z.literal('s'), value: z.string().max(200) }),
]);
export type OscArg = z.infer<typeof OscArgSchema>;

/** A message to the desk. */
export const DeskMessageSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('midi'),
    /** Output port name ('' for every port). */
    device: z.string().max(200).default(''),
    type: z.enum(['cc', 'note', 'pc']),
    channel: Channel,
    number: Byte,
    value: Byte.default(127),
  }),
  z.object({
    kind: z.literal('osc'),
    address: z.string().min(1).max(200).startsWith('/'),
    arg: OscArgSchema.default({ type: 'none' }),
  }),
]);
export type DeskMessage = z.infer<typeof DeskMessageSchema>;

export const DeskCueSchema = z.object({
  id: IdSchema,
  when: z.enum(DESK_EVENTS),
  send: DeskMessageSchema,
});
export type DeskCue = z.infer<typeof DeskCueSchema>;

export const SurfacesSettingsSchema = z.object({
  /** Listen to MIDI ports. */
  midi: z.boolean().default(true),
  /** Send fader and mute positions back (motor faders and button lights follow Lampstand). */
  feedback: z.boolean().default(true),
  osc: z
    .object({
      /** Listen for OSC on this computer. */
      enabled: z.boolean().default(false),
      port: z.number().int().min(1024).max(65535).default(9000),
      /** Where OSC replies and desk cues go ('' to send nothing). */
      sendHost: z.string().max(200).default(''),
      sendPort: z.number().int().min(1).max(65535).default(10023),
    })
    .default({ enabled: false, port: 9000, sendHost: '', sendPort: 10023 }),
  bindings: z.array(SurfaceBindingSchema).max(200).default([]),
  cues: z.array(DeskCueSchema).max(100).default([]),
});
export type SurfacesSettings = z.infer<typeof SurfacesSettingsSchema>;

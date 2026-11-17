import { z } from 'zod';
import { IdSchema } from './common';

/** A place the stream goes. Its key is stored encrypted on this computer, never here. */
export const StreamDestinationSchema = z.object({
  id: IdSchema,
  /**
   * 'direct' is a direct link to a receiver you run (OBS, vMix, VLC, a decoder box): SRT or
   * MPEG-TS over UDP, with well under a second of delay and no service in between.
   */
  kind: z.enum(['youtube', 'facebook', 'custom', 'direct']),
  name: z.string().min(1).max(60),
  /**
   * Custom destinations: the RTMP(S) ingest address (the key is added after it). Direct links:
   * the receiver's address (srt://host:port or udp://host:port).
   */
  url: z.string().max(500).default(''),
  enabled: z.boolean().default(true),
});
export type StreamDestination = z.infer<typeof StreamDestinationSchema>;

/** Livestream and recording settings (Settings › Streaming). */
export const StreamSettingsSchema = z.object({
  destinations: z.array(StreamDestinationSchema).max(8).default([]),
  quality: z
    .object({
      height: z.union([z.literal(540), z.literal(720), z.literal(1080)]).default(720),
      fps: z.union([z.literal(30), z.literal(60)]).default(30),
      videoKbps: z.number().int().min(800).max(20_000).default(3500),
      audioKbps: z.union([z.literal(128), z.literal(160), z.literal(192)]).default(160),
      /** 'auto' picks the best hardware encoder this computer has. */
      encoder: z.string().max(40).default('auto'),
    })
    .default({ height: 720, fps: 30, videoKbps: 3500, audioKbps: 160, encoder: 'auto' }),
  picture: z
    .object({
      /** A camera behind everything (the preacher, the band); null: none. */
      camera: z.string().max(300).nullable().default(null),
      /** The words: full screen as the theme draws them, a lower third, or not at all. */
      words: z.enum(['full', 'lowerThird', 'none']).default('lowerThird'),
      /** Behind the words: what the projector shows, the camera, or black. */
      background: z.enum(['program', 'camera', 'black']).default('program'),
    })
    .default({ camera: null, words: 'lowerThird', background: 'program' }),
  sound: z
    .object({
      /** Tracks from the Audio tab and the sound of videos. */
      room: z.boolean().default(true),
      roomGain: z.number().min(0).max(2).default(1),
      mics: z
        .array(
          z.object({ deviceId: z.string().max(300), gain: z.number().min(0).max(2).default(1) }),
        )
        .max(8)
        .default([]),
    })
    .default({ room: true, roomGain: 1, mics: [] }),
  /**
   * How hard the stream works the computer. Auto picks Light, Balanced or Quality for this
   * computer (or from "Check this computer"); Custom uses the Quality values as set.
   */
  performance: z.enum(['auto', 'light', 'balanced', 'quality', 'custom']).default('auto'),
  /** The last "Check this computer" result: the best mode it managed, and when. */
  benchmark: z
    .object({
      at: z.string().max(40),
      mode: z.enum(['light', 'balanced', 'quality']),
      encoder: z.string().max(40),
    })
    .nullable()
    .default(null),
  recording: z
    .object({
      /** Where recordings go (null: Movies/Videos › Lampstand). */
      folder: z.string().max(1000).nullable().default(null),
      recordWhileStreaming: z.boolean().default(true),
    })
    .default({ folder: null, recordWhileStreaming: true }),
});
export type StreamSettings = z.infer<typeof StreamSettingsSchema>;

/** Recommended video bitrate for a size and frame rate, in kb/s (YouTube's guidance, rounded). */
export const recommendedKbps = (height: number, fps: number): number =>
  height >= 1080 ? (fps > 30 ? 9000 : 6000) : fps > 30 ? 5000 : 3500;

/**
 * An NDI feed: Lampstand as a source other software sees on the network (vMix, OBS, a
 * streaming PC, NDI Studio Monitor). Each feed is its own picture: the program as the
 * projector shows it, the words alone over transparency (to key over cameras), or the stream
 * picture.
 */
export const NdiFeedSchema = z.object({
  id: IdSchema,
  /** The source name receivers see ("Lampstand (Program)"). */
  name: z.string().min(1).max(60),
  content: z.enum(['program', 'words', 'stream']).default('program'),
  height: z.union([z.literal(720), z.literal(1080)]).default(1080),
  fps: z.union([z.literal(30), z.literal(60)]).default(30),
  /** Send the stream mix's sound with it. */
  sound: z.boolean().default(true),
  enabled: z.boolean().default(true),
});
export type NdiFeed = z.infer<typeof NdiFeedSchema>;

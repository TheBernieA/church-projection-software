import { z } from 'zod';
import { IdSchema } from './common';

/**
 * The H.264 encoders Lampstand drives through ffmpeg, best first (each platform has its own
 * hardware one; libx264 always works). Settings › Streaming offers these, plus 'auto'.
 */
export const STREAM_ENCODERS = [
  'h264_videotoolbox',
  'h264_nvenc',
  'h264_qsv',
  'h264_amf',
  'libx264',
] as const;
export type StreamEncoderId = (typeof STREAM_ENCODERS)[number];

/** Short names for the console's readout (webcodecs: the GPU pipeline's hardware encoder). */
export const ENCODER_SHORT_NAMES: Record<StreamEncoderId | 'webcodecs', string> = {
  h264_videotoolbox: 'VideoToolbox',
  h264_nvenc: 'NVENC',
  h264_qsv: 'Quick Sync',
  h264_amf: 'AMF',
  libx264: 'x264',
  webcodecs: 'GPU · hardware encoder',
};

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
      /**
       * Behind the words: what the projector shows, a camera, the video switcher's program (the
       * camera cut to there, with its transitions and picture-in-picture), two cameras laid out
       * together, or black.
       */
      background: z.enum(['program', 'camera', 'switcher', 'layout', 'black']).default('program'),
      /** Two cameras together (`background: 'layout'`): side by side, or the second in a corner. */
      layout: z.enum(['sideBySide', 'pip']).default('sideBySide'),
      /** The layout's second camera (the first is `camera`). */
      secondCamera: z.string().max(300).nullable().default(null),
      /**
       * Show what one of the screens shows instead of making the stream's own picture: the
       * alternate (HDMI) output with its themes, or the stage display. 'own': the stream's own.
       */
      mirror: z.enum(['own', 'alternate', 'stage']).default('own'),
      /** Lower third: size the words to fit the band by themselves (long verses shrink). */
      wordsAuto: z.boolean().default(true),
      /** Lower third, when not automatic: the words' size, as % of their full-screen size. */
      wordsSize: z.number().int().min(25).max(100).default(60),
      /** Where the words sit across the picture: lower third only (full-screen words stay as
       *  their theme has them). */
      wordsAlign: z.enum(['left', 'center', 'right']).default('center').catch('center'),
      /** Lower third only: along the bottom of the picture, or the top. */
      wordsEdge: z.enum(['bottom', 'top']).default('bottom').catch('bottom'),
      /**
       * Lower third only: how wide the words may spread, as % of the picture's width. Wider
       * means fewer, longer lines (a long verse isn't squeezed into a narrow column).
       */
      wordsWidth: z.number().int().min(30).max(100).default(80).catch(80),
      /**
       * Lower third: the theme the words are drawn with (one made for lower thirds); null: each
       * slide's own theme, made smaller.
       */
      wordsTheme: z.string().max(64).nullable().default(null),
      /** How long a change of scene or camera takes to fade (ms); 0 cuts. */
      fadeMs: z.number().int().min(0).max(3000).default(500).catch(500),
    })
    .default({
      camera: null,
      words: 'lowerThird',
      background: 'program',
      layout: 'sideBySide',
      secondCamera: null,
      mirror: 'own',
      wordsAuto: true,
      wordsSize: 60,
      wordsAlign: 'center',
      wordsEdge: 'bottom',
      wordsWidth: 80,
      wordsTheme: null,
      fadeMs: 500,
    }),
  /**
   * What the stream shows while it's covered (the console's Cover button: something that
   * mustn't go out on the stream is happening): the logo card, or a picture or video.
   */
  cover: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('logo') }),
      z.object({ kind: z.enum(['image', 'video']), mediaId: IdSchema }),
    ])
    .default({ kind: 'logo' }),
  /**
   * Legacy: the stream's sound before the Mixer. Read once to build the mixer for older settings
   * (mixerFromSettings); the Mixer's stream bus is what the stream hears now.
   */
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

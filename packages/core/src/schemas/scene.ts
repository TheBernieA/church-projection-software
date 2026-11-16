import { z } from 'zod';
import {
  BackgroundAdjustSchema,
  BackgroundRefSchema,
  ThemeSchema,
  TransitionSpecSchema,
} from './theme';
import { ColorSchema, IdSchema } from './common';

/**
 * Rich text spans. Bible markup (`<wj>`, `<add>`, `<nd>`) is parsed into spans by our own
 * parser — never injected as HTML (§17.1).
 */
export const SpanSchema = z.object({
  text: z.string().max(5000),
  style: z.enum(['wj', 'add', 'nd', 'verse-number', 'emphasis']).optional(),
});
export type Span = z.infer<typeof SpanSchema>;

export const TextBlockSchema = z.object({
  spans: z.array(SpanSchema).max(400),
  dir: z.enum(['ltr', 'rtl']).optional(),
  lang: z.string().max(35).optional(),
  /** Optional label shown above the block (e.g. version abbreviation in multi-version). */
  label: z.string().max(40).optional(),
  /** `secondary`: a quieter line under the main text (e.g. a song's translation). */
  role: z.enum(['secondary']).optional(),
});
export type TextBlock = z.infer<typeof TextBlockSchema>;

const StrokeSchema = z.object({ width: z.number().min(0).max(100), color: ColorSchema });

/** Position and size on the 1920×1080 canvas, plus opacity. Shared by every slide object. */
const objectBox = {
  id: IdSchema,
  x: z.number().min(-4000).max(6000),
  y: z.number().min(-4000).max(6000),
  w: z.number().min(1).max(6000),
  h: z.number().min(1).max(6000),
  opacity: z.number().min(0).max(1).optional(),
};

/**
 * Something placed freely on a text slide (canvas editor): a text box, a shape, a line or a
 * library picture. Drawn in array order, under the slide's title and body text.
 */
export const SlideObjectSchema = z.discriminatedUnion('kind', [
  z.object({
    ...objectBox,
    kind: z.literal('text'),
    text: z.string().max(2000),
    fontFamily: z.string().max(200).optional(),
    fontSize: z.number().min(8).max(400),
    color: ColorSchema,
    align: z.enum(['left', 'center', 'right']),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
  }),
  z.object({
    ...objectBox,
    kind: z.literal('rect'),
    fill: ColorSchema.optional(),
    stroke: StrokeSchema.optional(),
    radius: z.number().min(0).max(3000).optional(),
  }),
  z.object({
    ...objectBox,
    kind: z.literal('ellipse'),
    fill: ColorSchema.optional(),
    stroke: StrokeSchema.optional(),
  }),
  /** A horizontal line `w` long; its thickness is the stroke width. */
  z.object({ ...objectBox, kind: z.literal('line'), stroke: StrokeSchema }),
  z.object({
    ...objectBox,
    kind: z.literal('image'),
    mediaId: IdSchema,
    fit: z.enum(['contain', 'cover']).default('contain'),
  }),
]);
export type SlideObject = z.infer<typeof SlideObjectSchema>;

/** Content layer: one projected slide (scripture, lyrics, text). */
export const ContentLayerSchema = z.object({
  /** Stable key for the slide — used for transitions and "is this live?" checks. */
  key: z.string().max(200),
  kind: z.enum(['scripture', 'lyrics', 'text', 'countdown']),
  theme: ThemeSchema,
  blocks: z.array(TextBlockSchema).max(20),
  reference: z.string().max(300).optional(),
  copyright: z.string().max(500).optional(),
  /** Stage-only metadata. */
  label: z.string().max(80).optional(),
  notes: z.string().max(4000).optional(),
  /** Freely placed text boxes, shapes, lines and pictures (text slides). */
  objects: z.array(SlideObjectSchema).max(30).optional(),
  /** Chord chart lines (`[G]Amazing grace`), stage only; the room never sees them. */
  chords: z.array(z.string().max(500)).max(24).optional(),
  /** Countdown target (ISO timestamp) for `kind: 'countdown'`. */
  countdownTo: z.string().max(40).optional(),
});
export type ContentLayer = z.infer<typeof ContentLayerSchema>;

export const BackgroundLayerSchema = z.object({
  ref: BackgroundRefSchema,
  adjust: BackgroundAdjustSchema.optional(),
});
export type BackgroundLayer = z.infer<typeof BackgroundLayerSchema>;

/** Trim and fades for a clip: shared by a playlist cue's playback options and the live layer. */
export const MediaTrimSchema = z.object({
  /** In-point (s): playback starts here and loops back here. */
  start: z.number().min(0).max(86_400).optional(),
  /** Out-point (s): playback stops (or loops, or moves on) here instead of the file's end. */
  end: z.number().min(0).max(86_400).optional(),
  /** Fade up from black/silence over this many seconds after the in-point. */
  fadeIn: z.number().min(0).max(30).optional(),
  /** Fade down to black/silence over this many seconds before the out-point. */
  fadeOut: z.number().min(0).max(30).optional(),
});
export type MediaTrim = z.infer<typeof MediaTrimSchema>;

export const MediaLayerSchema = z
  .object({
    mediaId: IdSchema,
    kind: z.enum(['image', 'video']),
    loop: z.boolean(),
    muted: z.boolean().default(false),
    fit: z.enum(['contain', 'cover']).default('contain'),
    /**
     * Playback, shared by every output so they stay in sync: the video is at `position` seconds at
     * time `syncedAt`, and advances from there while `playing`.
     */
    playing: z.boolean().default(true),
    position: z.number().min(0).max(86_400).default(0),
    syncedAt: z.string().max(40).optional(),
    volume: z.number().min(0).max(1).default(1),
  })
  .extend(MediaTrimSchema.shape);
export type MediaLayer = z.infer<typeof MediaLayerSchema>;

/** Where a prop sits on screen. */
export const PropPositionSchema = z.enum([
  'full',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'lower-third',
]);
export type PropPosition = z.infer<typeof PropPositionSchema>;

/**
 * Things drawn over everything else. Messages (ticker, lower third) and props (logo bug, prop:
 * a library image/video or text in a preset position) clear as separate groups.
 */
export const OverlaySchema = z.object({
  id: IdSchema,
  kind: z.enum(['ticker', 'lower-third', 'logo-bug', 'prop']),
  text: z.string().max(500),
  subtext: z.string().max(200).optional(),
  /** Prop picture from the media library (kind: 'prop'). */
  mediaId: IdSchema.optional(),
  mediaKind: z.enum(['image', 'video']).optional(),
  position: PropPositionSchema.optional(),
});
export type Overlay = z.infer<typeof OverlaySchema>;

export const MasksSchema = z.object({ black: z.boolean(), logo: z.boolean(), freeze: z.boolean() });
export type Masks = z.infer<typeof MasksSchema>;

/** A full description of what an output shows. Pure data — rendered by @lampstand/renderer. */
/** Only secure web addresses, without credentials, may be shown. */
export const WebUrlSchema = z
  .string()
  .max(2000)
  .refine((u) => {
    try {
      const url = new URL(u);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Use a secure https:// web address');

/**
 * A live web page. Outputs show it in an isolated web view owned by the main process; the
 * scene only carries which page, never the page itself.
 */
export const WebLayerSchema = z.object({ key: z.string().max(200), url: WebUrlSchema });
export type WebLayer = z.infer<typeof WebLayerSchema>;

/**
 * A live camera or capture card (any video device the computer sees). Each output opens the
 * device itself; the scene only says which one.
 */
export const VideoInputLayerSchema = z.object({
  deviceId: z.string().max(300),
  label: z.string().max(200),
  fit: z.enum(['contain', 'cover']).default('cover'),
  /** Flip left-to-right (a camera facing the presenter, used as a mirror). */
  mirror: z.boolean().default(false),
  /** Capture size asked of the device; 'auto' takes what it offers. */
  resolution: z.enum(['auto', '720', '1080', '2160']).default('auto'),
});
export type VideoInputLayer = z.infer<typeof VideoInputLayerSchema>;

/** How one camera goes on screen (Settings › Video), the same in every window and the stream. */
export const CameraSettingsSchema = z.object({
  /** Shown instead of the device's own name ('' = the device's name). */
  name: z.string().max(200).default(''),
  fit: z.enum(['cover', 'contain']).default('cover'),
  mirror: z.boolean().default(false),
  resolution: z.enum(['auto', '720', '1080', '2160']).default('auto'),
  /** Left out of Media › Video input (e.g. a virtual camera nobody uses). */
  hidden: z.boolean().default(false),
});
export type CameraSettings = z.infer<typeof CameraSettingsSchema>;

/** How the switcher changes from one camera to the next. */
export const InputTransitionSchema = z.object({
  /** cut: at once; fade: cross-fade; dip: through black; wipe: left to right. */
  kind: z.enum(['cut', 'fade', 'dip', 'wipe']).default('fade'),
  durationMs: z.number().int().min(0).max(5000).default(600),
});
export type InputTransition = z.infer<typeof InputTransitionSchema>;

/** A second camera in a box over the picture (picture-in-picture). */
export const PipLayerSchema = VideoInputLayerSchema.extend({
  corner: z.enum(['tl', 'tr', 'bl', 'br']).default('br'),
  /** Width as a share of the screen (0.15–0.5). */
  size: z.number().min(0.15).max(0.5).default(0.3),
});
export type PipLayer = z.infer<typeof PipLayerSchema>;

export const SceneSchema = z.object({
  background: BackgroundLayerSchema.nullable(),
  media: MediaLayerSchema.nullable(),
  content: ContentLayerSchema.nullable(),
  /** A web page on screen (replaces text and media while it shows). */
  web: WebLayerSchema.nullable().optional(),
  /** A live camera feed, full screen in the media layer (slide text stays on top). */
  input: VideoInputLayerSchema.nullable().optional(),
  /** How the last camera change happened (the renderer plays it when the camera changes). */
  inputTransition: InputTransitionSchema.optional(),
  /** The T-bar part-way: this camera shows over `input` at `pos` (0…1). */
  inputNext: z
    .object({ input: VideoInputLayerSchema, pos: z.number().min(0).max(1) })
    .nullable()
    .optional(),
  /** Picture-in-picture: a second camera in a corner, over the camera and media. */
  pip: PipLayerSchema.nullable().optional(),
  /** Announcements layer: looping announcement slides above the slide, below messages and props. */
  announcement: ContentLayerSchema.nullable().optional(),
  overlays: z.array(OverlaySchema).max(10),
  masks: MasksSchema,
  /** Transition to use when this scene's content changes. */
  transition: TransitionSpecSchema.optional(),
});
export type Scene = z.infer<typeof SceneSchema>;

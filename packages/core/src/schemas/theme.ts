import { z } from 'zod';
import { ColorSchema, EntityMetaSchema, IdSchema } from './common';

export const TextStyleSchema = z.object({
  fontFamily: z.string().min(1).max(200),
  fontWeight: z.number().int().min(100).max(900),
  fontSize: z.number().min(8).max(400),
  lineHeight: z.number().min(0.8).max(3),
  letterSpacing: z.number().min(-10).max(50),
  color: ColorSchema,
  align: z.enum(['left', 'center', 'right', 'justify']),
  italic: z.boolean().optional(),
  shadow: z
    .object({ x: z.number(), y: z.number(), blur: z.number().min(0), color: ColorSchema })
    .optional(),
  outline: z.object({ width: z.number().min(0).max(20), color: ColorSchema }).optional(),
  /** Soft halo around the letters. */
  glow: z.object({ blur: z.number().min(0).max(80), color: ColorSchema }).optional(),
  backgroundBox: z
    .object({ color: ColorSchema, padding: z.number().min(0), radius: z.number().min(0) })
    .optional(),
  textTransform: z.enum(['none', 'uppercase']).optional(),
  underline: z.boolean().optional(),
  strike: z.boolean().optional(),
  /** Line returns become spaces: one flowing paragraph (a lower third, a ticker). */
  joinLines: z.boolean().optional(),
  /** "Lines only": a bar behind each line of words instead of a box behind them all. */
  lineBackground: z.object({ color: ColorSchema, padding: z.number().min(0).max(80) }).optional(),
  /** Each line a list item, with a bullet or a number. */
  list: z.enum(['bullet', 'number']).optional(),
  /** The words scroll across the screen (a ticker), this many canvas pixels a second. */
  scroll: z.object({ speed: z.number().min(10).max(1000) }).optional(),
  /** The words come from a live source (the time, the date) instead of the slide. */
  linked: z.enum(['time', 'date']).optional(),
});
export type TextStyle = z.infer<typeof TextStyleSchema>;

/**
 * Per-item text formatting from the toolbar's Text bar, applied on top of the item's theme.
 * Every field is optional: unset means "as the theme has it".
 */
export const TextFormatSchema = z.object({
  fontFamily: z.string().min(1).max(200).optional(),
  /** Largest size; auto-fit can still shrink long slides. */
  fontSize: z.number().min(8).max(400).optional(),
  color: ColorSchema.optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  /** Capitalization: every letter a capital. */
  uppercase: z.boolean().optional(),
  /** Where the words sit up and down (centre-, top- and lower-third themes). */
  valign: z.enum(['top', 'middle', 'bottom']).optional(),
  /** A stroke around the letters; null: none (even if the theme has one). */
  stroke: z
    .object({ width: z.number().min(0).max(20), color: ColorSchema })
    .nullable()
    .optional(),
  /** A shadow behind the letters; null: none (even if the theme has one). */
  shadow: z
    .object({ x: z.number(), y: z.number(), blur: z.number().min(0).max(80), color: ColorSchema })
    .nullable()
    .optional(),
  underline: z.boolean().optional(),
  strike: z.boolean().optional(),
  /** Scaling: shrink long slides to fit (true) or keep the size (false). */
  autoFit: z.boolean().optional(),
  joinLines: z.boolean().optional(),
  /** Lines only; null: off (even if the theme has it). */
  lineBackground: z
    .object({ color: ColorSchema, padding: z.number().min(0).max(80) })
    .nullable()
    .optional(),
  /** null: no list (even if the theme has one). */
  list: z.enum(['bullet', 'number']).nullable().optional(),
  /** null: still (even if the theme scrolls). */
  scroll: z
    .object({ speed: z.number().min(10).max(1000) })
    .nullable()
    .optional(),
  /** null: the slide's own words. */
  linked: z.enum(['time', 'date']).nullable().optional(),
  /** The text box: where the words go, as the theme's safe area (percent of each side). */
  box: z
    .object({
      top: z.number().min(0).max(45),
      right: z.number().min(0).max(45),
      bottom: z.number().min(0).max(45),
      left: z.number().min(0).max(45),
    })
    .optional(),
});
export type TextFormat = z.infer<typeof TextFormatSchema>;
/** Animated backgrounds drawn by the renderer itself (no video files, any resolution). */
export const GeneratedPresetSchema = z.enum([
  'aurora',
  'drift',
  'glow',
  'rays',
  'bokeh',
  'mesh',
  'dust',
  'waves',
  'halo',
]);
export type GeneratedPreset = z.infer<typeof GeneratedPresetSchema>;

const GradientStopSchema = z.object({ color: ColorSchema, pos: z.number().min(0).max(100) });

export const BackgroundRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('color'), color: ColorSchema }),
  z.object({
    kind: z.literal('gradient'),
    angle: z.number().min(0).max(360),
    stops: z.array(GradientStopSchema).min(2).max(8),
  }),
  z.object({ kind: z.literal('image'), mediaId: IdSchema, kenBurns: z.boolean().optional() }),
  z.object({
    kind: z.literal('video'),
    mediaId: IdSchema,
    loop: z.boolean(),
    playbackRate: z.number().min(0.25).max(2).optional(),
    /** Play the video's own sound (through the room mix and the stream); muted when unset. */
    sound: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('generated'),
    preset: GeneratedPresetSchema,
    colors: z.array(ColorSchema).min(2).max(5),
    speed: z.number().min(0.1).max(4).optional(),
  }),
]);
export type BackgroundRef = z.infer<typeof BackgroundRefSchema>;

/**
 * A readability overlay: a dark layer over the background, under the words, so they stand out on
 * a busy picture. Even all over, darker at the edges, or a band behind words at the bottom or top.
 */
export const ScrimSchema = z.object({
  style: z.enum(['even', 'edges', 'bottom', 'top']),
  /** How dark, 0–1. */
  strength: z.number().min(0).max(1),
});
export type Scrim = z.infer<typeof ScrimSchema>;

export const BackgroundAdjustSchema = z.object({
  dim: z.number().min(0).max(1).optional(),
  blur: z.number().min(0).max(40).optional(),
  /** 1 = unchanged. */
  brightness: z.number().min(0).max(2).optional(),
  contrast: z.number().min(0).max(2).optional(),
  saturate: z.number().min(0).max(2).optional(),
  /** A colour wash over the background (e.g. brand colour at 30%). */
  tint: z.object({ color: ColorSchema, opacity: z.number().min(0).max(1) }).optional(),
  scrim: ScrimSchema.optional(),
});
export type BackgroundAdjust = z.infer<typeof BackgroundAdjustSchema>;

export const TransitionSpecSchema = z.object({
  kind: z.enum(['cut', 'fade', 'dissolve', 'slide', 'zoom', 'blur']),
  durationMs: z.number().int().min(0).max(5000),
  easing: z.string().max(80),
});
export type TransitionSpec = z.infer<typeof TransitionSpecSchema>;

/** How pictures and videos (media and backgrounds) change on screen: at once, or dissolving. */
export const MediaTransitionSchema = z.object({
  kind: z.enum(['cut', 'dissolve']),
  durationMs: z.number().int().min(0).max(10000),
});
export type MediaTransition = z.infer<typeof MediaTransitionSchema>;

export const ThemeContentKindSchema = z.enum(['scripture', 'lyrics', 'text', 'lower-third']);
export type ThemeContentKind = z.infer<typeof ThemeContentKindSchema>;

export const ThemeSchema = EntityMetaSchema.extend({
  name: z.string().min(1).max(120),
  appliesTo: z.array(ThemeContentKindSchema),
  canvas: z.object({ width: z.number().int().min(320), height: z.number().int().min(240) }),
  /** Percent of canvas. */
  safeArea: z.object({
    top: z.number().min(0).max(45),
    right: z.number().min(0).max(45),
    bottom: z.number().min(0).max(45),
    left: z.number().min(0).max(45),
  }),
  text: TextStyleSchema,
  reference: TextStyleSchema,
  referencePosition: z.enum(['top', 'bottom', 'none']).default('bottom'),
  background: BackgroundRefSchema,
  backgroundAdjust: BackgroundAdjustSchema.optional(),
  layout: z.enum(['center', 'lower-third', 'top', 'split', 'custom']),
  autoFit: z.object({
    enabled: z.boolean(),
    minSize: z.number().min(8),
    maxSize: z.number().max(400),
  }),
  transition: TransitionSpecSchema,
  showVerseNumbers: z.boolean().default(true),
  redLetters: z.boolean().default(true),
  builtIn: z.boolean().optional(),
});
export type Theme = z.infer<typeof ThemeSchema>;

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
  backgroundBox: z
    .object({ color: ColorSchema, padding: z.number().min(0), radius: z.number().min(0) })
    .optional(),
  textTransform: z.enum(['none', 'uppercase']).optional(),
});
export type TextStyle = z.infer<typeof TextStyleSchema>;

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
  }),
  z.object({
    kind: z.literal('generated'),
    preset: z.enum(['aurora', 'drift', 'glow']),
    colors: z.array(ColorSchema).min(2).max(5),
    speed: z.number().min(0.1).max(4).optional(),
  }),
]);
export type BackgroundRef = z.infer<typeof BackgroundRefSchema>;

export const BackgroundAdjustSchema = z.object({
  dim: z.number().min(0).max(1).optional(),
  blur: z.number().min(0).max(40).optional(),
});

export const TransitionSpecSchema = z.object({
  kind: z.enum(['cut', 'fade', 'dissolve', 'slide', 'zoom', 'blur']),
  durationMs: z.number().int().min(0).max(5000),
  easing: z.string().max(80),
});
export type TransitionSpec = z.infer<typeof TransitionSpecSchema>;

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

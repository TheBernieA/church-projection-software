import { z } from 'zod';
import {
  BackgroundAdjustSchema,
  BackgroundRefSchema,
  ThemeSchema,
  TransitionSpecSchema,
} from './theme';
import { IdSchema } from './common';

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
});
export type TextBlock = z.infer<typeof TextBlockSchema>;

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
  /** Countdown target (ISO timestamp) for `kind: 'countdown'`. */
  countdownTo: z.string().max(40).optional(),
});
export type ContentLayer = z.infer<typeof ContentLayerSchema>;

export const BackgroundLayerSchema = z.object({
  ref: BackgroundRefSchema,
  adjust: BackgroundAdjustSchema.optional(),
});
export type BackgroundLayer = z.infer<typeof BackgroundLayerSchema>;

export const MediaLayerSchema = z.object({
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
});
export type MediaLayer = z.infer<typeof MediaLayerSchema>;

export const OverlaySchema = z.object({
  id: IdSchema,
  kind: z.enum(['ticker', 'lower-third', 'logo-bug']),
  text: z.string().max(500),
  subtext: z.string().max(200).optional(),
});
export type Overlay = z.infer<typeof OverlaySchema>;

export const MasksSchema = z.object({ black: z.boolean(), logo: z.boolean(), freeze: z.boolean() });
export type Masks = z.infer<typeof MasksSchema>;

/** A full description of what an output shows. Pure data — rendered by @lampstand/renderer. */
export const SceneSchema = z.object({
  background: BackgroundLayerSchema.nullable(),
  media: MediaLayerSchema.nullable(),
  content: ContentLayerSchema.nullable(),
  overlays: z.array(OverlaySchema).max(10),
  masks: MasksSchema,
  /** Transition to use when this scene's content changes. */
  transition: TransitionSpecSchema.optional(),
});
export type Scene = z.infer<typeof SceneSchema>;

export const EMPTY_MASKS: Masks = { black: false, logo: false, freeze: false };
export const EMPTY_SCENE: Scene = {
  background: null,
  media: null,
  content: null,
  overlays: [],
  masks: EMPTY_MASKS,
};

/** Build a scene from just the layers you care about; everything else is empty. */
export function makeScene(layers: Partial<Scene> = {}): Scene {
  return { ...EMPTY_SCENE, ...layers };
}

/** Text or media on screen — what the operator thinks of as "live". */
export function sceneHasContent(scene: Scene): boolean {
  return !!(scene.content || scene.media);
}

/** Anything at all on screen, including a background. */
export function sceneIsVisible(scene: Scene): boolean {
  return sceneHasContent(scene) || !!scene.background;
}

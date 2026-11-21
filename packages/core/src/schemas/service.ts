import { z } from 'zod';
import { EntityMetaSchema, IdSchema } from './common';
import { PassageRefSchema } from './scripture';
import { MediaTrimSchema, SlideObjectSchema, WebUrlSchema } from './scene';
import { BackgroundRefSchema, ScrimSchema, TextFormatSchema, TransitionSpecSchema } from './theme';

const TextSlideSchema = z.object({
  id: IdSchema,
  title: z.string().max(200).optional(),
  body: z.string().max(4000),
  notes: z.string().max(4000).optional(),
  /** Canvas editor: text boxes, shapes, lines and pictures placed on the slide. */
  objects: z.array(SlideObjectSchema).max(30).optional(),
});
export type TextSlide = z.infer<typeof TextSlideSchema>;

const base = { id: IdSchema, notes: z.string().max(4000).optional() };

/**
 * Backgrounds of single slides, by slide key, in place of the item's (or its theme's): one slide
 * on its own picture, the rest on the item's.
 */
/** Slides that move on by themselves while live: every `seconds`, back to the first at the end
 * when `loop`. */
export const AdvanceSchema = z.object({
  seconds: z.number().min(1).max(600),
  loop: z.boolean(),
});
export type Advance = z.infer<typeof AdvanceSchema>;

export const SlideBackgroundsSchema = z.record(z.string().max(160), BackgroundRefSchema);

export const ServiceItemSchema = z.discriminatedUnion('kind', [
  z.object({
    ...base,
    kind: z.literal('song'),
    songId: IdSchema,
    arrangementId: IdSchema.optional(),
    /**
     * Show this translation (a key of `song.translations`) under the lyrics; '' for none.
     * Unset: the song's own default translation, if it has one.
     */
    translationLang: z.string().max(35).optional(),
    /** Transpose chords on the stage display by this many semitones. */
    transpose: z.number().int().min(-11).max(11).optional(),
    themeId: IdSchema.optional(),
    textFormat: TextFormatSchema.optional(),
    /** Move to the next slide on its own every so many seconds while live (looping back or not). */
    advance: AdvanceSchema.optional(),
    /** Its own slide transition, instead of the default one (Show › the orange transition). */
    transition: TransitionSpecSchema.optional(),
    background: BackgroundRefSchema.optional(),
    /** A readability overlay over its backgrounds (under the words); else the theme's. */
    backgroundOverlay: ScrimSchema.optional(),
    slideBackgrounds: SlideBackgroundsSchema.optional(),
    /**
     * The background's layer (its tile's corner icon): behind the words (default), or a cue of
     * its own over everything, the slides then on their theme's background.
     */
    backgroundOver: z.boolean().optional(),
  }),
  z.object({
    ...base,
    kind: z.literal('scripture'),
    passage: PassageRefSchema,
    versionIds: z.array(z.string().max(32)).min(1).max(4),
    themeId: IdSchema.optional(),
    textFormat: TextFormatSchema.optional(),
    /** Move to the next slide on its own every so many seconds while live (looping back or not). */
    advance: AdvanceSchema.optional(),
    /** Its own slide transition, instead of the default one (Show › the orange transition). */
    transition: TransitionSpecSchema.optional(),
    background: BackgroundRefSchema.optional(),
    /** A readability overlay over its backgrounds (under the words); else the theme's. */
    backgroundOverlay: ScrimSchema.optional(),
    slideBackgrounds: SlideBackgroundsSchema.optional(),
    /**
     * The background's layer (its tile's corner icon): behind the words (default), or a cue of
     * its own over everything, the slides then on their theme's background.
     */
    backgroundOver: z.boolean().optional(),
  }),
  z.object({
    ...base,
    kind: z.literal('media'),
    mediaId: IdSchema,
    loop: z.boolean(),
    autoAdvance: z.boolean(),
    asBackground: z.boolean().default(false),
    /** Playback options for this cue (trim, fades, play on go live). */
    playback: MediaTrimSchema.extend({
      /** Unset: Settings › Presenting decides. */
      autoplay: z.boolean().optional(),
    }).optional(),
  }),
  z.object({
    ...base,
    kind: z.literal('presentation'),
    title: z.string().max(200),
    slides: z.array(TextSlideSchema).max(500),
    themeId: IdSchema.optional(),
    textFormat: TextFormatSchema.optional(),
    /** Move to the next slide on its own every so many seconds while live (looping back or not). */
    advance: AdvanceSchema.optional(),
    /** Its own slide transition, instead of the default one (Show › the orange transition). */
    transition: TransitionSpecSchema.optional(),
    background: BackgroundRefSchema.optional(),
    /** A readability overlay over its backgrounds (under the words); else the theme's. */
    backgroundOverlay: ScrimSchema.optional(),
    slideBackgrounds: SlideBackgroundsSchema.optional(),
    /**
     * The background's layer (its tile's corner icon): behind the words (default), or a cue of
     * its own over everything, the slides then on their theme's background.
     */
    backgroundOver: z.boolean().optional(),
  }),
  z.object({
    ...base,
    kind: z.literal('announcements'),
    title: z.string().max(200),
    slides: z.array(TextSlideSchema).max(500),
    loopIntervalSec: z.number().int().min(2).max(600),
    /** While live, move to the next slide every `loopIntervalSec` (off: stay until clicked). */
    autoAdvance: z.boolean().default(true),
    themeId: IdSchema.optional(),
    textFormat: TextFormatSchema.optional(),
    /** Its own slide transition, instead of the default one (Show › the orange transition). */
    transition: TransitionSpecSchema.optional(),
    background: BackgroundRefSchema.optional(),
    /** A readability overlay over its backgrounds (under the words); else the theme's. */
    backgroundOverlay: ScrimSchema.optional(),
    slideBackgrounds: SlideBackgroundsSchema.optional(),
    /**
     * The background's layer (its tile's corner icon): behind the words (default), or a cue of
     * its own over everything, the slides then on their theme's background.
     */
    backgroundOver: z.boolean().optional(),
  }),
  z.object({
    ...base,
    kind: z.literal('countdown'),
    title: z.string().max(200),
    target: z.union([
      z.string().max(40),
      z.object({ durationSec: z.number().int().min(1).max(86400) }),
    ]),
    themeId: IdSchema.optional(),
    textFormat: TextFormatSchema.optional(),
    transition: TransitionSpecSchema.optional(),
    /** Its own background (e.g. a stock countdown); otherwise the theme's. */
    background: BackgroundRefSchema.optional(),
    /** A readability overlay over its background (under the numbers); else the theme's. */
    backgroundOverlay: ScrimSchema.optional(),
    /** A countdown video, played so its last frame lands exactly on zero. */
    video: z.object({ mediaId: IdSchema }).optional(),
    /** Hide the numbers (a countdown video usually shows its own). */
    hideTimer: z.boolean().optional(),
  }),
  z.object({ ...base, kind: z.literal('header'), label: z.string().max(200) }),
  /** A web page (giving page, live feed…), shown in an isolated web view. */
  z.object({ ...base, kind: z.literal('web'), title: z.string().max(200), url: WebUrlSchema }),
]);
export type ServiceItem = z.infer<typeof ServiceItemSchema>;
export type ServiceItemKind = ServiceItem['kind'];

export const ServicePlanSchema = EntityMetaSchema.extend({
  name: z.string().min(1).max(200),
  date: z.string().max(40).optional(),
  isTemplate: z.boolean().default(false),
  items: z.array(ServiceItemSchema).max(1000),
});
export type ServicePlan = z.infer<typeof ServicePlanSchema>;
export const SERVICE_SCHEMA_VERSION = 1;

import { z } from 'zod';
import { EntityMetaSchema, IdSchema } from './common';
import { PassageRefSchema } from './scripture';
import { SlideObjectSchema, WebUrlSchema } from './scene';
import { BackgroundRefSchema } from './theme';

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

export const ServiceItemSchema = z.discriminatedUnion('kind', [
  z.object({
    ...base,
    kind: z.literal('song'),
    songId: IdSchema,
    arrangementId: IdSchema.optional(),
    /** Show this translation (a key of `song.translations`) under the lyrics. */
    translationLang: z.string().max(35).optional(),
    /** Transpose chords on the stage display by this many semitones. */
    transpose: z.number().int().min(-11).max(11).optional(),
    themeId: IdSchema.optional(),
    background: BackgroundRefSchema.optional(),
  }),
  z.object({
    ...base,
    kind: z.literal('scripture'),
    passage: PassageRefSchema,
    versionIds: z.array(z.string().max(32)).min(1).max(4),
    themeId: IdSchema.optional(),
    background: BackgroundRefSchema.optional(),
  }),
  z.object({
    ...base,
    kind: z.literal('media'),
    mediaId: IdSchema,
    loop: z.boolean(),
    autoAdvance: z.boolean(),
    asBackground: z.boolean().default(false),
  }),
  z.object({
    ...base,
    kind: z.literal('presentation'),
    title: z.string().max(200),
    slides: z.array(TextSlideSchema).max(500),
    themeId: IdSchema.optional(),
  }),
  z.object({
    ...base,
    kind: z.literal('announcements'),
    title: z.string().max(200),
    slides: z.array(TextSlideSchema).max(500),
    loopIntervalSec: z.number().int().min(2).max(600),
    themeId: IdSchema.optional(),
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

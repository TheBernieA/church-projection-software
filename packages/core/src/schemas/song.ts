import { z } from 'zod';
import { EntityMetaSchema, IdSchema } from './common';
import { TextFormatSchema } from './theme';

export const SectionKindSchema = z.enum([
  'verse',
  'chorus',
  'pre-chorus',
  'bridge',
  'tag',
  'intro',
  'outro',
  'ending',
  'other',
]);
export type SectionKind = z.infer<typeof SectionKindSchema>;

export const SongSectionSchema = z.object({
  id: IdSchema,
  kind: SectionKindSchema,
  label: z.string().max(60),
  lines: z.array(z.string().max(500)).max(200),
});
export type SongSection = z.infer<typeof SongSectionSchema>;

export const ArrangementSchema = z.object({
  id: IdSchema,
  name: z.string().max(60),
  sectionOrder: z.array(IdSchema).max(200),
});
export type Arrangement = z.infer<typeof ArrangementSchema>;

export const SongSchema = EntityMetaSchema.extend({
  title: z.string().min(1).max(200),
  alternateTitles: z.array(z.string().max(200)).max(20).default([]),
  authors: z.array(z.string().max(200)).max(20).default([]),
  copyright: z.string().max(500).optional(),
  ccliNumber: z.string().max(20).optional(),
  /** The credits (title, authors, copyright, licence) on the first slide; unset means shown. */
  showCredits: z.boolean().optional(),
  hymnNumber: z
    .array(z.object({ hymnalId: z.string().max(64), number: z.string().max(10) }))
    .optional(),
  key: z.string().max(10).optional(),
  tempo: z.number().int().min(20).max(300).optional(),
  sections: z.array(SongSectionSchema).max(100),
  arrangements: z.array(ArrangementSchema).min(1).max(20),
  defaultArrangementId: IdSchema,
  tags: z.array(z.string().max(60)).max(50).default([]),
  themeId: IdSchema.optional(),
  /** The song's own text formatting over its theme (font, size, colour, capitals…). */
  textFormat: TextFormatSchema.optional(),
  language: z.string().max(35).optional(),
  translations: z.record(z.string(), z.array(SongSectionSchema)).optional(),
  /** Origin: user-created, imported, or from a bundled/downloaded hymnal (read-only). */
  origin: z.enum(['user', 'imported', 'hymnal']).default('user'),
});
export type Song = z.infer<typeof SongSchema>;
export const SONG_SCHEMA_VERSION = 1;

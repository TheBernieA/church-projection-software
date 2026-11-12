import { z } from 'zod';

/** USFM 3-letter book codes in canonical Protestant order (66 books). */
export const BOOK_IDS = [
  'GEN',
  'EXO',
  'LEV',
  'NUM',
  'DEU',
  'JOS',
  'JDG',
  'RUT',
  '1SA',
  '2SA',
  '1KI',
  '2KI',
  '1CH',
  '2CH',
  'EZR',
  'NEH',
  'EST',
  'JOB',
  'PSA',
  'PRO',
  'ECC',
  'SNG',
  'ISA',
  'JER',
  'LAM',
  'EZK',
  'DAN',
  'HOS',
  'JOL',
  'AMO',
  'OBA',
  'JON',
  'MIC',
  'NAM',
  'HAB',
  'ZEP',
  'HAG',
  'ZEC',
  'MAL',
  'MAT',
  'MRK',
  'LUK',
  'JHN',
  'ACT',
  'ROM',
  '1CO',
  '2CO',
  'GAL',
  'EPH',
  'PHP',
  'COL',
  '1TH',
  '2TH',
  '1TI',
  '2TI',
  'TIT',
  'PHM',
  'HEB',
  'JAS',
  '1PE',
  '2PE',
  '1JN',
  '2JN',
  '3JN',
  'JUD',
  'REV',
] as const;

export const BookIdSchema = z.enum(BOOK_IDS);
export type BookId = z.infer<typeof BookIdSchema>;

export const VerseRefSchema = z.object({
  book: BookIdSchema,
  chapter: z.number().int().min(1).max(200),
  verse: z.number().int().min(1).max(999),
});
export type VerseRef = z.infer<typeof VerseRefSchema>;

/**
 * A passage. Ranges may cross chapters. `end.verse === WHOLE_CHAPTER` means "to the end of
 * the chapter"; resolvers clamp it against the loaded Bible.
 */
export const PassageRefSchema = z.object({ start: VerseRefSchema, end: VerseRefSchema });
export type PassageRef = z.infer<typeof PassageRefSchema>;
export const WHOLE_CHAPTER = 999;

export const BibleVersionInfoSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/),
  name: z.string().min(1).max(200),
  abbreviation: z.string().min(1).max(20),
  language: z.string().min(2).max(35),
  direction: z.enum(['ltr', 'rtl']),
  versification: z.enum(['kjv', 'lxx', 'vulgate', 'custom']),
  license: z.object({
    kind: z.enum(['public-domain', 'licensed', 'permission']),
    text: z.string().max(4000),
    url: z.url().optional(),
  }),
  copyrightLine: z.string().max(500).optional(),
  source: z.enum(['bundled', 'downloaded', 'imported']),
  checksumSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .or(z.literal('')),
  moduleVersion: z.string().max(40),
  provenance: z
    .object({ sourceUrl: z.string().max(500), retrievedAt: z.string(), sha256: z.string() })
    .optional(),
});
export type BibleVersionInfo = z.infer<typeof BibleVersionInfoSchema>;

/** `manifest.json` inside a `.lsbible` module. See docs/module-format.md. */
export const BibleModuleManifestSchema = z.object({
  format: z.literal('lampstand-bible'),
  formatVersion: z.literal(1),
  version: BibleVersionInfoSchema,
  files: z
    .array(
      z.object({
        path: z
          .string()
          .regex(/^[A-Za-z0-9_\-/.]+$/)
          .max(200),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        size: z.number().int().nonnegative(),
      }),
    )
    .max(200),
});
export type BibleModuleManifest = z.infer<typeof BibleModuleManifestSchema>;

/** `books/<BOOK>.json` inside a module. `chapters[c][v]` is the text of chapter c+1 verse v+1. */
export const BibleBookFileSchema = z.object({
  book: BookIdSchema,
  name: z.string().max(100),
  chapters: z.array(z.array(z.string().max(5000)).max(200)).max(200),
});
export type BibleBookFile = z.infer<typeof BibleBookFileSchema>;

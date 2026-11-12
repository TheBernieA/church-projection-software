import { z } from 'zod';
import { SectionKindSchema } from './schemas/song';

/** Bundled/downloaded hymnal source file (resources/hymns/*.json). */
export const HymnalFileSchema = z.object({
  format: z.literal('lampstand-hymnal'),
  formatVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().max(200),
  license: z.string().max(2000),
  hymns: z
    .array(
      z.object({
        number: z.string().max(10),
        title: z.string().max(200),
        authors: z.array(z.string().max(200)).max(10),
        year: z.number().int().optional(),
        copyright: z.string().max(300).optional(),
        tags: z.array(z.string().max(60)).max(20).optional(),
        sections: z
          .array(
            z.object({
              kind: SectionKindSchema,
              label: z.string().max(60),
              lines: z.array(z.string().max(300)).min(1).max(40),
            }),
          )
          .min(1)
          .max(40),
        /** Section labels in sung order; defaults to verses with the chorus after each. */
        order: z.array(z.string().max(60)).max(80).optional(),
      }),
    )
    .max(2000),
});
export type HymnalFile = z.infer<typeof HymnalFileSchema>;

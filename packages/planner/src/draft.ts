import { z } from 'zod';

/**
 * What the model writes for a service plan. Deliberately loose (no length limits: structured
 * outputs don't support them, and the operator reviews it anyway); `resolveDraft` turns it into
 * real, schema-checked plan items on this computer.
 */
export const DRAFT_KINDS = [
  'section',
  'song',
  'scripture',
  'announcement',
  'countdown',
  'sermon',
  'prayer',
  'offering',
  'media',
  'note',
] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export const DraftSlideSchema = z.object({
  title: z.string().describe('Short heading for the slide, or an empty string.'),
  body: z.string().describe('The words on the slide.'),
});

export const DraftItemSchema = z.object({
  kind: z
    .enum(DRAFT_KINDS)
    .describe(
      'section: a heading that groups what follows (e.g. "Worship", "The Word"). ' +
        'song: a song or hymn to sing. scripture: a Bible reading. announcement: notices to ' +
        'show. countdown: a timer before the service or after a break. sermon, prayer, ' +
        'offering: those moments of the service. media: a video or picture to play. note: ' +
        'anything else (welcome, communion, baptism, benediction…).',
    ),
  title: z.string().describe('What the operator sees in the plan, e.g. "Opening prayer".'),
  songTitle: z
    .string()
    .nullable()
    .describe('For songs: the song title only, matching the library list if one fits.'),
  reference: z
    .string()
    .nullable()
    .describe('For readings: the reference in standard form, e.g. "Romans 8:28-39".'),
  minutes: z.number().nullable().describe('Planned length in minutes, if given or obvious.'),
  notes: z
    .string()
    .nullable()
    .describe('Who leads it, cues for the operator, anything the plan said about this step.'),
  slides: z
    .array(DraftSlideSchema)
    .describe(
      'Slides to show for this step, only when the plan gives their words (announcements, ' +
        'sermon points, a welcome). Empty otherwise: never invent lyrics or scripture text.',
    ),
});
export type DraftItem = z.infer<typeof DraftItemSchema>;

export const PlanDraftSchema = z.object({
  name: z.string().describe('A name for the plan, e.g. "Sunday Morning — Advent 1".'),
  date: z.string().nullable().describe('The service date as YYYY-MM-DD, if known.'),
  items: z.array(DraftItemSchema).describe('Every step of the service, in order.'),
  questions: z
    .array(z.string())
    .describe('Things the plan left unclear that the operator should check. Empty if none.'),
});
export type PlanDraft = z.infer<typeof PlanDraftSchema>;

/** The model's reply for "structure these lyrics". */
export const LyricsDraftSchema = z.object({
  title: z.string().describe('The song title, from the text or the first line of the chorus.'),
  authors: z.array(z.string()).describe('Writers if the text names them; empty otherwise.'),
  sections: z
    .array(
      z.object({
        kind: z.enum([
          'verse',
          'chorus',
          'pre-chorus',
          'bridge',
          'tag',
          'intro',
          'outro',
          'ending',
          'other',
        ]),
        label: z.string().describe('e.g. "Verse 1", "Chorus", "Bridge".'),
        lines: z.array(z.string()).describe('The lines exactly as given, one per entry.'),
      }),
    )
    .describe('Each part once, in the order first sung. Repeats are not written out again.'),
  order: z
    .array(z.string())
    .describe('The labels in the order they are sung, repeats included (e.g. V1, C, V2, C).'),
});
export type LyricsDraft = z.infer<typeof LyricsDraftSchema>;

import { z } from 'zod';
import { IdSchema } from './common';

/** What a stage element shows. */
export const StageElementKindSchema = z.enum([
  'current',
  'next',
  'clock',
  'elapsed',
  'timers',
  'label',
  'notes',
  'message',
  'chords',
  'text',
]);
export type StageElementKind = z.infer<typeof StageElementKindSchema>;

/** One box on a stage layout; position and size in % of the screen. */
export const StageElementSchema = z.object({
  id: IdSchema,
  kind: StageElementKindSchema,
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  w: z.number().min(2).max(100),
  h: z.number().min(2).max(100),
  /** Text size, relative to the element kind's normal size. */
  size: z.number().min(0.4).max(4).default(1),
  /** For `text`: what it says. */
  text: z.string().max(300).optional(),
});
export type StageElement = z.infer<typeof StageElementSchema>;

/** A stage screen design: which elements show, and where. */
export const StageLayoutSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(60),
  elements: z.array(StageElementSchema).max(24),
});
export type StageLayout = z.infer<typeof StageLayoutSchema>;

const box = (
  id: string,
  kind: StageElementKind,
  x: number,
  y: number,
  w: number,
  h: number,
  size = 1,
): StageElement => ({ id, kind, x, y, w, h, size });

/**
 * Ready-made layouts (read-only; duplicate one to change it). Classic is the default: clock,
 * slide name and timers along the top, Now and Next side by side, notes along the bottom.
 */
export const STAGE_PRESETS: StageLayout[] = [
  {
    id: 'preset-classic',
    name: 'Classic',
    elements: [
      box('clock', 'clock', 2, 2, 16, 9),
      box('label', 'label', 20, 3, 34, 7),
      box('timers', 'timers', 55, 2, 30, 9),
      box('elapsed', 'elapsed', 86, 2, 12, 9, 0.8),
      box('current', 'current', 2, 14, 56, 54),
      box('chords', 'chords', 2, 70, 56, 28),
      box('next', 'next', 60, 14, 38, 40),
      box('notes', 'notes', 60, 58, 38, 40),
      box('message', 'message', 6, 38, 88, 22),
    ],
  },
  {
    id: 'preset-lyrics',
    name: 'Words only',
    elements: [
      box('current', 'current', 2, 2, 96, 66),
      box('next', 'next', 2, 70, 60, 28),
      box('clock', 'clock', 64, 70, 34, 13, 1.2),
      box('timers', 'timers', 64, 85, 34, 13),
      box('message', 'message', 6, 38, 88, 18),
    ],
  },
  {
    id: 'preset-clock',
    name: 'Big clock',
    elements: [
      box('clock', 'clock', 4, 6, 92, 40, 3.2),
      box('timers', 'timers', 4, 50, 92, 20, 1.8),
      box('label', 'label', 4, 74, 92, 10, 1.3),
      box('message', 'message', 6, 86, 88, 12),
    ],
  },
];

export const DEFAULT_STAGE_LAYOUT_ID = 'preset-classic';

/** The layout stage screens use: the chosen one (custom or ready-made), else Classic. */
export function resolveStageLayout(
  layouts: StageLayout[],
  id: string | null | undefined,
): StageLayout {
  return (
    layouts.find((l) => l.id === id) ??
    STAGE_PRESETS.find((l) => l.id === id) ??
    (STAGE_PRESETS[0] as StageLayout)
  );
}

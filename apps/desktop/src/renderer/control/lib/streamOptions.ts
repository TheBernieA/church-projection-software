import type { StreamSettings } from '@lampstand/core';

/**
 * The stream's choices, listed once for the Live console and Settings › Streaming. Each label is
 * an i18n key under `streaming.`.
 */
type Picture = StreamSettings['picture'];
interface Choice<T extends string> {
  value: T;
  label: string;
}

export const WORDS_MODES: Choice<Picture['words']>[] = [
  { value: 'lowerThird', label: 'streaming.lowerThird' },
  { value: 'full', label: 'streaming.fullScreen' },
  { value: 'none', label: 'streaming.off' },
];

export const BACKGROUNDS: Choice<Picture['background']>[] = [
  { value: 'program', label: 'streaming.bgProgram' },
  { value: 'camera', label: 'streaming.bgCamera' },
  { value: 'black', label: 'streaming.bgBlack' },
];

export const WORDS_ALIGNS: Choice<Picture['wordsAlign']>[] = [
  { value: 'left', label: 'streaming.align.left' },
  { value: 'center', label: 'streaming.align.center' },
  { value: 'right', label: 'streaming.align.right' },
];

/** The lower third's size when chosen by hand, as % of the words' full-screen size. */
export const WORDS_SIZE = { min: 25, max: 100, step: 5 } as const;

/** The performance modes offered as a quick choice (Custom is set in Settings). */
export const QUICK_MODES = ['auto', 'light', 'balanced', 'quality'] as const;
export const PERFORMANCE_MODES = [...QUICK_MODES, 'custom'] as const;

/** A select's value for "no camera" / "each slide's own theme" (ids are never this). */
export const NONE = 'none';

/** Options for a control, with their labels translated. */
export const choices = <T extends string>(
  list: readonly Choice<T>[],
  t: (key: string) => string,
): { value: T; label: string }[] => list.map((c) => ({ value: c.value, label: t(c.label) }));

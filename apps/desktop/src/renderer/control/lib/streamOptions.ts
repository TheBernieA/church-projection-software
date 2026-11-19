import { themeAlignOf, type StreamSettings, type Theme } from '@lampstand/core';

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
  { value: 'switcher', label: 'streaming.bgSwitcher' },
  { value: 'layout', label: 'streaming.bgLayout' },
  { value: 'black', label: 'streaming.bgBlack' },
];

export const WORDS_ALIGNS: Choice<Picture['wordsAlign']>[] = [
  { value: 'left', label: 'streaming.align.left' },
  { value: 'center', label: 'streaming.align.center' },
  { value: 'right', label: 'streaming.align.right' },
];

/** A scene template: the usual looks for the stream, one click each. */
export interface SceneTemplate {
  id: string;
  /** Where it's listed: slides and words, cameras, or the screens it mirrors. */
  group: 'slides' | 'cameras' | 'screens';
  background: Picture['background'];
  words: Picture['words'];
  mirror?: Exclude<Picture['mirror'], 'own'>;
  layout?: Picture['layout'];
  /** Offered once for each camera. */
  perCamera?: boolean;
  /** Needs two cameras (a layout). */
  twoCameras?: boolean;
}

/** The scenes the Live console offers (camera ones once per camera; layouts with two). */
export const STREAM_SCENES: readonly SceneTemplate[] = [
  { id: 'slides', group: 'slides', background: 'program', words: 'full' },
  { id: 'slidesLowerThird', group: 'slides', background: 'program', words: 'lowerThird' },
  { id: 'wordsOnBlack', group: 'slides', background: 'black', words: 'full' },
  { id: 'black', group: 'slides', background: 'black', words: 'none' },
  { id: 'switcherLowerThird', group: 'cameras', background: 'switcher', words: 'lowerThird' },
  { id: 'switcher', group: 'cameras', background: 'switcher', words: 'none' },
  {
    id: 'cameraLowerThird',
    group: 'cameras',
    background: 'camera',
    words: 'lowerThird',
    perCamera: true,
  },
  { id: 'camera', group: 'cameras', background: 'camera', words: 'none', perCamera: true },
  {
    id: 'sideBySide',
    group: 'cameras',
    background: 'layout',
    layout: 'sideBySide',
    words: 'lowerThird',
    twoCameras: true,
  },
  {
    id: 'pip',
    group: 'cameras',
    background: 'layout',
    layout: 'pip',
    words: 'lowerThird',
    twoCameras: true,
  },
  { id: 'alternate', group: 'screens', background: 'program', words: 'full', mirror: 'alternate' },
  { id: 'stage', group: 'screens', background: 'program', words: 'full', mirror: 'stage' },
];

/**
 * The scenes the screens offer (under the output monitor): the same kinds as the stream's, made
 * with the video switcher's cameras and the screens' lower third. Every one keeps the words (a
 * screen with no words is a clear away).
 */
export const SCREEN_SCENES: readonly SceneTemplate[] = [
  { id: 'slides', group: 'slides', background: 'program', words: 'full' },
  { id: 'slidesLowerThird', group: 'slides', background: 'program', words: 'lowerThird' },
  { id: 'cameraWords', group: 'cameras', background: 'camera', words: 'full', perCamera: true },
  {
    id: 'cameraLowerThird',
    group: 'cameras',
    background: 'camera',
    words: 'lowerThird',
    perCamera: true,
  },
  {
    id: 'sideBySide',
    group: 'cameras',
    background: 'layout',
    layout: 'sideBySide',
    words: 'lowerThird',
    twoCameras: true,
  },
  {
    id: 'pip',
    group: 'cameras',
    background: 'layout',
    layout: 'pip',
    words: 'lowerThird',
    twoCameras: true,
  },
];

export const SCENE_GROUPS = ['slides', 'cameras', 'screens'] as const;

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

/** The lower-third themes to pick from, after "each slide's own (made smaller)". */
export const wordsThemeOptions = (
  lowerThirds: readonly Theme[],
  t: (key: string) => string,
): { value: string; label: string }[] => [
  { value: NONE, label: t('streaming.wordsThemeOwn') },
  ...lowerThirds.map((th) => ({ value: th.id, label: th.name })),
];

/**
 * Choosing the stream's lower-third theme: a theme brings its own position (which can still be
 * moved afterwards); NONE goes back to each slide's own theme.
 */
export function pickWordsTheme(
  id: string,
  lowerThirds: readonly Theme[],
): Pick<Picture, 'wordsTheme'> & Partial<Pick<Picture, 'wordsAlign'>> {
  const picked = lowerThirds.find((th) => th.id === id);
  return picked
    ? { wordsTheme: picked.id, wordsAlign: themeAlignOf(picked) }
    : { wordsTheme: null };
}

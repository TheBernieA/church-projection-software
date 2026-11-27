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
  /**
   * Leaves the words as they are (the screens' lower-third switch decides), so a camera is
   * offered once, not once with the slide and again with a lower third.
   */
  keepsWords?: boolean;
}

/**
 * The scenes the Live console offers (camera ones once per camera; layouts with two). Those that
 * keep the words follow the "Lower third on the stream" switch: on, the words run along the
 * bottom; off, `words` here (the full slide on the main screen, no words over a camera).
 */
export const STREAM_SCENES: readonly SceneTemplate[] = [
  { id: 'slides', group: 'slides', background: 'program', words: 'full', keepsWords: true },
  { id: 'wordsOnBlack', group: 'slides', background: 'black', words: 'full' },
  { id: 'black', group: 'slides', background: 'black', words: 'none' },
  { id: 'switcher', group: 'cameras', background: 'switcher', words: 'none', keepsWords: true },
  {
    id: 'camera',
    group: 'cameras',
    background: 'camera',
    words: 'none',
    perCamera: true,
    keepsWords: true,
  },
  {
    id: 'sideBySide',
    group: 'cameras',
    background: 'layout',
    layout: 'sideBySide',
    words: 'none',
    twoCameras: true,
    keepsWords: true,
  },
  {
    id: 'pip',
    group: 'cameras',
    background: 'layout',
    layout: 'pip',
    words: 'none',
    twoCameras: true,
    keepsWords: true,
  },
  { id: 'alternate', group: 'screens', background: 'program', words: 'full', mirror: 'alternate' },
  { id: 'stage', group: 'screens', background: 'program', words: 'full', mirror: 'stage' },
];

/**
 * The scenes the screens offer (under the output monitor): the same kinds as the stream's, made
 * with the video switcher's cameras and the screens' lower third. Every one keeps the words (a
 * screen with no words is a clear away); a camera's own scene leaves the lower third as it is.
 */
export const SCREEN_SCENES: readonly SceneTemplate[] = [
  // Slides, and each camera once, follow the screens' lower-third switch (just below the scenes).
  { id: 'slides', group: 'slides', background: 'program', words: 'full', keepsWords: true },
  {
    id: 'cameraWords',
    group: 'cameras',
    background: 'camera',
    words: 'full',
    perCamera: true,
    keepsWords: true,
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
/** How wide the lower third's words may spread, as % of the picture. */
export const WORDS_WIDTH = { min: 30, max: 100, step: 5 } as const;

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

/**
 * Whether the stream's own lower third is on ("Lower third on the stream"): only while the stream
 * shows its own picture, not a mirrored screen.
 */
export const streamLowerThirdOn = (pic: Picture): boolean =>
  pic.mirror === 'own' && pic.words === 'lowerThird';

/**
 * The stream picture with its lower third on or off. Off, the main screen shows the full slide
 * again and a camera shows no words.
 */
export function withStreamLowerThird(pic: Picture, on: boolean): Picture {
  return {
    ...pic,
    words: on ? 'lowerThird' : pic.background === 'program' ? 'full' : 'none',
  };
}

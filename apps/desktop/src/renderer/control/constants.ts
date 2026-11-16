import type { PropPosition } from '@lampstand/core';
import { type ShortcutAction } from './types';
/** Fixed values shared across the control window. */

export const CANVAS = { width: 1920, height: 1080 };

export const GRID = 8;

/**
 * Render PDF pages to PNG images with pdf.js, in the control window (it has a canvas; main
 * doesn't). Loaded on demand so it never slows down startup. The worker is bundled with the
 * app, so the strict CSP (`'self'`) holds, and eval is turned off.
 */
export const MAX_PDF_PAGES = 200;

/**
 * Stable empty fallbacks for selectors. A selector must never return a *new* object/array
 * (e.g. `?? []`): zustand would see a different value on every read and React would re-render
 * until it hits "Maximum update depth exceeded" (blank window). Lint enforces this.
 */
export const EMPTY_LIST: readonly unknown[] = Object.freeze([]);

export const EMPTY_RECORD: Readonly<Record<string, never>> = Object.freeze({});

/** Private drag payload type, so only Lampstand library items can be dropped into the plan. */
export const LIBRARY_MIME = 'application/x-lampstand-item';

export const NO_TRANSLATION = '__none__';

/** Defaults from §3.5 and §8.5. Fully remappable via settings.shortcuts. */
export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  goLive: 'Space',
  next: 'ArrowRight',
  previous: 'ArrowLeft',
  clearContent: 'F1',
  clearMedia: 'F2',
  clearBackground: 'F3',
  clearOverlays: 'F4',
  clearAll: 'F5',
  black: 'B',
  logo: 'L',
  freeze: 'F',
  panic: 'Escape',
  quickBar: 'Mod+K',
  undo: 'Mod+Z',
  redo: 'Mod+Shift+Z',
  cheatSheet: '?',
  perfHud: 'Mod+Alt+P',
  mediaToggle: 'P',
};

/**
 * Slide-group colours (Verse, Chorus, Bridge…), so the operator finds their place at a glance.
 * Never red or green: those mean live and preview.
 */
export const GROUP_COLORS: [RegExp, string][] = [
  [/^(verse|v\d|stanza)/, '#4f8ef7'],
  [/^(chorus|refrain|c\d)/, '#c26be0'],
  [/^(pre-?chorus|pc)/, '#e5b53a'],
  [/^(bridge|b\d)/, '#f08a3c'],
  [/^(tag|ending|coda|vamp)/, '#2fb8b0'],
  [/^(intro|outro|interlude|instrumental)/, '#8a8f9c'],
];

/** Fonts offered in the editors: everything the outputs bundle. */
export { BUNDLED_FONTS } from '../shared/fontList';

export { BUILT_IN_BACKGROUNDS } from '@lampstand/core';

export const PROP_POSITIONS: PropPosition[] = [
  'top-right',
  'top-left',
  'bottom-right',
  'bottom-left',
  'lower-third',
  'full',
];

export const LIVE_KINDS = ['song', 'scripture', 'presentation', 'announcements'] as const;

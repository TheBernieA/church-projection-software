import type { BackgroundRef, PropPosition } from '@lampstand/core';
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

export const FONTS = [
  'Inter',
  'Montserrat',
  'Lora',
  'Source Serif 4',
  'Playfair Display',
  'Bebas Neue',
  'Atkinson Hyperlegible',
];

/** Built-in generated backgrounds: resolution-independent, license-free (§12). */
export const BUILT_IN_BACKGROUNDS: { name: string; ref: BackgroundRef }[] = [
  {
    name: 'Midnight',
    ref: {
      kind: 'gradient',
      angle: 160,
      stops: [
        { color: '#1B2140', pos: 0 },
        { color: '#0B0E1A', pos: 100 },
      ],
    },
  },
  {
    name: 'Aurora',
    ref: {
      kind: 'generated',
      preset: 'aurora',
      colors: ['#2A1B4F', '#0E3B5C', '#5A1F3D'],
      speed: 0.6,
    },
  },
  {
    name: 'Ember',
    ref: {
      kind: 'generated',
      preset: 'glow',
      colors: ['#5C1F0E', '#8A3B12', '#1A0B08'],
      speed: 0.5,
    },
  },
  {
    name: 'Ocean drift',
    ref: {
      kind: 'generated',
      preset: 'drift',
      colors: ['#06283D', '#1363DF', '#0B1D33'],
      speed: 0.5,
    },
  },
  {
    name: 'Advent',
    ref: {
      kind: 'gradient',
      angle: 135,
      stops: [
        { color: '#2D1B4E', pos: 0 },
        { color: '#4A2C6F', pos: 50 },
        { color: '#120A1F', pos: 100 },
      ],
    },
  },
  {
    name: 'Easter dawn',
    ref: {
      kind: 'gradient',
      angle: 180,
      stops: [
        { color: '#F6C177', pos: 0 },
        { color: '#C76B98', pos: 55 },
        { color: '#2E2A5A', pos: 100 },
      ],
    },
  },
  {
    name: 'Forest',
    ref: {
      kind: 'generated',
      preset: 'aurora',
      colors: ['#0F3D2E', '#1E5F3A', '#0A1F17'],
      speed: 0.4,
    },
  },
  { name: 'Black', ref: { kind: 'color', color: '#000000' } },
];

export const PROP_POSITIONS: PropPosition[] = [
  'top-right',
  'top-left',
  'bottom-right',
  'bottom-left',
  'lower-third',
  'full',
];

export const LIVE_KINDS = ['song', 'scripture', 'presentation', 'announcements'] as const;

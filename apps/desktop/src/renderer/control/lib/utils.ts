import type { BackgroundRef } from '@lampstand/core';
import { gradientCss } from '@lampstand/renderer';

/** Small helpers shared across the control window. */

/** Keep a number within [min, max]. */
export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

/** The host of a web address ("example.com"), or '' if it isn't a valid URL. */
export function urlHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

export function swatchCss(ref: BackgroundRef): string {
  if (ref.kind === 'gradient') return gradientCss(ref);
  if (ref.kind === 'color') return ref.color;
  if (ref.kind === 'generated') return `linear-gradient(135deg, ${ref.colors.join(', ')})`;
  return '#000';
}

/** "Verse 1" → "V1", "Chorus" → "C", "Pre-chorus" → "PC". */
export function shortLabel(label: string): string {
  const num = /\d+/.exec(label)?.[0] ?? '';
  const words = label
    .replace(/\d+/g, '')
    .split(/[\s-]+/)
    .filter(Boolean);
  return (words.map((w) => w[0]?.toUpperCase() ?? '').join('') || label.slice(0, 2)) + num;
}

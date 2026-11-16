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
  if (ref.kind === 'generated') {
    // A still that hints at the motion: light pools over the base colour.
    const base = ref.colors[ref.colors.length - 1] ?? '#000';
    const lights = ref.colors.slice(0, -1);
    const spots = ['30% 25%', '78% 35%', '55% 85%', '15% 80%'];
    return [
      ...lights.map(
        (c, i) =>
          `radial-gradient(circle at ${spots[i % 4]}, color-mix(in srgb, ${c} 45%, transparent), transparent 55%)`,
      ),
      base,
    ].join(', ');
  }
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

/**
 * Scrolling over a focused number field changes its value in Chromium (a trackpad scroll can
 * silently turn 320 into 290). Let go of the field instead: the value stays, the page scrolls.
 */
export function installNumberWheelGuard(): () => void {
  const onWheel = (e: WheelEvent): void => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.type === 'number' && document.activeElement === t)
      t.blur();
  };
  document.addEventListener('wheel', onWheel, { capture: true, passive: true });
  return () => document.removeEventListener('wheel', onWheel, { capture: true });
}

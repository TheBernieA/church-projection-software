import {
  isPlainAdjust,
  screenFilterCss,
  screenTransformCss,
  type ScreenAdjust,
} from '@lampstand/core';

/** Each screen element's adjustment, re-applied when its window changes size. */
const applied = new WeakMap<HTMLElement, ScreenAdjust | null>();
let observer: ResizeObserver | null = null;

/**
 * Fit a screen element (output or stage display) to where the projector really lands: its box
 * pinned onto the adjusted corners (keystone, scale, move, flips) and colour-matched. Kept up to
 * date as the window changes size.
 */
export function applyScreenAdjust(screen: HTMLElement, adjust: ScreenAdjust | null): void {
  applied.set(screen, adjust);
  if (typeof ResizeObserver !== 'undefined') {
    observer ??= new ResizeObserver((entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        paint(el, applied.get(el) ?? null);
      }
    });
    observer.observe(screen);
  }
  paint(screen, adjust);
}

function paint(screen: HTMLElement, adjust: ScreenAdjust | null): void {
  const st = screen.style;
  if (!adjust || isPlainAdjust(adjust)) {
    st.transform = '';
    st.filter = '';
    return;
  }
  // Pinned in the window's own pixels (the transform maps its box onto the four corners).
  st.transformOrigin = '0 0';
  st.transform = screenTransformCss(adjust, screen.clientWidth, screen.clientHeight);
  st.filter = screenFilterCss(adjust);
}

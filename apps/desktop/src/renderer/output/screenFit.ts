import {
  blendSpan,
  blendStops,
  isPlainAdjust,
  screenFilterCss,
  screenTransformCss,
  type BlendPart,
  type ScreenAdjust,
} from '@lampstand/core';

/** The logical height every output draws at; widths follow each screen's shape. */
const CANVAS_HEIGHT = 1080;

/**
 * Fit an output's picture to its screen:
 * - edge blending: the picture element becomes this screen's slice of one wide picture, with its
 *   overlaps faded to black so neighbouring projectors add up to an even brightness;
 * - screen adjustments: the whole screen (picture, fades, test pattern) is pinned to where the
 *   projector really lands (keystone, scale, move, flips) and colour-matched.
 * Returns the canvas the renderer should draw on (wider when blending).
 */
export function fitScreen(
  screen: HTMLElement,
  picture: HTMLElement,
  info: { width: number; height: number; adjust: ScreenAdjust | null; blend: BlendPart | null },
): { canvas: { width: number; height: number }; canvasKey: string } {
  const screenWidth = Math.round((CANVAS_HEIGHT * info.width) / Math.max(1, info.height));
  const blend = info.blend;
  layoutPicture(picture, blend);
  drawFades(screen, blend);
  watchAdjust(screen, info.adjust);
  const span = blend ? blendSpan(blend) : { width: 1, start: 0 };
  return {
    canvas: { width: Math.round(screenWidth * span.width), height: CANVAS_HEIGHT },
    canvasKey: blend ? `${blend.count}|${blend.overlap}|${screenWidth}` : `1|${screenWidth}`,
  };
}

/** The picture fills the screen, or spans the blend with this screen's part showing. */
function layoutPicture(picture: HTMLElement, blend: BlendPart | null): void {
  const span = blend ? blendSpan(blend) : { width: 1, start: 0 };
  Object.assign(picture.style, {
    position: 'absolute',
    top: '0',
    bottom: '0',
    width: `${span.width * 100}%`,
    left: `${-span.start * 100}%`,
  });
}

/** The fades over the overlaps: black, from solid at the screen's edge to clear inside. */
function drawFades(screen: HTMLElement, blend: BlendPart | null): void {
  for (const old of screen.querySelectorAll('.ls-blend')) old.remove();
  if (!blend || blend.overlap <= 0) return;
  const stops = blendStops(blend.gamma);
  const ramp = (toward: 'right' | 'left'): string =>
    `linear-gradient(to ${toward}, ${stops
      .map((s) => `rgba(0,0,0,${s.opacity}) ${(s.at * 100).toFixed(2)}%`)
      .join(', ')})`;
  const fade = (side: 'left' | 'right'): HTMLElement => {
    const el = document.createElement('div');
    el.className = `ls-blend ls-blend-${side}`;
    Object.assign(el.style, {
      position: 'absolute',
      top: '0',
      bottom: '0',
      [side]: '0',
      width: `${blend.overlap * 100}%`,
      background: ramp(side === 'left' ? 'right' : 'left'),
      pointerEvents: 'none',
      zIndex: '5',
    });
    return el;
  };
  // Only the inner edges overlap a neighbour.
  if (blend.index > 0) screen.append(fade('left'));
  if (blend.index < blend.count - 1) screen.append(fade('right'));
}

/** The current adjustment, re-applied when the window changes size. */
let current: { screen: HTMLElement; adjust: ScreenAdjust | null } | null = null;
let observer: ResizeObserver | null = null;

function watchAdjust(screen: HTMLElement, adjust: ScreenAdjust | null): void {
  current = { screen, adjust };
  if (!observer && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => current && applyAdjust(current.screen, current.adjust));
    observer.observe(screen);
  }
  applyAdjust(screen, adjust);
}

function applyAdjust(screen: HTMLElement, adjust: ScreenAdjust | null): void {
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

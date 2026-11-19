import { blendSpan, blendStops, type BlendPart, type ScreenAdjust } from '@lampstand/core';
import { applyScreenAdjust } from '../shared/screenAdjust';

/** The logical height every output draws at; widths follow each screen's shape. */
const CANVAS_HEIGHT = 1080;

/**
 * Fit an output's picture to its screen:
 * - edge blending: the picture element becomes this screen's slice of one wide picture, with its
 *   overlaps faded to black so neighbouring projectors add up to an even brightness;
 * - screen adjustments: the whole screen (picture, fades, test pattern) is pinned to where the
 *   projector really lands (keystone, scale, move, flips) and colour-matched.
 * Returns the canvas the renderer should draw on (wider when blending), and a key that changes
 * when it does.
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
  applyScreenAdjust(screen, info.adjust);
  // A screen of its own keeps the usual 16:9 canvas (letterboxed on other shapes); a blend's
  // canvas spans every projector, at their shape.
  if (!blend) return { canvas: { width: 1920, height: CANVAS_HEIGHT }, canvasKey: 'single' };
  return {
    canvas: { width: Math.round(screenWidth * blendSpan(blend).width), height: CANVAS_HEIGHT },
    canvasKey: `${blend.count}|${blend.overlap}|${screenWidth}`,
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

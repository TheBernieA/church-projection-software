/**
 * Where the words go as a lower third. Pure sums (tested): given the boxes the theme laid the
 * text out in, on the slide's canvas, how much to scale the words layer and where to move it so
 * the text sits near the bottom, left, centre or right.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WordsOptions {
  /** Fit the words to the band (long verses shrink, short lines stay readable). */
  auto: boolean;
  /** Otherwise: the size, as % of the words' full-screen size. */
  size: number;
  align: 'left' | 'center' | 'right';
}

/** Space kept clear at the sides and under the words, as a share of the picture. */
const SIDE = 0.05;
const BOTTOM = 0.06;
/** Automatic sizing: the words take at most this much of the picture's height and width. */
const AUTO_HEIGHT = 0.26;
const AUTO_WIDTH = 1 - SIDE * 2;
/** Automatic sizing never goes above or below these (as a scale of full size). */
const AUTO_MAX = 0.75;
const AUTO_MIN = 0.25;

export function lowerThird(
  boxes: Box[],
  canvas: { width: number; height: number },
  o: WordsOptions,
): { scale: number; x: number; y: number; band: number } {
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const w = Math.max(1, Math.max(...boxes.map((b) => b.x + b.w)) - left);
  const h = Math.max(1, Math.max(...boxes.map((b) => b.y + b.h)) - top);
  const fit = Math.min((canvas.width * AUTO_WIDTH) / w, (canvas.height * AUTO_HEIGHT) / h);
  const scale = o.auto
    ? Math.max(AUTO_MIN, Math.min(AUTO_MAX, fit))
    : Math.max(0.1, Math.min(1, o.size / 100));
  const side = canvas.width * SIDE;
  const targetX =
    o.align === 'left'
      ? side
      : o.align === 'right'
        ? canvas.width - side - w * scale
        : (canvas.width - w * scale) / 2;
  // Tall words at a large chosen size: keep the top on the picture.
  const targetY = Math.max(canvas.height * 0.02, canvas.height * (1 - BOTTOM) - h * scale);
  return {
    scale: Math.round(scale * 1000) / 1000,
    x: Math.round(targetX - left * scale),
    y: Math.round(targetY - top * scale),
    // The dark band behind them: the words, their margin, and a soft edge above.
    band: Math.min(1, (h * scale) / canvas.height + BOTTOM + 0.12),
  };
}

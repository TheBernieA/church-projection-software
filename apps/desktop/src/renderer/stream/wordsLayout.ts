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

interface WordsOptions {
  /** Fit the words to the band (long verses shrink, short lines stay readable). */
  auto: boolean;
  /** Otherwise: the size, as % of the words' full-screen size. */
  size: number;
  /** 'theme': keep the words where the theme put them across the picture. */
  align: 'theme' | 'left' | 'center' | 'right';
  /** Along the bottom of the picture (the default), or the top. */
  edge?: 'bottom' | 'top';
  /** The most of the picture's width the words may take (0–1; default: all but the margins). */
  width?: number;
}

/** Space kept clear at the sides, and between the words and the picture's edge (top or bottom). */
const SIDE = 0.05;
const EDGE = 0.06;
/** Automatic sizing: the words take at most this much of the picture's height and width. */
const AUTO_HEIGHT = 0.26;
const AUTO_WIDTH = 1 - SIDE * 2;
/** The largest a lower third's words are drawn (as a scale of full size). */
const AUTO_MAX_SCALE = 0.75;
/** Automatic sizing never goes above or below these (as a scale of full size). */
const AUTO_MAX = AUTO_MAX_SCALE;
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
  const maxWidth = Math.min(AUTO_WIDTH, o.width ?? AUTO_WIDTH);
  const fit = Math.min((canvas.width * maxWidth) / w, (canvas.height * AUTO_HEIGHT) / h);
  const scale = o.auto
    ? Math.max(AUTO_MIN, Math.min(AUTO_MAX, fit))
    : Math.max(0.1, Math.min(1, o.size / 100));
  const side = canvas.width * SIDE;
  const targetX =
    o.align === 'left'
      ? side
      : o.align === 'right'
        ? canvas.width - side - w * scale
        : o.align === 'center'
          ? (canvas.width - w * scale) / 2
          : // As the theme has it: the block keeps its centre, kept inside the margins.
            Math.max(
              side,
              Math.min(canvas.width - side - w * scale, left + w / 2 - (w * scale) / 2),
            );
  // Tall words at a large chosen size: keep them on the picture.
  const targetY =
    o.edge === 'top'
      ? Math.min(canvas.height * EDGE, canvas.height * 0.98 - h * scale)
      : Math.max(canvas.height * 0.02, canvas.height * (1 - EDGE) - h * scale);
  return {
    scale: Math.round(scale * 1000) / 1000,
    x: Math.round(targetX - left * scale),
    y: Math.round(targetY - top * scale),
    // The dark band behind them: the words, their margin, and a soft edge beyond.
    band: Math.min(1, (h * scale) / canvas.height + EDGE + 0.12),
  };
}

/**
 * The side margins (% of the width, each side) that give the words a text box this wide when
 * laid out full size, so that at a lower third's size (`scaled`) they spread to about `widthPct`
 * of the picture: a wide box makes fewer, longer lines (a long verse isn't squeezed into a
 * column). A lower-third theme drawn at its own size isn't scaled: its box is `widthPct` wide.
 */
export function wordsSideMargin(widthPct: number, scaled = true): number {
  // Drawn at full size (a lower-third theme at its own size), the box is simply that wide.
  const box = Math.min(100, scaled ? widthPct / AUTO_MAX_SCALE : widthPct);
  return Math.max(2, (100 - box) / 2);
}

import type { CornerOffset, ScreenAdjust } from './schemas/settings';

/**
 * The maths behind fitting a picture to a screen: corner pinning (a projective transform),
 * the colour filter, and edge blending's layout and fades. Pure, so outputs, previews and tests
 * all agree.
 */

export type Point = readonly [number, number];
type Quad = readonly [Point, Point, Point, Point];

/**
 * The projective transform taking the unit square's corners (0,0), (1,0), (1,1), (0,1) to `q`
 * (Heckbert's square-to-quad), as [a, b, c, d, e, f, g, h]:
 * x = (a·u + b·v + c) / (g·u + h·v + 1), y = (d·u + e·v + f) / (g·u + h·v + 1).
 */
export function squareToQuad(q: Quad): number[] {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9)
    // A parallelogram: an ordinary (affine) transform.
    return [x1 - x0, x2 - x1, x0, y1 - y0, y2 - y1, y0, 0, 0];
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h = (dx1 * dy3 - dx3 * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h];
}

/** Where a point of a w×h rectangle lands under {@link squareToQuad}'s transform. */
export function mapPoint(m: number[], w: number, h: number, [x, y]: Point): Point {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, hh = 0] = m;
  const u = x / w;
  const v = y / h;
  const z = g * u + hh * v + 1;
  return [(a * u + b * v + c) / z, (d * u + e * v + f) / z];
}

const pin = (c: CornerOffset, w: number, h: number): Point => [(c.x / 100) * w, (c.y / 100) * h];

/**
 * Where a screen's four corners end up (top-left, top-right, bottom-right, bottom-left), in px of
 * a w×h output: scaled about the middle, moved, then each corner nudged; flips swap which corner
 * of the picture goes where.
 */
export function adjustedCorners(a: ScreenAdjust, w: number, h: number): Quad {
  const cx = w / 2 + (a.offsetX / 100) * w;
  const cy = h / 2 + (a.offsetY / 100) * h;
  const hw = (w / 2) * a.scale;
  const hh = (h / 2) * a.scale;
  const base: Quad = [
    [cx - hw, cy - hh],
    [cx + hw, cy - hh],
    [cx + hw, cy + hh],
    [cx - hw, cy + hh],
  ];
  const nudge = [a.corners.tl, a.corners.tr, a.corners.br, a.corners.bl].map((c) => pin(c, w, h));
  const placed = base.map(([x, y], i) => {
    const [nx, ny] = nudge[i] ?? [0, 0];
    return [x + nx, y + ny] as const;
  }) as unknown as Quad;
  // The picture's top-left goes to the screen's top-right when flipped left-right, and so on.
  const [tl, tr, br, bl] = placed;
  if (a.flipH && a.flipV) return [br, bl, tl, tr];
  if (a.flipH) return [tr, tl, bl, br];
  if (a.flipV) return [bl, br, tr, tl];
  return placed;
}

/** CSS `matrix3d` taking a w×h element (transform-origin 0 0) onto the screen's adjusted corners. */
export function screenTransformCss(a: ScreenAdjust, w: number, h: number): string {
  const [ma = 0, mb = 0, mc = 0, md = 0, me = 0, mf = 0, mg = 0, mh = 0] = squareToQuad(
    adjustedCorners(a, w, h),
  );
  // Column-major: x' = a/w·x + b/h·y + c, y' = d/w·x + e/h·y + f, w' = g/w·x + h/h·y + 1.
  const cols = [ma / w, md / w, 0, mg / w, mb / h, me / h, 0, mh / h, 0, 0, 1, 0, mc, mf, 0, 1];
  return `matrix3d(${cols.map((n) => +n.toFixed(8)).join(',')})`;
}

/** CSS filter for a screen's colour matching ('' when unchanged). */
export function screenFilterCss(a: ScreenAdjust): string {
  return [
    a.brightness !== 1 ? `brightness(${a.brightness})` : '',
    a.contrast !== 1 ? `contrast(${a.contrast})` : '',
    a.saturate !== 1 ? `saturate(${a.saturate})` : '',
    a.hue !== 0 ? `hue-rotate(${a.hue}deg)` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** No fitting or colour change at all (the output needn't transform anything). */
export function isPlainAdjust(a: ScreenAdjust | null | undefined): boolean {
  if (!a) return true;
  const c = a.corners;
  return (
    [c.tl, c.tr, c.br, c.bl].every((p) => p.x === 0 && p.y === 0) &&
    a.scale === 1 &&
    a.offsetX === 0 &&
    a.offsetY === 0 &&
    !a.flipH &&
    !a.flipV &&
    !screenFilterCss(a)
  );
}

/** One projector's part of an edge-blended picture. */
export interface BlendPart {
  /** 0 = the left-most. */
  index: number;
  count: number;
  /** Overlap with each neighbour, as a share of one screen's width (0–0.4). */
  overlap: number;
  gamma: number;
}

/**
 * How wide the whole blended picture is (in screens), and where this projector's screen starts
 * in it (in screens from the left edge).
 */
export function blendSpan(p: BlendPart): { width: number; start: number } {
  return { width: p.count - (p.count - 1) * p.overlap, start: p.index * (1 - p.overlap) };
}

/**
 * The fade over an overlap, from the screen's edge (0) to where the overlap ends (1): the
 * darkness of a black layer at each step. Neighbours' light adds up to full brightness: each
 * projector's share follows a smooth curve, corrected for the projector's gamma.
 */
export function blendStops(gamma: number, steps = 12): { at: number; opacity: number }[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const share = t * t * (3 - 2 * t); // smoothstep: the two shares sum to 1 everywhere
    return { at: t, opacity: +(1 - Math.pow(share, 1 / gamma)).toFixed(4) };
  });
}

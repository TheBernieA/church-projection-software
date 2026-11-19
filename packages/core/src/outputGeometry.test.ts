import { describe, expect, it } from 'vitest';
import {
  adjustedCorners,
  blendSpan,
  blendStops,
  isPlainAdjust,
  mapPoint,
  screenFilterCss,
  screenTransformCss,
  squareToQuad,
} from './outputGeometry';
import { ScreenAdjustSchema } from './schemas/settings';

const plain = ScreenAdjustSchema.parse({});
const close = (a: readonly number[], b: readonly number[]) =>
  a.forEach((n, i) => expect(n).toBeCloseTo(b[i] ?? NaN, 6));

describe('corner pinning', () => {
  it('maps the rectangle onto any four corners (keystone)', () => {
    const q = [
      [40, 10],
      [1900, 0],
      [1880, 1070],
      [0, 1080],
    ] as const;
    const m = squareToQuad(q);
    const corners = [
      [0, 0],
      [1920, 0],
      [1920, 1080],
      [0, 1080],
    ] as const;
    corners.forEach((c, i) => close(mapPoint(m, 1920, 1080, c), q[i] ?? [0, 0]));
  });

  it('leaves an untouched screen as it is', () => {
    expect(isPlainAdjust(plain)).toBe(true);
    close(adjustedCorners(plain, 100, 50).flat(), [0, 0, 100, 0, 100, 50, 0, 50]);
    expect(screenTransformCss(plain, 100, 50)).toBe('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)');
  });

  it('scales about the middle, moves, nudges corners and flips', () => {
    const a = {
      ...plain,
      scale: 0.5,
      offsetX: 10,
      corners: { ...plain.corners, tl: { x: 1, y: 2 } },
    };
    close(adjustedCorners(a, 100, 100).flat(), [36, 27, 85, 25, 85, 75, 35, 75]);
    const flipped = adjustedCorners({ ...plain, flipH: true }, 100, 100);
    close(flipped[0], [100, 0]);
    close(adjustedCorners({ ...plain, flipV: true }, 100, 100)[0], [0, 100]);
    expect(isPlainAdjust({ ...plain, flipH: true })).toBe(false);
  });

  it('colour matching becomes a CSS filter', () => {
    expect(screenFilterCss(plain)).toBe('');
    expect(screenFilterCss({ ...plain, brightness: 0.9, hue: 12 })).toBe(
      'brightness(0.9) hue-rotate(12deg)',
    );
  });
});

describe('edge blending', () => {
  it('lays the screens out across one wide picture', () => {
    expect(blendSpan({ index: 0, count: 2, overlap: 0.2, gamma: 2.2 })).toEqual({
      width: 1.8,
      start: 0,
    });
    expect(blendSpan({ index: 2, count: 3, overlap: 0.1, gamma: 2.2 }).start).toBeCloseTo(1.8);
  });

  it('fades the overlap so the two projectors add up to full brightness', () => {
    const stops = blendStops(1, 10);
    expect(stops[0]?.opacity).toBe(1);
    expect(stops.at(-1)?.opacity).toBe(0);
    // Gamma 1: each side's light is linear, and mirrored shares sum to one.
    const n = stops.length - 1;
    stops.forEach((s, i) =>
      expect(1 - s.opacity + (1 - (stops[n - i]?.opacity ?? 0))).toBeCloseTo(1, 3),
    );
    // A real projector's gamma lifts the fade's middle (less black over it).
    expect(blendStops(2.2, 10)[5]?.opacity ?? 1).toBeLessThan(stops[5]?.opacity ?? 0);
  });
});

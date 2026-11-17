import { describe, expect, it } from 'vitest';
import { lowerThird } from './wordsLayout';

const canvas = { width: 1920, height: 1080 };
/** A centred block of text as a theme lays it out full screen. */
const text = { x: 360, y: 340, w: 1200, h: 400 };

describe('lower-third words', () => {
  it('fits tall text into the band automatically', () => {
    const p = lowerThird([text], canvas, { auto: true, size: 60, align: 'center' });
    // 26% of 1080 over 400 px of text.
    expect(p.scale).toBeCloseTo(0.702, 2);
    const bottom = p.y + (text.y + text.h) * p.scale;
    expect(bottom).toBeCloseTo(1080 * 0.94, 0);
    // Centred.
    expect(p.x + (text.x + text.w / 2) * p.scale).toBeCloseTo(960, 0);
  });

  it('keeps a short line readable rather than blowing it up', () => {
    const p = lowerThird([{ x: 760, y: 500, w: 400, h: 80 }], canvas, {
      auto: true,
      size: 60,
      align: 'center',
    });
    expect(p.scale).toBe(0.75);
  });

  it('shrinks a very long verse, but not below a quarter', () => {
    const p = lowerThird([{ x: 100, y: 0, w: 1720, h: 2000 }], canvas, {
      auto: true,
      size: 60,
      align: 'center',
    });
    expect(p.scale).toBe(0.25);
  });

  it('uses the chosen size when not automatic, and aligns left or right', () => {
    const l = lowerThird([text], canvas, { auto: false, size: 50, align: 'left' });
    expect(l.scale).toBe(0.5);
    expect(l.x + text.x * l.scale).toBeCloseTo(96, 0);
    const r = lowerThird([text], canvas, { auto: false, size: 50, align: 'right' });
    expect(r.x + (text.x + text.w) * r.scale).toBeCloseTo(1920 - 96, 0);
  });

  it('measures the text and its reference together', () => {
    const p = lowerThird([text, { x: 800, y: 780, w: 320, h: 40 }], canvas, {
      auto: false,
      size: 50,
      align: 'center',
    });
    expect(p.y + 820 * p.scale).toBeCloseTo(1080 * 0.94, 0);
  });

  it('makes the band tall enough for the words', () => {
    const p = lowerThird([text], canvas, { auto: false, size: 100, align: 'center' });
    expect(p.band).toBeGreaterThan(400 / 1080);
    expect(p.band).toBeLessThanOrEqual(1);
  });
});

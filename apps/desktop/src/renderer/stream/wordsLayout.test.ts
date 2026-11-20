import { describe, expect, it } from 'vitest';
import { lowerThird, wordsSideMargin } from './wordsLayout';

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

  it('keeps the words where the theme put them across the picture', () => {
    const leftish = { x: 120, y: 700, w: 600, h: 200 };
    const p = lowerThird([leftish], canvas, { auto: false, size: 50, align: 'theme' });
    // The block's centre stays at 420.
    expect(p.x + (leftish.x + leftish.w / 2) * p.scale).toBeCloseTo(420, 0);
  });

  it('sits along the top when asked', () => {
    const p = lowerThird([text], canvas, { auto: true, size: 60, align: 'center', edge: 'top' });
    expect(p.y + text.y * p.scale).toBeCloseTo(1080 * 0.06, 0);
  });

  it('never spreads wider than the width chosen', () => {
    const wide = { x: 0, y: 500, w: 1920, h: 100 };
    const p = lowerThird([wide], canvas, { auto: true, size: 60, align: 'center', width: 0.5 });
    expect(wide.w * p.scale).toBeLessThanOrEqual(1920 * 0.5 + 1);
  });

  it('gives the words a wider box to wrap in as the width grows', () => {
    expect(wordsSideMargin(30)).toBeCloseTo(30, 0); // a 40% box
    expect(wordsSideMargin(60)).toBeCloseTo(10, 0); // an 80% box
    expect(wordsSideMargin(100)).toBe(2); // never right to the edge
    // A lower-third theme at its own size: the box is simply that wide.
    expect(wordsSideMargin(90, false)).toBe(5);
  });
});

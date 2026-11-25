import { describe, expect, it } from 'vitest';
import { boxOnMonitor, monitorToPicture, pictureToMonitor } from './mapping';

const whole = { x: 0.5, y: 0.5, zoom: 1 };
const shot = { x: 0.3, y: 0.4, zoom: 2 };

describe('picture ↔ monitor', () => {
  it('the whole picture maps one to one; a mirror flips across', () => {
    expect(pictureToMonitor({ x: 0.2, y: 0.7 }, whole, false)).toEqual({ x: 0.2, y: 0.7 });
    expect(pictureToMonitor({ x: 0.2, y: 0.7 }, whole, true).x).toBeCloseTo(0.8, 10);
  });

  it('a shot’s middle is the monitor’s middle; back and forth agree', () => {
    expect(pictureToMonitor({ x: 0.3, y: 0.4 }, shot, false)).toEqual({ x: 0.5, y: 0.5 });
    for (const mirror of [false, true]) {
      const p = monitorToPicture({ x: 0.1, y: 0.9 }, shot, mirror);
      const back = pictureToMonitor(p, shot, mirror);
      expect(back.x).toBeCloseTo(0.1, 10);
      expect(back.y).toBeCloseTo(0.9, 10);
    }
  });

  it('an outline is cut to the shot, or gone when outside it', () => {
    const b = boxOnMonitor({ x: 0.25, y: 0.3, w: 0.1, h: 0.2 }, shot, false);
    expect(b?.x).toBeCloseTo(0.4, 10);
    expect(b?.y).toBeCloseTo(0.3, 10);
    expect(b?.w).toBeCloseTo(0.2, 10);
    expect(b?.h).toBeCloseTo(0.4, 10);
    expect(boxOnMonitor({ x: 0.9, y: 0.3, w: 0.05, h: 0.2 }, shot, false)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { Backlog } from './backlog';

describe('encoder backlog in seconds', () => {
  it('is zero when everything written has been taken', () => {
    const b = new Backlog();
    b.add(100, 0);
    b.add(100, 33);
    expect(b.seconds(0)).toBe(0);
  });

  it('measures the age of the oldest frame not yet taken, whatever its size', () => {
    const b = new Backlog();
    // Tiny frames (a still slide): 60 frames = 2 s in only 6 kB.
    for (let i = 0; i < 60; i++) b.add(100, (i * 1000) / 30);
    expect(b.seconds(6000)).toBeCloseTo(1.97, 1); // nothing taken yet
    expect(b.seconds(3000)).toBeCloseTo(0.97, 1); // half taken
    expect(b.seconds(100)).toBe(0); // only the newest waits
  });

  it('starts again after a reset', () => {
    const b = new Backlog();
    b.add(500, 0);
    b.add(500, 5000);
    b.reset();
    b.add(10, 0);
    expect(b.seconds(10)).toBe(0);
  });
});

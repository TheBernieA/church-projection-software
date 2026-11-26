import { describe, expect, it } from 'vitest';
import { DUCK_HOLD_MS, DuckFollower } from './ducking';

describe('ducking', () => {
  it('dips while a voice is above the threshold and holds between words', () => {
    const d = new DuckFollower();
    expect(d.next(-60, -40, 0)).toBe(false);
    expect(d.next(-20, -40, 100)).toBe(true);
    // A pause shorter than the hold: still down (no pumping).
    expect(d.next(-70, -40, 100 + DUCK_HOLD_MS - 10)).toBe(true);
    // Quiet for longer: back up.
    expect(d.next(-70, -40, 100 + DUCK_HOLD_MS + 10)).toBe(false);
  });

  it('no voice at all never dips', () => {
    expect(new DuckFollower().next(-Infinity, -40, 1000)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { moveItem } from './array';

describe('moveItem', () => {
  it('moves without mutating, ignores out-of-range', () => {
    const xs = ['a', 'b', 'c'];
    expect(moveItem(xs, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(xs, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(xs, 1, 5)).toEqual(xs);
    expect(xs).toEqual(['a', 'b', 'c']);
  });
});

import { describe, expect, it } from 'vitest';
import type { ServiceItem } from '@lampstand/core';
import {
  moveSectionBy,
  moveSectionTo,
  sectionBounds,
  sectionCanMove,
  sectionDropBoundary,
} from './sections';

const h = (id: string): ServiceItem => ({ id, kind: 'header', label: id });
const s = (id: string): ServiceItem => ({ id, kind: 'presentation', title: id, slides: [] });
const ids = (xs: ServiceItem[]): string => xs.map((x) => x.id).join(' ');

// lead1 | A a1 a2 | B b1 | C c1 c2
const plan = [s('lead1'), h('A'), s('a1'), s('a2'), h('B'), s('b1'), h('C'), s('c1'), s('c2')];

describe('service sections', () => {
  it('finds section bounds, including the untitled leading group', () => {
    expect(sectionBounds(plan, 1)).toEqual([1, 4]);
    expect(sectionBounds(plan, 3)).toEqual([1, 4]);
    expect(sectionBounds(plan, 0)).toEqual([0, 1]);
    expect(sectionBounds(plan, 8)).toEqual([6, 9]);
  });

  it('drop on an item lands after that whole section, drop on a header lands before it', () => {
    expect(sectionDropBoundary(plan, 2)).toBe(4); // over a1 → after section A
    expect(sectionDropBoundary(plan, 4)).toBe(4); // over header B → before B
    expect(sectionDropBoundary(plan, 7)).toBe(9); // over c1 → end
  });

  it('moves a whole section as one block — never splitting another section', () => {
    // Drag C onto a1 (inside A): C goes after A, not between a1 and a2.
    expect(ids(moveSectionTo(plan, 6, sectionDropBoundary(plan, 2)))).toBe(
      'lead1 A a1 a2 C c1 c2 B b1',
    );
    // Drag A to the end.
    expect(ids(moveSectionTo(plan, 1, plan.length))).toBe('lead1 B b1 C c1 c2 A a1 a2');
    // Dropping a section onto itself changes nothing.
    expect(ids(moveSectionTo(plan, 1, sectionDropBoundary(plan, 3)))).toBe(ids(plan));
  });

  it('↑/↓ swap with the neighbouring section and respect the leading group', () => {
    expect(ids(moveSectionBy(plan, 4, -1))).toBe('lead1 B b1 A a1 a2 C c1 c2');
    expect(ids(moveSectionBy(plan, 4, 1))).toBe('lead1 A a1 a2 C c1 c2 B b1');
    expect(ids(moveSectionBy(plan, 1, -1))).toBe(ids(plan)); // can't go above untitled items
    expect(ids(moveSectionBy(plan, 6, 1))).toBe(ids(plan)); // already last
    expect(sectionCanMove(plan, 1)).toEqual({ up: false, down: true });
    expect(sectionCanMove(plan, 6)).toEqual({ up: true, down: false });
  });
});

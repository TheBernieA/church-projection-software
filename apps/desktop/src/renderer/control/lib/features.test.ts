/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEATURE_CATEGORIES, FEATURES } from './features';

/** Every .tsx file under components/, as one string. */
function componentSource(): string {
  const dir = join(__dirname, '..', 'components');
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((n) => {
      const p = join(d, n);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
    });
  return walk(dir)
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n');
}

describe('feature catalogue', () => {
  it('has unique ids, a known category for each, and both statuses', () => {
    const ids = FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const cats = new Set(FEATURE_CATEGORIES.map((c) => c.id));
    expect(FEATURES.every((f) => cats.has(f.category))).toBe(true);
    expect(FEATURES.some((f) => f.status === 'soon')).toBe(true);
  });

  it('every planned feature is marked "Soon" somewhere in the interface, not only in Settings', () => {
    const src = componentSource();
    const missing = FEATURES.filter((f) => f.status === 'soon')
      .map((f) => f.id)
      .filter((id) => !src.includes(`'${id}'`) && !src.includes(`"${id}"`));
    expect(missing).toEqual([]);
  });
});

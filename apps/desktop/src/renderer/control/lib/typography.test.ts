import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every .ts/.tsx file under a folder. */
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx?$/.test(n) && !n.includes('.test.') ? [p] : [];
  });

const control = join(__dirname, '..');
const ui = join(__dirname, '..', '..', '..', '..', '..', '..', 'packages', 'ui', 'src');

describe('typography has a single source of truth', () => {
  it('only Typography.tsx spells out text sizes; everything else uses <Typography> or typographyClass()', () => {
    const offenders = [...sources(control), ...sources(ui)]
      .filter((p) => !p.endsWith('Typography.tsx'))
      .flatMap((p) =>
        readFileSync(p, 'utf8')
          .split('\n')
          .map((line, i) => ({ line, at: `${relative(join(ui, '..', '..', '..'), p)}:${i + 1}` }))
          .filter(({ line }) => /text-ui-\d|text-\[[\d.]+px\]|text-\[length:/.test(line))
          .map(({ at }) => at),
      );
    expect(offenders).toEqual([]);
  });

  it('the old CSS text classes are gone', () => {
    const css = readFileSync(join(control, 'styles.css'), 'utf8');
    expect(css).not.toMatch(/^\.(label|section-label) \{/m);
    expect(css).not.toMatch(/--fs-/);
  });
});

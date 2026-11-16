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

const files = (): { path: string; text: string }[] =>
  [...sources(control), ...sources(ui)].map((path) => ({ path, text: readFileSync(path, 'utf8') }));
const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/** Text styling that belongs in Typography props, not hand-written classes. */
const TYPO_CLASS =
  /(?:^|\s)(?:font-(?:normal|medium|semibold|bold)|text-\[var\(--text-[123]\)\]|text-white|tnum|leading-(?:none|tight|snug|normal|relaxed)|uppercase|truncate|italic|font-mono)(?=\s|$)/;
const TEXT_TAGS =
  'p|span|h[1-6]|label|li|td|th|strong|small|em|code|summary|legend|figcaption|dt|dd';

describe('one Button for every button', () => {
  it('no raw <button> outside Button.tsx; use <Button> (variant="bare" for self-styled surfaces)', () => {
    const offenders = files()
      .filter(({ path }) => !path.endsWith('Button.tsx'))
      .flatMap(({ path, text }) =>
        [...text.matchAll(/<button[\s>]/g)].map((m) => `${path}:${lineOf(text, m.index)}`),
      );
    expect(offenders).toEqual([]);
  });
});

describe('one Slider for every slider', () => {
  it('no raw range input outside Slider.tsx; use <Slider> (it draws the track and the value)', () => {
    const offenders = files()
      .filter(({ path }) => !path.endsWith('Slider.tsx'))
      .flatMap(({ path, text }) =>
        [...text.matchAll(/type="range"/g)].map((m) => `${path}:${lineOf(text, m.index)}`),
      );
    expect(offenders).toEqual([]);
  });
});

describe('typography has a single source of truth', () => {
  it('text elements take their style from <Typography>, not hand-written classes', () => {
    const tag = new RegExp(
      `<(?:${TEXT_TAGS})\\s[^>]*?className=(?:"([^"]*)"|\\{\`([^\`]*)\`\\})`,
      'g',
    );
    const offenders = files().flatMap(({ path, text }) =>
      [...text.matchAll(tag)]
        // Only the fixed part of the class list: conditional styling (`${…}`) may stay.
        .filter((m) => TYPO_CLASS.test((m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, ' ')))
        .map((m) => `${path}:${lineOf(text, m.index)}`),
    );
    expect(offenders).toEqual([]);
  });

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

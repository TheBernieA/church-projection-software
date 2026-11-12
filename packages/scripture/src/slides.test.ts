import { describe, expect, it } from 'vitest';
import type { VerseRef } from '@lampstand/core';
import { buildScriptureSlides, splitText, type VersionText } from './slides';

const v = (n: number): VerseRef => ({ book: 'JHN', chapter: 3, verse: n });
const kjv = (texts: Record<number, string>): VersionText => ({
  id: 'kjv',
  abbreviation: 'KJV',
  direction: 'ltr',
  language: 'en',
  verse: (r) => texts[r.verse],
});

describe('splitText', () => {
  it('prefers sentence, then clause, then word boundaries — never mid-word', () => {
    expect(splitText('One two. Three four.', 12)).toEqual(['One two.', 'Three four.']);
    const parts = splitText('alpha beta gamma delta epsilon zeta eta theta', 12);
    expect(parts.every((p) => p.length <= 12)).toBe(true);
    expect(parts.join(' ')).toBe('alpha beta gamma delta epsilon zeta eta theta');
  });
});

describe('buildScriptureSlides', () => {
  const texts = { 16: 'a'.repeat(100), 17: 'b'.repeat(100), 18: 'c'.repeat(100) };
  it('fits as many verses as the budget allows', () => {
    const s = buildScriptureSlides([v(16), v(17), v(18)], [kjv(texts)], {
      mode: 'fit',
      maxChars: 220,
      keyPrefix: 'x',
    });
    expect(s.map((x) => x.verses.map((r) => r.verse))).toEqual([[16, 17], [18]]);
  });
  it('one verse per slide', () => {
    expect(
      buildScriptureSlides([v(16), v(17)], [kjv(texts)], {
        mode: 'one',
        maxChars: 999,
        keyPrefix: 'x',
      }),
    ).toHaveLength(2);
  });
  it('splits a very long verse into parts', () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ') + '.';
    const s = buildScriptureSlides([v(16)], [kjv({ 16: long })], {
      mode: 'fit',
      maxChars: 100,
      keyPrefix: 'x',
    });
    expect(s.length).toBeGreaterThan(1);
    expect(s[0]?.part).toEqual({ index: 0, count: s.length });
  });
  it('labels blocks for multi-version display', () => {
    const fr: VersionText = { ...kjv(texts), id: 'lsg', abbreviation: 'LSG' };
    const s = buildScriptureSlides([v(16)], [kjv(texts), fr], {
      mode: 'fit',
      maxChars: 600,
      keyPrefix: 'x',
    });
    expect(s[0]?.blocks.map((b) => b.label)).toEqual(['KJV', 'LSG']);
  });
});

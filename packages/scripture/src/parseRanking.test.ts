import { WHOLE_CHAPTER } from '@lampstand/core';
import { describe, expect, it } from 'vitest';
import { parseReference } from './parse';
import { compact } from './testHelpers';

const CTX = { book: 'JHN', chapter: 3 } as const;

describe('parseReference — ambiguity & ranking', () => {
  it('"john" alone means the Gospel, with 1–3 John as faint alternatives', () => {
    const c = parseReference('John 1:1');
    expect(c.map((x) => compact(x.passages))).toEqual([
      'JHN 1:1-1:1',
      '1JN 1:1-1:1',
      '2JN 1:1-1:1',
      '3JN 1:1-1:1',
    ]);
    expect(c[0]?.confidence).toBeGreaterThan(0.9);
    expect(c[1]?.confidence).toBeLessThan(0.5);
  });

  it('drops siblings whose chapter is impossible', () => {
    const c = parseReference('John 3:16');
    expect(c.map((x) => x.passages[0]?.start.book)).toEqual(['JHN', '1JN']);
  });

  it('an explicit number prefix is unambiguous', () => {
    const c = parseReference('1 John 3:16');
    expect(c).toHaveLength(1);
    expect(c[0]?.passages[0]?.start.book).toBe('1JN');
  });

  it('bare "corinthians" ranks 1 Corinthians first, 2 Corinthians second', () => {
    const c = parseReference('Corinthians 13:4');
    expect(c.map((x) => x.passages[0]?.start.book)).toEqual(['1CO', '2CO']);
    expect(c[0]?.confidence).toBeLessThan(0.9);
    expect(c[0]!.confidence).toBeGreaterThan(c[1]!.confidence);
  });

  it('bare "corinthians 16" keeps only 1 Corinthians (2 Cor has 13 chapters)', () => {
    expect(parseReference('Corinthians 16').map((x) => x.passages[0]?.start.book)).toEqual(['1CO']);
  });

  it.each([
    ['kings 5', ['1KI', '2KI']],
    ['samuel 3', ['1SA', '2SA']],
    ['chronicles 7', ['1CH', '2CH']],
    ['thessalonians 2', ['1TH', '2TH']],
    ['timothy 3', ['1TI', '2TI']],
    ['peter 3', ['1PE', '2PE']],
  ] as const)('bare family "%s" → %j', (input, books) => {
    expect(parseReference(input).map((x) => x.passages[0]?.start.book)).toEqual(books);
  });

  it('prefix "jo" ranks John first among Job/Joel/Jonah/Joshua', () => {
    const books = parseReference('jo 3').map((x) => x.passages[0]?.start.book);
    expect(books[0]).toBe('JHN');
    expect(new Set(books)).toEqual(new Set(['JHN', 'JOS', 'JOB', 'JOL', 'JON']));
  });

  it('prefix candidates are invalid-filtered (Joel has 3 chapters)', () => {
    const books = parseReference('jo 10').map((x) => x.passages[0]?.start.book);
    expect(books).not.toContain('JOL');
    expect(books).not.toContain('JON');
    expect(books[0]).toBe('JHN');
  });

  it.each([
    ['romans 8 28', 'ROM'],
    ['roma 8', 'ROM'],
    ['philip 4 13', 'PHP'],
    ['phili 4:13', 'PHP'],
    ['matth 5', 'MAT'],
    ['revel 21', 'REV'],
    ['gene 1', 'GEN'],
    ['ephe 2:8', 'EPH'],
    ['1 corin 13', '1CO'],
    ['song of so 2', 'SNG'],
    ['hebr 11', 'HEB'],
  ] as const)('partial "%s" → %s', (input, book) => {
    expect(parseReference(input)[0]?.passages[0]?.start.book).toBe(book);
  });

  it('a unique prefix scores below an exact name', () => {
    const prefix = parseReference('hebr 11:1')[0]?.confidence ?? 0;
    const exact = parseReference('heb 11:1')[0]?.confidence ?? 0;
    expect(prefix).toBeLessThan(exact);
  });

  it('single letters are too short to guess a book', () => {
    expect(parseReference('j 3')).toEqual([]);
  });

  it('book-only input previews chapter 1 at low confidence', () => {
    const [c] = parseReference('jn');
    expect(c?.passages).toEqual([
      {
        start: { book: 'JHN', chapter: 1, verse: 1 },
        end: { book: 'JHN', chapter: 1, verse: WHOLE_CHAPTER },
      },
    ]);
    expect(c?.confidence).toBeLessThanOrEqual(0.4);
  });

  it('chapter-only scores below chapter:verse', () => {
    const ch = parseReference('Romans 8')[0]?.confidence ?? 0;
    const cv = parseReference('Romans 8:28')[0]?.confidence ?? 0;
    expect(ch).toBeLessThan(cv);
  });

  it('spoken adjacency ("3 16") scores slightly below an explicit colon', () => {
    const adj = parseReference('Romans 8 28')[0]?.confidence ?? 0;
    const colon = parseReference('Romans 8:28')[0]?.confidence ?? 0;
    expect(adj).toBeLessThan(colon);
    expect(adj).toBeGreaterThan(0.8);
  });

  it('trailing unknown words reduce confidence but keep the match', () => {
    const [c] = parseReference('John 3:16 kjv');
    expect(compact(c?.passages ?? [])).toBe('JHN 3:16-3:16');
    expect(c?.confidence).toBeLessThan(0.7);
    expect(c?.matched).toBe('John 3:16');
  });

  it('"mark my words" is only a weak book-only guess', () => {
    const [c] = parseReference('mark my words');
    expect(c?.confidence).toBeLessThan(0.3);
  });

  it('reports the matched slice of the input', () => {
    expect(parseReference('  Romans 8:28, 31-39  ')[0]?.matched).toBe('Romans 8:28, 31-39');
  });

  it('confidences are within 0..1 and sorted descending', () => {
    for (const input of ['jo 3', 'John 1:1', 'Corinthians 13', 'ma 5']) {
      const c = parseReference(input);
      for (let i = 0; i < c.length; i++) {
        expect(c[i]!.confidence).toBeGreaterThan(0);
        expect(c[i]!.confidence).toBeLessThanOrEqual(1);
        if (i > 0) expect(c[i]!.confidence).toBeLessThanOrEqual(c[i - 1]!.confidence);
      }
    }
  });
});

describe('parseReference — context', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['verse 18', 'JHN 3:18-3:18'],
    ['v 18', 'JHN 3:18-3:18'],
    ['verses 20 to 22', 'JHN 3:20-3:22'],
    ['verses twenty to twenty-two', 'JHN 3:20-3:22'],
    ['verse 16 and 17', 'JHN 3:16-3:17'],
    ['verse 16 and verse 18', 'JHN 3:16-3:16, JHN 3:18-3:18'],
    ['same chapter verse 20', 'JHN 3:20-3:20'],
    ['the same chapter, verse 20', 'JHN 3:20-3:20'],
    ['chapter 4 verse 2', 'JHN 4:2-4:2'],
    ['chapter four', 'JHN 4:1-4:999'],
    ['chapter 4:2', 'JHN 4:2-4:2'],
  ];
  it.each(cases)('%s → %s', (input, expected) => {
    const [c] = parseReference(input, { context: CTX });
    expect(compact(c?.passages ?? [])).toBe(expected);
  });

  it('context verse beyond the book is rejected', () => {
    expect(parseReference('chapter 30', { context: CTX })).toEqual([]);
  });

  it('an explicit book wins over context', () => {
    expect(compact(parseReference('Romans 8:1', { context: CTX })[0]?.passages ?? [])).toBe(
      'ROM 8:1-8:1',
    );
  });

  it('"same chapter" without a verse is not a reference', () => {
    expect(parseReference('same chapter', { context: CTX })).toEqual([]);
  });

  it('context results carry a solid but sub-explicit confidence', () => {
    const c = parseReference('verse 18', { context: CTX })[0]?.confidence ?? 0;
    expect(c).toBeGreaterThan(0.6);
    expect(c).toBeLessThan(0.95);
  });
});

describe('parseReference — languages', () => {
  it.each([
    ['Jean 3:16', 'fr', 'JHN 3:16-3:16'],
    ['Ésaïe 53:5', 'fr', 'ISA 53:5-53:5'],
    ['1 Corinthiens 13:4', 'fr', '1CO 13:4-13:4'],
    ['Psaume 23', 'fr', 'PSA 23:1-23:999'],
    ['Juan 3:16', 'es', 'JHN 3:16-3:16'],
    ['Salmos 23', 'es', 'PSA 23:1-23:999'],
    ['1 Corintios 13', 'es', '1CO 13:1-13:999'],
    ['Romans 8:28', 'fr', 'ROM 8:28-8:28'],
  ] as const)('%s (%s) → %s', (input, lang, expected) => {
    expect(compact(parseReference(input, { lang })[0]?.passages ?? [])).toBe(expected);
  });

  it('French names are not recognised under English', () => {
    expect(parseReference('Jean 3:16', { lang: 'en' })).toEqual([]);
  });
});

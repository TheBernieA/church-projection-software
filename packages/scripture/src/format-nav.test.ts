import {
  BOOK_IDS,
  WHOLE_CHAPTER,
  type BookId,
  type PassageRef,
  type VerseRef,
} from '@lampstand/core';
import { describe, expect, it } from 'vitest';
import {
  ALIASES,
  lookupAlias,
  lookupAliasPrefix,
  normalizeAliasKey,
  registerAliases,
} from './aliases';
import { BOOKS, bookIndex, bookName, getBook } from './books';
import { formatPassage, formatPassages } from './format';
import {
  chapterCount,
  comparePassage,
  compareVerse,
  expandPassage,
  nextVerse,
  passageContains,
  prevVerse,
} from './nav';
import { parseReference } from './parse';

const v = (book: BookId, chapter: number, verse: number): VerseRef => ({ book, chapter, verse });
const p = (book: BookId, c1: number, v1: number, c2 = c1, v2 = v1): PassageRef => ({
  start: v(book, c1, v1),
  end: v(book, c2, v2),
});
/** Fake versification: every chapter has 10 verses, except John 3 (36). */
const verses = (book: BookId, ch: number): number => (book === 'JHN' && ch === 3 ? 36 : 10);

describe('books', () => {
  it('has all 66 books in BOOK_IDS order', () => {
    expect(BOOKS.map((b) => b.id)).toEqual([...BOOK_IDS]);
  });
  it('has 1189 chapters in total (KJV)', () => {
    expect(BOOKS.reduce((n, b) => n + b.chapters, 0)).toBe(1189);
  });
  it('splits 39 OT / 27 NT', () => {
    expect(BOOKS.filter((b) => b.testament === 'OT')).toHaveLength(39);
    expect(getBook('MAT').testament).toBe('NT');
  });
  it('names', () => {
    expect(bookName('1CO')).toBe('1 Corinthians');
    expect(bookName('1CO', { short: true })).toBe('1 Cor');
    expect(bookName('SNG')).toBe('Song of Solomon');
    expect(bookIndex('GEN')).toBe(0);
    expect(bookIndex('REV')).toBe(65);
    expect(chapterCount('PSA')).toBe(150);
  });
  it('throws on unknown ids', () => {
    expect(() => getBook('XXX' as BookId)).toThrow();
    expect(() => bookIndex('XXX' as BookId)).toThrow();
  });
});

describe('aliases', () => {
  it('normalizes keys', () => {
    expect(normalizeAliasKey('First John')).toBe('1 john');
    expect(normalizeAliasKey('1st  Cor.')).toBe('1 cor');
    expect(normalizeAliasKey('1Cor')).toBe('1 cor');
    expect(normalizeAliasKey('II Kings')).toBe('2 kings');
    expect(normalizeAliasKey('Ésaïe')).toBe('esaie');
    expect(normalizeAliasKey('one')).toBe('one');
  });
  it('every book name resolves to itself', () => {
    for (const b of BOOKS) expect(lookupAlias(normalizeAliasKey(b.name))).toBe(b.id);
  });
  it('abbreviations are typed-only, names are spoken-safe', () => {
    expect(lookupAlias('is')).toBe('ISA');
    expect(lookupAlias('is', { spokenOnly: true })).toBeUndefined();
    expect(lookupAlias('isaiah', { spokenOnly: true })).toBe('ISA');
  });
  it('does not leak prototype keys', () => {
    expect(lookupAlias('constructor')).toBeUndefined();
    expect(lookupAlias('__proto__')).toBeUndefined();
  });
  it('registerAliases adds a new language (e.g. Yoruba) with English fallback', () => {
    registerAliases('yo', { Jòhánù: 'JHN', 'Ìwé Orin Dafidi': 'PSA' }, { spoken: true });
    expect(ALIASES.yo?.['johanu']).toBe('JHN');
    expect(parseReference('Jòhánù 3:16', { lang: 'yo' })[0]?.passages[0]?.start.book).toBe('JHN');
    expect(
      parseReference('Iwe Orin Dafidi 23', { lang: 'yo' })[0]?.passages[0]?.start.chapter,
    ).toBe(23);
    expect(parseReference('Rom 8:28', { lang: 'yo' })[0]?.passages[0]?.start.book).toBe('ROM');
  });
  it('prefix lookup', () => {
    expect(lookupAliasPrefix('phil')).toEqual(expect.arrayContaining(['PHP', 'PHM']));
    expect(lookupAliasPrefix('zzz')).toEqual([]);
    expect(lookupAliasPrefix('jea', { lang: 'fr' })).toContain('JHN');
  });
});

describe('formatPassage', () => {
  it.each([
    [p('JHN', 3, 16), 'John 3:16'],
    [p('JHN', 3, 16, 3, 18), 'John 3:16–18'],
    [p('GEN', 1, 1, 2, 3), 'Genesis 1:1–2:3'],
    [p('PSA', 23, 1, 23, WHOLE_CHAPTER), 'Psalm 23'],
    [p('PSA', 119, 105), 'Psalm 119:105'],
    [p('PSA', 23, 1, 24, WHOLE_CHAPTER), 'Psalms 23–24'],
    [p('GEN', 1, 1, 3, WHOLE_CHAPTER), 'Genesis 1–3'],
    [p('JHN', 3, 16, 3, WHOLE_CHAPTER), 'John 3:16–end'],
    [p('GEN', 1, 5, 2, WHOLE_CHAPTER), 'Genesis 1:5–2:end'],
    [p('JUD', 1, 3), 'Jude 3'],
    [p('JUD', 1, 3, 1, 5), 'Jude 3–5'],
    [p('JUD', 1, 1, 1, WHOLE_CHAPTER), 'Jude'],
    [p('1CO', 13, 4, 13, 7), '1 Corinthians 13:4–7'],
    [p('SNG', 2, 1), 'Song of Solomon 2:1'],
  ] as const)('%j → %s', (passage, text) => {
    expect(formatPassage(passage)).toBe(text);
  });

  it('short names', () => {
    expect(formatPassage(p('1CO', 13, 4, 13, 7), { short: true })).toBe('1 Cor 13:4–7');
    expect(formatPassage(p('PSA', 23, 1, 23, WHOLE_CHAPTER), { short: true })).toBe('Ps 23');
  });

  it('uses lastVerseOfChapter to resolve open ends and collapse full chapters', () => {
    const lastVerseOfChapter = (): number => 36;
    expect(formatPassage(p('JHN', 3, 16, 3, WHOLE_CHAPTER), { lastVerseOfChapter })).toBe(
      'John 3:16–36',
    );
    expect(formatPassage(p('JHN', 3, 1, 3, 36), { lastVerseOfChapter })).toBe('John 3');
  });

  it('cross-book passages spell out both ends', () => {
    const x: PassageRef = { start: v('MAL', 4, 6), end: v('MAT', 1, 1) };
    expect(formatPassage(x)).toBe('Malachi 4:6–Matthew 1:1');
  });

  it('round-trips through the parser', () => {
    for (const s of [
      'John 3:16',
      'Genesis 1:1–2:3',
      'Psalm 23',
      'Jude 3',
      '1 Corinthians 13:4–7',
      'Psalms 23–24',
    ]) {
      const c = parseReference(s)[0];
      expect(c && formatPassage(c.passages[0]!)).toBe(s);
    }
  });
});

describe('formatPassages', () => {
  it.each([
    [[p('ROM', 8, 28), p('ROM', 8, 31, 8, 39)], 'Romans 8:28, 31–39'],
    [[p('ROM', 8, 28), p('ROM', 9, 1)], 'Romans 8:28; 9:1'],
    [[p('JHN', 3, 16), p('ROM', 5, 8)], 'John 3:16; Romans 5:8'],
    [[p('PSA', 1, 1, 1, WHOLE_CHAPTER), p('PSA', 2, 1, 2, WHOLE_CHAPTER)], 'Psalms 1, 2'],
    [[p('PSA', 23, 1, 23, WHOLE_CHAPTER)], 'Psalm 23'],
    [[p('JUD', 1, 3), p('JUD', 1, 5)], 'Jude 3, 5'],
    [[], ''],
  ] as const)('%#: %s', (list, text) => {
    expect(formatPassages(list)).toBe(text);
  });

  it('formats the parser output for a multi-range reference', () => {
    expect(formatPassages(parseReference('Rom 8:28, 31-39')[0]!.passages)).toBe(
      'Romans 8:28, 31–39',
    );
  });
});

describe('nav', () => {
  it('compareVerse / comparePassage order canonically', () => {
    expect(compareVerse(v('GEN', 1, 1), v('EXO', 1, 1))).toBeLessThan(0);
    expect(compareVerse(v('JHN', 3, 16), v('JHN', 3, 16))).toBe(0);
    expect(compareVerse(v('JHN', 4, 1), v('JHN', 3, 36))).toBeGreaterThan(0);
    const list = [p('ROM', 8, 31, 8, 39), p('JHN', 3, 16), p('ROM', 8, 28), p('ROM', 8, 28, 8, 30)];
    expect(list.sort(comparePassage).map((x) => formatPassage(x))).toEqual([
      'John 3:16',
      'Romans 8:28',
      'Romans 8:28–30',
      'Romans 8:31–39',
    ]);
  });

  it('passageContains handles ranges and whole chapters', () => {
    expect(passageContains(p('JHN', 3, 16, 3, 18), v('JHN', 3, 17))).toBe(true);
    expect(passageContains(p('JHN', 3, 16, 3, 18), v('JHN', 3, 19))).toBe(false);
    expect(passageContains(p('PSA', 23, 1, 23, WHOLE_CHAPTER), v('PSA', 23, 6))).toBe(true);
    expect(passageContains(p('PSA', 23, 1, 23, WHOLE_CHAPTER), v('PSA', 24, 1))).toBe(false);
    expect(passageContains(p('GEN', 1, 1, 2, 3), v('GEN', 1, 31))).toBe(true);
  });

  it('nextVerse rolls over chapters and books, null at the end', () => {
    expect(nextVerse(v('JHN', 3, 16), verses)).toEqual(v('JHN', 3, 17));
    expect(nextVerse(v('JHN', 3, 36), verses)).toEqual(v('JHN', 4, 1));
    expect(nextVerse(v('MAL', 4, 10), verses)).toEqual(v('MAT', 1, 1));
    expect(nextVerse(v('REV', 22, 10), verses)).toBeNull();
  });

  it('nextVerse skips chapters reported empty', () => {
    const sparse = (b: BookId, c: number): number => (b === 'JHN' && c === 4 ? 0 : 10);
    expect(nextVerse(v('JHN', 3, 10), sparse)).toEqual(v('JHN', 5, 1));
  });

  it('prevVerse rolls back chapters and books, null at the start', () => {
    expect(prevVerse(v('JHN', 3, 17), verses)).toEqual(v('JHN', 3, 16));
    expect(prevVerse(v('JHN', 4, 1), verses)).toEqual(v('JHN', 3, 36));
    expect(prevVerse(v('MAT', 1, 1), verses)).toEqual(v('MAL', 4, 10));
    expect(prevVerse(v('GEN', 1, 1), verses)).toBeNull();
    expect(prevVerse(v('JHN', 2, 50), verses)).toEqual(v('JHN', 2, 10));
  });

  it('expandPassage clamps WHOLE_CHAPTER and crosses chapters', () => {
    expect(expandPassage(p('JHN', 3, 16, 3, 18), verses)).toHaveLength(3);
    expect(expandPassage(p('PSA', 23, 1, 23, WHOLE_CHAPTER), verses)).toHaveLength(10);
    const cross = expandPassage(p('GEN', 1, 9, 2, 2), verses);
    expect(cross).toEqual([v('GEN', 1, 9), v('GEN', 1, 10), v('GEN', 2, 1), v('GEN', 2, 2)]);
    expect(expandPassage(p('JHN', 3, 40, 3, 50), verses)).toEqual([]);
  });

  it('expandPassage walks across books', () => {
    const x: PassageRef = { start: v('MAL', 4, 9), end: v('MAT', 1, 2) };
    expect(expandPassage(x, verses)).toEqual([
      v('MAL', 4, 9),
      v('MAL', 4, 10),
      v('MAT', 1, 1),
      v('MAT', 1, 2),
    ]);
  });

  it('expandPassage is capped for runaway passages', () => {
    const all: PassageRef = { start: v('GEN', 1, 1), end: v('REV', 22, WHOLE_CHAPTER) };
    expect(expandPassage(all, () => 176).length).toBe(10_000);
  });
});

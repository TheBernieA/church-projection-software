import { WHOLE_CHAPTER, type BookId, type PassageRef } from '@lampstand/core';
import { getBook } from './books';

export interface FormatOptions {
  /** Use abbreviations ("1 Cor 13:4–7"). */
  readonly short?: boolean;
  /**
   * Resolves the last verse of a chapter so "to end of chapter" can print a real number and
   * "3:1–36" can collapse to "3". Without it, an open end prints as "end".
   */
  readonly lastVerseOfChapter?: (book: BookId, chapter: number) => number;
  /** The Bible version's own book names ("Genesi", "Juan"), used instead of the English ones. */
  readonly names?: Partial<Record<BookId, string>>;
}

// Display uses an en dash for ranges (typographic convention for number ranges).
const DASH = '–';

function bookLabel(
  book: BookId,
  short: boolean,
  plural: boolean,
  names?: Partial<Record<BookId, string>>,
): string {
  const b = getBook(book);
  if (short) return b.shortName;
  const own = names?.[book];
  if (own) return own;
  // "Psalm 23" for one psalm, "Psalms 23–24" when spanning several.
  if (book === 'PSA' && !plural) return 'Psalm';
  return b.name;
}

function endVerse(p: PassageRef, opts: FormatOptions): number | 'end' {
  const { end } = p;
  if (end.verse !== WHOLE_CHAPTER) return end.verse;
  return opts.lastVerseOfChapter ? opts.lastVerseOfChapter(end.book, end.chapter) : 'end';
}

function isWholeChapters(p: PassageRef, opts: FormatOptions): boolean {
  if (p.start.verse !== 1) return false;
  if (p.end.verse === WHOLE_CHAPTER) return true;
  return (
    opts.lastVerseOfChapter !== undefined &&
    p.end.verse >= opts.lastVerseOfChapter(p.end.book, p.end.chapter)
  );
}

/** The part after the book name ("3:16–18"), or '' for an entire one-chapter book. */
function locator(p: PassageRef, opts: FormatOptions): string {
  const { start: s, end: e } = p;
  const single = getBook(s.book).chapters === 1;
  if (isWholeChapters(p, opts)) {
    if (single) return '';
    return s.chapter === e.chapter
      ? String(s.chapter)
      : `${String(s.chapter)}${DASH}${String(e.chapter)}`;
  }
  const ev = String(endVerse(p, opts));
  if (s.chapter === e.chapter) {
    // One-chapter books are cited by verse alone: "Jude 3", not "Jude 1:3".
    const head = single ? String(s.verse) : `${String(s.chapter)}:${String(s.verse)}`;
    return ev === String(s.verse) ? head : `${head}${DASH}${ev}`;
  }
  return `${String(s.chapter)}:${String(s.verse)}${DASH}${String(e.chapter)}:${ev}`;
}

/**
 * Human-readable reference: "John 3:16", "John 3:16–18", "Genesis 1:1–2:3", "Psalm 23",
 * "Psalms 23–24", "Jude 3". A whole chapter (end verse WHOLE_CHAPTER) prints as just the chapter.
 */
export function formatPassage(p: PassageRef, opts: FormatOptions = {}): string {
  const short = opts.short === true;
  if (p.start.book !== p.end.book) {
    // Not produced by the parser, but representable; spell both ends out in full.
    const a = formatPassage({ start: p.start, end: { ...p.start } }, opts);
    const endName = bookLabel(p.end.book, short, false, opts.names);
    return `${a}${DASH}${endName} ${String(p.end.chapter)}:${String(endVerse(p, opts))}`;
  }
  const plural = p.start.chapter !== p.end.chapter;
  const loc = locator(p, opts);
  const name = bookLabel(p.start.book, short, plural, opts.names);
  return loc === '' ? name : `${name} ${loc}`;
}

/**
 * Formats a list compactly, sharing the book and chapter where possible:
 * [Rom 8:28, Rom 8:31–39] → "Romans 8:28, 31–39"; different chapters → "Romans 8:28; 9:1";
 * different books → "John 3:16; Romans 5:8".
 */
export function formatPassages(list: readonly PassageRef[], opts: FormatOptions = {}): string {
  let out = '';
  let prev: PassageRef | undefined;
  list.forEach((p, idx) => {
    const sameBook =
      prev !== undefined && prev.end.book === p.start.book && p.start.book === p.end.book;
    if (!prev || !sameBook) {
      // Pluralise "Psalms" when several psalms follow in one group.
      const nextP = list[idx + 1];
      const groupPlural = nextP !== undefined && nextP.start.book === p.start.book;
      const loc = locator(p, opts);
      const plural = groupPlural || p.start.chapter !== p.end.chapter;
      const name =
        p.start.book === p.end.book
          ? bookLabel(p.start.book, opts.short === true, plural, opts.names)
          : '';
      const full = name === '' ? formatPassage(p, opts) : loc === '' ? name : `${name} ${loc}`;
      out += prev ? `; ${full}` : full;
    } else {
      const prevWhole = isWholeChapters(prev, opts);
      const curWhole = isWholeChapters(p, opts);
      const loc = locator(p, opts);
      const sameChapterVerses =
        !curWhole &&
        !prevWhole &&
        p.start.chapter === prev.end.chapter &&
        p.start.chapter === p.end.chapter;
      if (sameChapterVerses) {
        // Strip the shared "8:" so the list reads "8:28, 31–39".
        const verses = loc.includes(':') ? loc.slice(loc.indexOf(':') + 1) : loc;
        out += `, ${verses}`;
      } else if (curWhole && prevWhole) {
        out += `, ${loc}`;
      } else {
        out += `; ${loc}`;
      }
    }
    prev = p;
  });
  return out;
}

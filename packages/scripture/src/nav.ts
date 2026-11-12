import type { BookId, PassageRef, VerseRef } from '@lampstand/core';
import { bookAt, bookIndex, getBook } from './books';

/**
 * Verse counts come from the loaded Bible version (they differ slightly between versions), so
 * every helper here takes a `versesInChapter` callback instead of hard-coding KJV counts.
 */
export type VersesInChapter = (book: BookId, chapter: number) => number;

/** Canonical ordering of two verses (book, then chapter, then verse). */
export function compareVerse(a: VerseRef, b: VerseRef): number {
  return bookIndex(a.book) - bookIndex(b.book) || a.chapter - b.chapter || a.verse - b.verse;
}

/** Orders passages by start, then by end (shorter first). Suitable for `Array.sort`. */
export function comparePassage(a: PassageRef, b: PassageRef): number {
  return compareVerse(a.start, b.start) || compareVerse(a.end, b.end);
}

/**
 * Whether verse `v` falls inside passage `p`. WHOLE_CHAPTER ends work naturally because the
 * sentinel (999) is larger than any real verse number.
 */
export function passageContains(p: PassageRef, v: VerseRef): boolean {
  return compareVerse(p.start, v) <= 0 && compareVerse(v, p.end) <= 0;
}

/**
 * The verse after `ref`, rolling over into the next chapter and then the next book.
 * Returns null after Revelation 22:21. Chapters reporting 0 verses (not loaded) are skipped.
 */
export function nextVerse(ref: VerseRef, versesInChapter: VersesInChapter): VerseRef | null {
  if (ref.verse < versesInChapter(ref.book, ref.chapter)) {
    return { ...ref, verse: ref.verse + 1 };
  }
  let idx = bookIndex(ref.book);
  let chapter = ref.chapter + 1;
  for (;;) {
    const book = bookAt(idx);
    if (!book) return null;
    for (; chapter <= book.chapters; chapter++) {
      if (versesInChapter(book.id, chapter) > 0) return { book: book.id, chapter, verse: 1 };
    }
    idx += 1;
    chapter = 1;
  }
}

/**
 * The verse before `ref`, rolling back into the previous chapter/book.
 * Returns null at Genesis 1:1. A verse beyond the chapter's end clamps to the last verse.
 */
export function prevVerse(ref: VerseRef, versesInChapter: VersesInChapter): VerseRef | null {
  const count = versesInChapter(ref.book, ref.chapter);
  if (ref.verse > 1 && count > 0) return { ...ref, verse: Math.min(ref.verse - 1, count) };
  let idx = bookIndex(ref.book);
  let chapter = ref.chapter - 1;
  for (;;) {
    const book = bookAt(idx);
    if (!book) return null;
    for (; chapter >= 1; chapter--) {
      const n = versesInChapter(book.id, chapter);
      if (n > 0) return { book: book.id, chapter, verse: n };
    }
    idx -= 1;
    const prev = bookAt(idx);
    if (!prev) return null;
    chapter = prev.chapters;
  }
}

/** Safety cap so a malformed passage cannot allocate the whole Bible by accident. */
const MAX_EXPANDED = 10_000;

/**
 * Every verse in a passage, in order. WHOLE_CHAPTER and any end verse past the chapter's real
 * length are clamped; cross-chapter (and cross-book) ranges are walked chapter by chapter.
 */
export function expandPassage(p: PassageRef, versesInChapter: VersesInChapter): VerseRef[] {
  const out: VerseRef[] = [];
  const startIdx = bookIndex(p.start.book);
  const endIdx = bookIndex(p.end.book);
  for (let bi = startIdx; bi <= endIdx; bi++) {
    const book = bookAt(bi);
    if (!book) break;
    const firstCh = bi === startIdx ? p.start.chapter : 1;
    const lastCh = bi === endIdx ? Math.min(p.end.chapter, book.chapters) : book.chapters;
    for (let ch = firstCh; ch <= lastCh; ch++) {
      const count = versesInChapter(book.id, ch);
      const from = bi === startIdx && ch === p.start.chapter ? p.start.verse : 1;
      const to = bi === endIdx && ch === p.end.chapter ? Math.min(p.end.verse, count) : count;
      for (let v = from; v <= to; v++) {
        out.push({ book: book.id, chapter: ch, verse: v });
        if (out.length >= MAX_EXPANDED) return out;
      }
    }
  }
  return out;
}

/** Number of chapters in a book (convenience re-export for chapter browsers). */
export function chapterCount(book: BookId): number {
  return getBook(book).chapters;
}

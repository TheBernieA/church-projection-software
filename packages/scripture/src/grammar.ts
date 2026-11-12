import { WHOLE_CHAPTER, type BookId, type PassageRef } from '@lampstand/core';
import { getBook } from './books';
import { isNum, wordAt, type Token } from './tokenize';

/**
 * The chapter/verse grammar that follows a book name (or, with context, stands alone).
 * One grammar covers typed and spoken forms because after tokenization they look alike:
 *
 *   "3:16-18, 20"                  → num ':' num '-' num ',' num
 *   "chapter three verses 4 to 7"  → 'chapter' num 'verses' num 'to' num
 *   "3 16"                         → num num   (spoken "John three sixteen")
 */

// English keywords plus French/Spanish starters (accents are stripped by the tokenizer).
// Keywords are language-agnostic here because a word like "chapitre" never means anything else.
const CHAPTER_WORDS = new Set([
  'chapter',
  'chapters',
  'chap',
  'chaps',
  'chapt',
  'ch',
  'chs',
  'chapitre',
  'chapitres',
  'capitulo',
  'capitulos',
]);
const VERSE_WORDS = new Set([
  'verse',
  'verses',
  'ver',
  'vers',
  'v',
  'vs',
  'vv',
  'vss',
  'verset',
  'versets',
  'versiculo',
  'versiculos',
]);
const RANGE_WORDS = new Set(['to', 'through', 'thru', 'till', 'til', 'until']);

/** Highest verse number in any KJV chapter (Psalm 119). Anything above is not a reference. */
export const MAX_VERSE = 176;
/** Guards against pathological input producing huge passage lists. */
const MAX_ITEMS = 20;

export function isChapterWord(w: string | undefined): boolean {
  return w !== undefined && CHAPTER_WORDS.has(w);
}
export function isVerseWord(w: string | undefined): boolean {
  return w !== undefined && VERSE_WORDS.has(w);
}

interface Point {
  ch: number;
  /** null = chapter-level (whole chapter). */
  v: number | null;
}

export interface TailOptions {
  /** Chapter that bare verse numbers attach to (context chapter, or 1 for one-chapter books). */
  readonly curCh: number | null;
  /** Whether a leading bare number is a chapter or a verse. */
  readonly level: 'chapter' | 'verse';
  /** Allow "3 16" (two bare numbers) to mean 3:16. */
  readonly allowAdjacent: boolean;
  /** True if the token at index i begins a new book reference (stops list continuation). */
  readonly isBookAt: (i: number) => boolean;
}

export interface TailResult {
  readonly passages: PassageRef[];
  /** Index of the first unconsumed token. */
  readonly next: number;
  /** At least one verse was given (vs. whole chapters only). */
  readonly hasVerse: boolean;
  /** The first chapter/verse split came from bare adjacency ("3 16"), the weakest signal. */
  readonly adjacent: boolean;
  /** The reference used the word "chapter" or a ':' — strong evidence in speech. */
  readonly explicit: boolean;
}

/** Index of the verse number if a chapter→verse separator starts at i, else -1. */
function verseTarget(toks: readonly Token[], i: number): number {
  const t = toks[i];
  if (t === undefined) return -1;
  const sepLike =
    (t.kind === 'sep' && (t.text === ':' || t.text === '.')) ||
    (t.kind === 'word' && (t.text === 'colon' || VERSE_WORDS.has(t.text)));
  if (sepLike) return isNum(toks[i + 1]) ? i + 1 : -1;
  // "chapter 3 and verse 16", "Romans 8, verse 28"
  const joiner = (t.kind === 'word' && t.text === 'and') || (t.kind === 'sep' && t.text === ',');
  if (joiner && isVerseWord(wordAt(toks, i + 1)) && isNum(toks[i + 2])) return i + 2;
  return -1;
}

interface PointResult {
  pt: Point;
  next: number;
  adjacent: boolean;
  explicit: boolean;
}

function readPoint(
  toks: readonly Token[],
  i: number,
  curCh: number | null,
  level: 'chapter' | 'verse',
  adjacent: 'no' | 'yes' | 'only-one',
  isBookAt: (i: number) => boolean,
): PointResult | null {
  const t = toks[i];
  if (t === undefined) return null;
  if (t.kind === 'word' && CHAPTER_WORDS.has(t.text)) {
    const n = toks[i + 1];
    if (!isNum(n)) return null;
    const vt = verseTarget(toks, i + 2);
    const v = toks[vt];
    if (vt >= 0 && isNum(v))
      return { pt: { ch: n.value, v: v.value }, next: vt + 1, adjacent: false, explicit: true };
    return { pt: { ch: n.value, v: null }, next: i + 2, adjacent: false, explicit: true };
  }
  if (t.kind === 'word' && VERSE_WORDS.has(t.text)) {
    const n = toks[i + 1];
    if (curCh === null || !isNum(n)) return null;
    return { pt: { ch: curCh, v: n.value }, next: i + 2, adjacent: false, explicit: true };
  }
  if (!isNum(t)) return null;
  const vt = verseTarget(toks, i + 1);
  const v = toks[vt];
  if (vt >= 0 && isNum(v))
    return { pt: { ch: t.value, v: v.value }, next: vt + 1, adjacent: false, explicit: true };
  const nxt = toks[i + 1];
  const adjOk = adjacent === 'yes' || (adjacent === 'only-one' && t.value === 1);
  if (adjOk && isNum(nxt) && !isBookAt(i + 1)) {
    return { pt: { ch: t.value, v: nxt.value }, next: i + 2, adjacent: true, explicit: false };
  }
  if (level === 'verse' && curCh !== null) {
    return { pt: { ch: curCh, v: t.value }, next: i + 1, adjacent: false, explicit: false };
  }
  return { pt: { ch: t.value, v: null }, next: i + 1, adjacent: false, explicit: false };
}

function isRangeSep(t: Token | undefined): boolean {
  return (t?.kind === 'sep' && t.text === '-') || (t?.kind === 'word' && RANGE_WORDS.has(t.text));
}

function isListSep(t: Token | undefined): boolean {
  if (t?.kind === 'sep') return t.text === ',' || t.text === ';' || t.text === '&';
  return t?.kind === 'word' && t.text === 'and';
}

interface Item {
  start: Point;
  end: Point;
}

/** Reads "point [range point]" starting at i. */
function readItem(
  toks: readonly Token[],
  i: number,
  curCh: number | null,
  level: 'chapter' | 'verse',
  adjacent: 'no' | 'yes' | 'only-one',
  isBookAt: (i: number) => boolean,
): { item: Item; next: number; adjacent: boolean; explicit: boolean } | null {
  const s = readPoint(toks, i, curCh, level, adjacent, isBookAt);
  if (!s) return null;
  let end = s.pt;
  let next = s.next;
  if (isRangeSep(toks[next])) {
    const endLevel = s.pt.v === null ? 'chapter' : 'verse';
    // Spoken "one one through two three": if the start was bare "ch v", the end may be too.
    const e = readPoint(toks, next + 1, s.pt.ch, endLevel, s.adjacent ? 'yes' : 'no', isBookAt);
    if (e) {
      end = e.pt;
      next = e.next;
    }
  }
  return { item: { start: s.pt, end }, next, adjacent: s.adjacent, explicit: s.explicit };
}

function toPassage(book: BookId, it: Item): PassageRef {
  return {
    start: { book, chapter: it.start.ch, verse: it.start.v ?? 1 },
    end: { book, chapter: it.end.ch, verse: it.end.v ?? WHOLE_CHAPTER },
  };
}

function validVerse(v: number): boolean {
  return v === WHOLE_CHAPTER || (v >= 1 && v <= MAX_VERSE);
}

/** Rejects chapters beyond the book, verse 0, verses > 176 and backwards ranges. */
export function isValidPassage(p: PassageRef): boolean {
  const chapters = getBook(p.start.book).chapters;
  const { start: s, end: e } = p;
  if (s.chapter < 1 || s.chapter > chapters || e.chapter < 1 || e.chapter > chapters) return false;
  if (!validVerse(s.verse) || !validVerse(e.verse) || s.verse === WHOLE_CHAPTER) return false;
  return e.chapter > s.chapter || (e.chapter === s.chapter && e.verse >= s.verse);
}

/** Merges "16 and 17" into 16–17 so consecutive verses display as one range. */
function mergeConsecutive(list: readonly PassageRef[]): PassageRef[] {
  const out: PassageRef[] = [];
  for (const p of list) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.end.chapter === p.start.chapter &&
      prev.end.verse !== WHOLE_CHAPTER &&
      p.start.verse === prev.end.verse + 1
    ) {
      out[out.length - 1] = { start: prev.start, end: p.end };
    } else {
      out.push(p);
    }
  }
  return out;
}

/**
 * Parses the chapter/verse part for `book` starting at token i.
 * Returns null when no chapter/verse is present at all (book-only), and
 * `{ passages: [] }` when something was present but invalid (e.g. "John 22").
 */
export function parseTail(
  toks: readonly Token[],
  i: number,
  book: BookId,
  opts: TailOptions,
): TailResult | null {
  const single = getBook(book).chapters === 1;
  // One-chapter books (Jude, Obadiah, Philemon, 2–3 John): a bare number is a verse, and
  // "Jude 1 3" is the only adjacency that makes sense.
  const curCh = single && opts.curCh === null ? 1 : opts.curCh;
  const level = single ? 'verse' : opts.level;
  const adjacent = !opts.allowAdjacent ? 'no' : single ? 'only-one' : 'yes';

  const first = readItem(toks, i, curCh, level, adjacent, opts.isBookAt);
  if (!first) return null;
  const items: Item[] = [first.item];
  let next = first.next;
  let lastLevel: 'chapter' | 'verse' =
    first.item.end.v === null && first.item.start.v === null ? 'chapter' : 'verse';
  let lastCh = first.item.end.ch;

  while (items.length < MAX_ITEMS) {
    const sep = toks[next];
    if (!isListSep(sep) || opts.isBookAt(next + 1)) break;
    // Conventionally ';' starts a new chapter ("Rom 8:28; 9") while ',' continues verses.
    const lvl = sep?.kind === 'sep' && sep.text === ';' ? 'chapter' : lastLevel;
    const it = readItem(toks, next + 1, lastCh, lvl, 'no', opts.isBookAt);
    if (!it) break;
    items.push(it.item);
    next = it.next;
    lastLevel = it.item.end.v === null && it.item.start.v === null ? 'chapter' : 'verse';
    lastCh = it.item.end.ch;
  }

  const passages = items.map((it) => toPassage(book, it));
  const valid = passages.every(isValidPassage);
  return {
    passages: valid ? mergeConsecutive(passages) : [],
    next,
    hasVerse: items.some((it) => it.start.v !== null || it.end.v !== null),
    adjacent: first.adjacent,
    explicit: first.explicit,
  };
}

/**
 * Index after an optional "same chapter" / "the same chapter" lead-in, if what follows is a
 * chapter or verse keyword; -1 otherwise. Context references must start with a keyword because
 * a bare number in speech ("two of them") is far too ambiguous.
 */
export function contextStart(toks: readonly Token[], i: number): number {
  let p = i;
  if (wordAt(toks, p) === 'the') p += 1;
  if (wordAt(toks, p) === 'same' && isChapterWord(wordAt(toks, p + 1))) {
    p += 2;
    const t = toks[p];
    if (t?.kind === 'sep' && t.text === ',') p += 1;
    return isVerseWord(wordAt(toks, p)) && isNum(toks[p + 1]) ? p : -1;
  }
  if (p !== i) return -1;
  const w = wordAt(toks, p);
  if ((isVerseWord(w) || isChapterWord(w)) && isNum(toks[p + 1])) return p;
  return -1;
}

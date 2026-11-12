import type { BookId, PassageRef } from '@lampstand/core';
import { WHOLE_CHAPTER } from '@lampstand/core';
import { contextStart, parseTail, type TailResult } from './grammar';
import { matchBookAt, type BookMatch, type MatchMode } from './match';
import { tokenize, type Token } from './tokenize';

/** One ranked interpretation of a typed or spoken reference. */
export interface ReferenceCandidate {
  /** One or more passages ("Romans 8:28, 31-39" yields two). */
  readonly passages: PassageRef[];
  /** 0..1; candidates are returned best-first. */
  readonly confidence: number;
  /** The slice of the input that was interpreted. */
  readonly matched: string;
}

/** Current book/chapter used to resolve "verse 18" or "chapter 4 verse 2". */
export interface ReferenceContext {
  readonly book: BookId;
  readonly chapter: number;
}

export interface ParseOptions {
  /** Alias language (falls back to English). Default 'en'. */
  readonly lang?: string;
  readonly context?: ReferenceContext;
}

// Confidence model. Absolute values matter less than ordering; they are tuned so that a clean
// "John 3:16" sits near the top, partial/ambiguous input lands mid-range and book-only input
// (useful for the quick bar, never for auto-detection) stays low.
const CONF_VERSE_EXPLICIT = 0.95;
const CONF_VERSE_ADJACENT = 0.9;
const CONF_CHAPTER = 0.85;
const CONF_BOOK_ONLY = 0.4;
const CONF_CONTEXT_VERSE = 0.85;
const CONF_CONTEXT_CHAPTER = 0.7;
/** Unrecognised trailing words suggest we only understood part of the input. */
const LEFTOVER_FACTOR = 0.6;
/** Bare "corinthians"/"kings" etc.: first book is likelier but genuinely ambiguous. */
const BARE_FAMILY_FACTOR = 0.75;

/**
 * Numbered siblings offered as alternatives when the user did not say which one. "john" is
 * special: on its own it means the Gospel, so its siblings are only faint alternatives.
 */
const FAMILY: Partial<
  Record<BookId, { siblings: readonly BookId[]; factor: number; primary: number }>
> = {
  JHN: { siblings: ['1JN', '2JN', '3JN'], factor: 0.3, primary: 1 },
  '1SA': { siblings: ['2SA'], factor: 0.6, primary: BARE_FAMILY_FACTOR },
  '1KI': { siblings: ['2KI'], factor: 0.6, primary: BARE_FAMILY_FACTOR },
  '1CH': { siblings: ['2CH'], factor: 0.6, primary: BARE_FAMILY_FACTOR },
  '1CO': { siblings: ['2CO'], factor: 0.6, primary: BARE_FAMILY_FACTOR },
  '1TH': { siblings: ['2TH'], factor: 0.6, primary: BARE_FAMILY_FACTOR },
  '1TI': { siblings: ['2TI'], factor: 0.6, primary: BARE_FAMILY_FACTOR },
  '1PE': { siblings: ['2PE'], factor: 0.6, primary: BARE_FAMILY_FACTOR },
};

/** Books to try for a match, each with a multiplier reflecting how sure we are of the book. */
export function bookChoices(m: BookMatch): { id: BookId; factor: number }[] {
  if (!m.exact) {
    // Prefix guesses: the top-ranked guess is still a guess; later ones decay.
    const unique = m.books.length === 1;
    return m.books.map((id, r) => ({ id, factor: unique ? 0.85 : Math.max(0.2, 0.75 - 0.08 * r) }));
  }
  const id = m.books[0];
  if (id === undefined) return [];
  const fam = m.numbered ? undefined : FAMILY[id];
  if (!fam) return [{ id, factor: 1 }];
  return [
    { id, factor: fam.primary },
    ...fam.siblings.map((s) => ({ id: s, factor: fam.primary * fam.factor })),
  ];
}

/** Builds an `isBookAt` probe so list parsing stops before "..., 1 Cor 13". */
export function bookProbe(toks: readonly Token[], lang: string | undefined, mode: MatchMode) {
  return (i: number): boolean =>
    matchBookAt(toks, i, { ...(lang !== undefined ? { lang } : {}), mode }) !== null;
}

function tailConfidence(t: TailResult): number {
  if (!t.hasVerse) return CONF_CHAPTER;
  return t.adjacent ? CONF_VERSE_ADJACENT : CONF_VERSE_EXPLICIT;
}

/** Leftover words/numbers (not mere trailing punctuation) after what we understood. */
function hasLeftovers(toks: readonly Token[], from: number): boolean {
  return toks.slice(from).some((t) => t.kind !== 'sep');
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Parses a scripture reference typed into the quick bar or produced by speech-to-text.
 *
 * Returns ranked candidates (best first), or an empty array if nothing plausible was found.
 * Behaviour notes:
 * - Book only ("jn", "romans") → chapter 1 as a whole chapter at low confidence (0.4), so the
 *   quick bar can preview immediately while the user keeps typing.
 * - Whole chapters ("Ps 23") use `end.verse = WHOLE_CHAPTER`.
 * - One-chapter books treat a bare number as a verse ("Jude 3" = Jude 1:3).
 * - Impossible chapters/verses (beyond the book, verse > 176, backwards ranges) are rejected.
 * - Partial names rank by popularity ("jo" → John, then Joshua/Job/...).
 * - With `opts.context`, "verse 18", "verses 20 to 22", "same chapter verse 20" and
 *   "chapter 4 verse 2" resolve against the context book/chapter.
 */
export function parseReference(input: string, opts: ParseOptions = {}): ReferenceCandidate[] {
  const toks = tokenize(input);
  const first = toks[0];
  if (first === undefined) return [];
  const lang = opts.lang;
  const isBookAt = bookProbe(toks, lang, 'parse');
  const matchedText = (endTok: number): string => {
    const last = toks[Math.max(0, endTok - 1)];
    return input.slice(first.start, last ? last.end : first.end);
  };

  const ctx = opts.context;
  if (ctx) {
    const cs = contextStart(toks, 0);
    if (cs >= 0) {
      const t = parseTail(toks, cs, ctx.book, {
        curCh: ctx.chapter,
        level: 'verse',
        allowAdjacent: false,
        isBookAt,
      });
      if (t && t.passages.length > 0) {
        const base = t.hasVerse ? CONF_CONTEXT_VERSE : CONF_CONTEXT_CHAPTER;
        const conf = hasLeftovers(toks, t.next) ? base * LEFTOVER_FACTOR : base;
        return [{ passages: t.passages, confidence: round(conf), matched: matchedText(t.next) }];
      }
    }
  }

  const m = matchBookAt(toks, 0, { ...(lang !== undefined ? { lang } : {}), mode: 'parse' });
  if (!m) return [];

  const out: ReferenceCandidate[] = [];
  for (const { id, factor } of bookChoices(m)) {
    const t = parseTail(toks, m.next, id, {
      curCh: null,
      level: 'chapter',
      allowAdjacent: true,
      isBookAt,
    });
    let passages: PassageRef[];
    let base: number;
    let next: number;
    if (t === null) {
      passages = [
        {
          start: { book: id, chapter: 1, verse: 1 },
          end: { book: id, chapter: 1, verse: WHOLE_CHAPTER },
        },
      ];
      base = CONF_BOOK_ONLY;
      next = m.next;
    } else {
      if (t.passages.length === 0) {
        // Siblings are alternatives to a valid reading, never substitutes: "John 22" must not
        // turn into "2 John 22". Prefix guesses, by contrast, are independent options.
        if (m.exact) break;
        continue;
      }
      passages = t.passages;
      base = tailConfidence(t);
      next = t.next;
    }
    const conf = base * factor * (hasLeftovers(toks, next) ? LEFTOVER_FACTOR : 1);
    out.push({ passages, confidence: round(conf), matched: matchedText(next) });
  }
  // Stable sort keeps popularity order among equal confidences.
  return out.sort((a, b) => b.confidence - a.confidence);
}

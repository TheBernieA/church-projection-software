import type { BookId } from '@lampstand/core';
import { lookupAlias, lookupAliasPrefix } from './aliases';
import { bookIndex } from './books';
import { isNum, wordAt, type Token } from './tokenize';

/**
 * Book-name recognition over a token stream. Shared by the quick-bar parser ("parse" mode:
 * abbreviations and partial prefixes allowed) and the transcript scanner ("find" mode: only
 * spoken-safe full names, no prefixes, no roman numerals) so the two can never disagree about
 * what a book name is.
 */
export type MatchMode = 'parse' | 'find';

export interface BookMatch {
  /** Candidate books, best first. Exact matches have one entry; prefix matches may have many. */
  readonly books: readonly BookId[];
  /** True for an exact alias hit; false for a quick-bar prefix guess. */
  readonly exact: boolean;
  /** Whether an explicit number prefix ("1", "first", "I") was part of the match. */
  readonly numbered: boolean;
  /** The normalized alias key that matched (without number prefix). */
  readonly name: string;
  /** Index of the first token after the book name. */
  readonly next: number;
}

const ROMAN = new Map<string, number>([
  ['i', 1],
  ['ii', 2],
  ['iii', 3],
]);
const FILLER_HEADS = new Set(['book', 'books', 'gospel', 'epistle', 'letter']);
const MAX_NAME_WORDS = 4;
/** Prefixes shorter than this match too many books to be useful. */
const MIN_PREFIX_LETTERS = 2;

/**
 * Rough "how often is this preached / looked up" ordering used only to rank ambiguous prefix
 * matches ("jo" → John before Job/Joel/Jonah/Joshua). Books not listed fall back to canonical
 * order after these.
 */
const POPULARITY: readonly BookId[] = [
  'JHN',
  'PSA',
  'ROM',
  'MAT',
  'GEN',
  'PRO',
  'ISA',
  'LUK',
  'MRK',
  'ACT',
  'HEB',
  'EPH',
  'PHP',
  '1CO',
  'REV',
  'JAS',
  'GAL',
  'JER',
  'EXO',
  'JOS',
  'JOB',
  '1JN',
  'COL',
  'DAN',
  '1PE',
  'DEU',
];

function popularity(id: BookId): number {
  const i = POPULARITY.indexOf(id);
  return i >= 0 ? i : POPULARITY.length + bookIndex(id);
}

interface Prefix {
  readonly n: number;
  readonly next: number;
}

function readNumberPrefix(toks: readonly Token[], i: number, mode: MatchMode): Prefix | null {
  const t = toks[i];
  const after = toks[i + 1];
  // The prefix must be directly followed by a word; "John 3:16, 1 Cor" relies on the comma
  // NOT being skipped here so "First, John 3:16" never becomes 1 John.
  if (after?.kind !== 'word') return null;
  if (isNum(t) && t.value >= 1 && t.value <= 3) return { n: t.value, next: i + 1 };
  // Roman numerals are a typed convention; in speech "I" is a pronoun ("I John saw...").
  if (mode === 'parse' && t?.kind === 'word') {
    const r = ROMAN.get(t.text);
    if (r !== undefined) return { n: r, next: i + 1 };
  }
  return null;
}

/** Skips "book of", "gospel of/according to", "epistle to the", "letter of" (+ "saint"). */
function skipFiller(toks: readonly Token[], i: number): number {
  const head = wordAt(toks, i);
  if (head === undefined || !FILLER_HEADS.has(head)) return i;
  let p = i + 1;
  const w = wordAt(toks, p);
  if (w === 'of' || w === 'to') p += 1;
  else if (w === 'according' && wordAt(toks, p + 1) === 'to') p += 2;
  else return i;
  if (wordAt(toks, p) === 'the') p += 1;
  const s = wordAt(toks, p);
  if (s === 'st' || s === 'saint') p += 1;
  return p;
}

/**
 * Tries to recognise a book name starting exactly at token `i`. Returns null if none.
 * Handles: number prefixes, "the"/"book of"-style filler, multi-word names (longest wins),
 * and — in parse mode only — partial prefixes ranked by popularity.
 */
export function matchBookAt(
  toks: readonly Token[],
  i: number,
  opts: { lang?: string; mode: MatchMode },
): BookMatch | null {
  let p = i;
  if (wordAt(toks, p) === 'the') p += 1;
  let prefix = readNumberPrefix(toks, p, opts.mode);
  if (prefix) p = prefix.next;
  const afterFiller = skipFiller(toks, p);
  if (afterFiller !== p) {
    p = afterFiller;
    // "the first book of Kings" puts the number before the filler, "book of 1 Kings" after.
    if (!prefix) {
      prefix = readNumberPrefix(toks, p, opts.mode);
      if (prefix) p = prefix.next;
    }
  }

  const words: string[] = [];
  for (let j = p; j < toks.length && words.length < MAX_NAME_WORDS; j++) {
    const w = wordAt(toks, j);
    if (w === undefined) break;
    words.push(w);
  }
  if (words.length === 0) return null;
  const keyFor = (n: number): string => {
    const name = words.slice(0, n).join(' ');
    return prefix ? `${String(prefix.n)} ${name}` : name;
  };

  const spokenOnly = opts.mode === 'find';
  for (let n = words.length; n >= 1; n--) {
    const id = lookupAlias(keyFor(n), {
      ...(opts.lang !== undefined ? { lang: opts.lang } : {}),
      spokenOnly,
    });
    if (id !== undefined) {
      return {
        books: [id],
        exact: true,
        numbered: prefix !== null,
        name: words.slice(0, n).join(' '),
        next: p + n,
      };
    }
  }

  if (opts.mode === 'parse') {
    const first = words[0] ?? '';
    if (first.replace(/[^\p{L}]/gu, '').length < MIN_PREFIX_LETTERS) return null;
    for (let n = words.length; n >= 1; n--) {
      const hits = lookupAliasPrefix(keyFor(n), opts.lang !== undefined ? { lang: opts.lang } : {});
      if (hits.length > 0) {
        hits.sort((a, b) => popularity(a) - popularity(b));
        return {
          books: hits,
          exact: false,
          numbered: prefix !== null,
          name: words.slice(0, n).join(' '),
          next: p + n,
        };
      }
    }
  }
  return null;
}

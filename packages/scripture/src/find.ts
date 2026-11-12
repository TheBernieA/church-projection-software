import type { BookId, PassageRef } from '@lampstand/core';
import { contextStart, parseTail } from './grammar';
import { matchBookAt } from './match';
import { bookChoices, bookProbe, type ReferenceContext } from './parse';
import { tokenize } from './tokenize';

/** A reference spotted in free text, with its character span in the original string. */
export interface FoundReference {
  readonly passages: PassageRef[];
  readonly confidence: number;
  /** Inclusive start / exclusive end offsets into the scanned text. */
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export interface FindOptions {
  readonly lang?: string;
  /** Book/chapter currently being preached; updated internally after each detection. */
  readonly context?: ReferenceContext;
}

/**
 * Book names that are also everyday words or common first names. They are only ever detected
 * with a following number (true for every book here), and a bare chapter ("Mark 2") gets a low
 * score because "I gave Mark 2 dollars" is plausible speech.
 */
const COMMON_WORD_NAMES = new Set([
  'mark',
  'job',
  'acts',
  'numbers',
  'judges',
  'lamentations',
  'revelation',
  'kings',
  'james',
  'ruth',
]);

// Transcript confidences: precision matters more than recall in auto mode (BUILD_SPEC §10).
const CONF_VERSE_EXPLICIT = 0.9;
const CONF_VERSE_ADJACENT = 0.8;
const CONF_CHAPTER_EXPLICIT = 0.75;
const CONF_CHAPTER_BARE = 0.6;
const COMMON_WORD_FACTOR_CHAPTER = 0.55;
const COMMON_WORD_FACTOR_VERSE = 0.85;
const CONF_CONTEXT_VERSE = 0.75;
const CONF_CONTEXT_CHAPTER = 0.5;

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Scans a speech transcript (or any free text) for explicit scripture references:
 * "turn with me to John chapter 3 verse 16", "first Corinthians thirteen four to seven".
 *
 * - Only spoken-safe book names are recognised (no "is"/"am"/"ex" abbreviations), and a book
 *   name must be followed by a chapter number, so "Mark my words" or "a job interview" never
 *   match.
 * - With `opts.context` — and after each detection, which becomes the new context — phrases
 *   like "verse 18", "let's continue to verse 18" or "same chapter verse 20" resolve against the
 *   current book/chapter (BUILD_SPEC §10.2 A).
 */
export function findReferencesInText(text: string, opts: FindOptions = {}): FoundReference[] {
  const toks = tokenize(text);
  const lang = opts.lang;
  const isBookAt = bookProbe(toks, lang, 'find');
  const found: FoundReference[] = [];
  let ctx = opts.context;

  const push = (passages: PassageRef[], confidence: number, from: number, to: number): void => {
    const a = toks[from];
    const b = toks[to - 1];
    if (!a || !b) return;
    found.push({
      passages,
      confidence: round(confidence),
      start: a.start,
      end: b.end,
      text: text.slice(a.start, b.end),
    });
    const last = passages[passages.length - 1];
    if (last) ctx = { book: last.end.book, chapter: last.end.chapter };
  };

  let i = 0;
  while (i < toks.length) {
    const m = matchBookAt(toks, i, { ...(lang !== undefined ? { lang } : {}), mode: 'find' });
    if (m) {
      const choice = bookChoices(m)[0];
      const id: BookId | undefined = choice?.id;
      const t = id
        ? parseTail(toks, m.next, id, {
            curCh: null,
            level: 'chapter',
            allowAdjacent: true,
            isBookAt,
          })
        : null;
      if (choice && t && t.passages.length > 0) {
        let conf = t.hasVerse
          ? t.adjacent
            ? CONF_VERSE_ADJACENT
            : CONF_VERSE_EXPLICIT
          : t.explicit
            ? CONF_CHAPTER_EXPLICIT
            : CONF_CHAPTER_BARE;
        if (!m.numbered && COMMON_WORD_NAMES.has(m.name) && !t.explicit) {
          conf *= t.hasVerse ? COMMON_WORD_FACTOR_VERSE : COMMON_WORD_FACTOR_CHAPTER;
        }
        // Bare "Corinthians 13": right family, uncertain which letter.
        conf *= Math.min(1, choice.factor);
        push(t.passages, conf, i, t.next);
        i = t.next;
        continue;
      }
    }
    if (ctx) {
      const cs = contextStart(toks, i);
      if (cs >= 0) {
        const t = parseTail(toks, cs, ctx.book, {
          curCh: ctx.chapter,
          level: 'verse',
          allowAdjacent: false,
          isBookAt,
        });
        if (t && t.passages.length > 0) {
          push(t.passages, t.hasVerse ? CONF_CONTEXT_VERSE : CONF_CONTEXT_CHAPTER, i, t.next);
          i = t.next;
          continue;
        }
      }
    }
    i += 1;
  }
  return found;
}

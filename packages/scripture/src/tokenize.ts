import { readNumberPhrase } from './numbers';

/**
 * Internal token stream shared by the reference parser and the transcript scanner. Every token
 * carries offsets into the ORIGINAL string so the scanner can report exact character spans
 * even after number words have been collapsed into digits.
 */
export type Token =
  | { kind: 'num'; value: number; ordinal: boolean; start: number; end: number }
  | { kind: 'word'; text: string; start: number; end: number }
  | { kind: 'sep'; text: Sep; start: number; end: number };

export type Sep = ':' | '.' | ',' | ';' | '-' | '&';
export type NumToken = Extract<Token, { kind: 'num' }>;

// digits | words (letters, combining marks, apostrophes, inner hyphens) | punctuation we use.
// All dash variants (hyphen, en/em dash, minus, tilde) collapse to '-' so ranges typed on any
// keyboard or pasted from a document behave identically.
// Linear: alternatives are disjoint character classes separated by a literal hyphen.
const TOKEN_RE =
  // eslint-disable-next-line security/detect-unsafe-regex
  /(\d+)|([\p{L}\p{M}'’]+(?:-[\p{L}\p{M}'’]+)*)|([:.,;&])|([-‐-―−~])/gu;

const ORDINAL_SUFFIX = new Set(['st', 'nd', 'rd', 'th']);
const MAX_NUMBER_WORDS = 6;

function normalizeWord(raw: string): string {
  return raw.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/’/gu, "'");
}

/** Splits text into tokens, collapsing spoken numbers ("twenty-three") into num tokens. */
export function tokenize(text: string): Token[] {
  const raw: Token[] = [];
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(text); m !== null; m = TOKEN_RE.exec(text)) {
    const start = m.index;
    const end = start + m[0].length;
    const prev = raw[raw.length - 1];
    if (m[1] !== undefined) {
      raw.push({ kind: 'num', value: Number.parseInt(m[1], 10), ordinal: false, start, end });
    } else if (m[2] !== undefined) {
      const word = normalizeWord(m[2]);
      // "1st", "2nd": fold the suffix into the number so "1st Corinthians" works.
      if (prev?.kind === 'num' && prev.end === start && ORDINAL_SUFFIX.has(word)) {
        raw[raw.length - 1] = { ...prev, ordinal: true, end };
        continue;
      }
      raw.push({ kind: 'word', text: word, start, end });
    } else if (m[3] !== undefined) {
      // A period glued to a word is an abbreviation mark ("Jn.", "Matt.", "St."), not a
      // chapter:verse separator, so drop it. "3.16" keeps its period (it follows a number).
      if (m[3] === '.' && prev?.kind === 'word' && prev.end === start) continue;
      raw.push({ kind: 'sep', text: m[3] as Sep, start, end });
    } else {
      raw.push({ kind: 'sep', text: '-', start, end });
    }
  }
  return mergeNumberWords(raw);
}

function mergeNumberWords(raw: readonly Token[]): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < raw.length) {
    const t = raw[i];
    if (t === undefined) break;
    if (t.kind !== 'word') {
      out.push(t);
      i += 1;
      continue;
    }
    // Collect the run of consecutive word tokens (punctuation breaks a number phrase).
    const run: Extract<Token, { kind: 'word' }>[] = [];
    for (let j = i; j < raw.length && run.length < MAX_NUMBER_WORDS; j++) {
      const w = raw[j];
      if (w?.kind !== 'word') break;
      run.push(w);
    }
    const phrase = readNumberPhrase(
      run.map((w) => w.text),
      0,
    );
    const last = phrase ? run[phrase.length - 1] : undefined;
    if (phrase && last) {
      out.push({
        kind: 'num',
        value: phrase.value,
        ordinal: phrase.ordinal,
        start: t.start,
        end: last.end,
      });
      i += phrase.length;
    } else {
      out.push(t);
      i += 1;
    }
  }
  return out;
}

/** Type guard used throughout the grammar. */
export function isNum(t: Token | undefined): t is NumToken {
  return t?.kind === 'num';
}

/** The normalized word at a position, or undefined if it is not a word. */
export function wordAt(toks: readonly Token[], i: number): string | undefined {
  const t = toks[i];
  return t?.kind === 'word' ? t.text : undefined;
}

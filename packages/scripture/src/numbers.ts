/**
 * English spoken-number handling. Speech-to-text engines frequently emit "twenty-three" or
 * "one hundred and nineteen" instead of digits, so references only become parseable once these
 * phrases are collapsed into numbers.
 *
 * Deliberately conservative: only phrases that unambiguously form ONE number are merged. In
 * particular "three sixteen" stays as two numbers (3 and 16) because that is how people say
 * "John 3:16" aloud — merging it into 19 would destroy the reference.
 */

// Maps (not object literals) so lookups like "constructor" can never hit Object.prototype.
const UNITS = new Map<string, number>([
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
]);
const TEENS = new Map<string, number>([
  ['ten', 10],
  ['eleven', 11],
  ['twelve', 12],
  ['thirteen', 13],
  ['fourteen', 14],
  ['fifteen', 15],
  ['sixteen', 16],
  ['seventeen', 17],
  ['eighteen', 18],
  ['nineteen', 19],
]);
const TENS = new Map<string, number>([
  ['twenty', 20],
  ['thirty', 30],
  ['forty', 40],
  ['fourty', 40],
  ['fifty', 50],
  ['sixty', 60],
  ['seventy', 70],
  ['eighty', 80],
  ['ninety', 90],
]);
const ORD_UNITS = new Map<string, number>([
  ['first', 1],
  ['second', 2],
  ['third', 3],
  ['fourth', 4],
  ['fifth', 5],
  ['sixth', 6],
  ['seventh', 7],
  ['eighth', 8],
  ['ninth', 9],
]);
const ORD_TEENS = new Map<string, number>([
  ['tenth', 10],
  ['eleventh', 11],
  ['twelfth', 12],
  ['thirteenth', 13],
  ['fourteenth', 14],
  ['fifteenth', 15],
  ['sixteenth', 16],
  ['seventeenth', 17],
  ['eighteenth', 18],
  ['nineteenth', 19],
]);
const ORD_TENS = new Map<string, number>([
  ['twentieth', 20],
  ['thirtieth', 30],
  ['fortieth', 40],
  ['fiftieth', 50],
  ['sixtieth', 60],
  ['seventieth', 70],
  ['eightieth', 80],
  ['ninetieth', 90],
]);

/** A parsed number phrase. `ordinal` is true when the phrase ends in an ordinal ("sixteenth"). */
export interface NumberValue {
  readonly value: number;
  readonly ordinal: boolean;
}

function single(word: string): NumberValue | null {
  const card = UNITS.get(word) ?? TEENS.get(word) ?? TENS.get(word);
  if (card !== undefined) return { value: card, ordinal: false };
  const ord = ORD_UNITS.get(word) ?? ORD_TEENS.get(word) ?? ORD_TENS.get(word);
  if (ord !== undefined) return { value: ord, ordinal: true };
  return null;
}

/** Parses 1..99 from exactly the given parts, or null. */
function belowHundred(parts: readonly string[]): NumberValue | null {
  const [a, b] = parts;
  if (a === undefined) return null;
  if (parts.length === 1) return single(a);
  if (parts.length !== 2 || b === undefined) return null;
  const tens = TENS.get(a);
  if (tens === undefined) return null;
  const unit = UNITS.get(b);
  if (unit !== undefined) return { value: tens + unit, ordinal: false };
  const ordUnit = ORD_UNITS.get(b);
  if (ordUnit !== undefined) return { value: tens + ordUnit, ordinal: true };
  return null;
}

/** Parses a complete phrase (already split into lowercase parts) or returns null. */
function parseParts(parts: readonly string[]): NumberValue | null {
  const [p0, p1] = parts;
  if (p0 === undefined) return null;
  let i = 0;
  let total = 0;
  let hundredOrdinal = false;
  if (p1 !== undefined && (p1 === 'hundred' || p1 === 'hundredth')) {
    const mult = p0 === 'a' ? 1 : UNITS.get(p0);
    if (mult === undefined) return null;
    total = mult * 100;
    hundredOrdinal = p1 === 'hundredth';
    i = 2;
  } else if (p0 === 'hundred' || p0 === 'hundredth') {
    total = 100;
    hundredOrdinal = p0 === 'hundredth';
    i = 1;
  }
  if (i > 0) {
    if (i === parts.length) return { value: total, ordinal: hundredOrdinal };
    if (hundredOrdinal) return null;
    // "one hundred AND nineteen": the "and" is only part of the number when more follows.
    if (parts[i] === 'and') {
      i += 1;
      if (i === parts.length) return null;
    }
  }
  const rest = belowHundred(parts.slice(i));
  if (!rest) return null;
  return { value: total + rest.value, ordinal: rest.ordinal };
}

function splitParts(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s-]+/u)
    .filter((p) => p.length > 0);
}

/**
 * Converts a whole spoken-number phrase to a number: "twenty-three" → 23,
 * "one hundred and nineteen" → 119, "a hundred" → 100, "sixteenth" → 16. Digit strings are
 * accepted as-is. Returns null if the text is not entirely one number.
 */
export function wordsToNumber(text: string): number | null {
  const trimmed = text.trim();
  if (/^\d+$/u.test(trimmed)) return Number.parseInt(trimmed, 10);
  return parseParts(splitParts(trimmed))?.value ?? null;
}

/** Longest number phrase considered; "one hundred and twenty three" is the longest needed. */
const MAX_PHRASE_WORDS = 6;

/**
 * Reads the longest number phrase starting at `words[start]`. Words may themselves contain
 * hyphens ("twenty-three"). Returns the value and how many words it consumed, or null.
 */
export function readNumberPhrase(
  words: readonly string[],
  start: number,
): (NumberValue & { readonly length: number }) | null {
  const max = Math.min(MAX_PHRASE_WORDS, words.length - start);
  // Longest-first so "twenty three" wins over "twenty" followed by a stray "three".
  for (let len = max; len >= 1; len--) {
    const parts = words.slice(start, start + len).flatMap((w) => splitParts(w));
    const r = parseParts(parts);
    if (r) return { ...r, length: len };
  }
  return null;
}

/**
 * Replaces spoken number phrases in free text with digits, leaving everything else untouched:
 * "John three sixteen" → "John 3 16", "Psalm one hundred and nineteen" → "Psalm 119".
 * Ordinals become plain digits ("first John" → "1 John").
 */
export function normalizeSpokenNumbers(text: string): string {
  // Linear: hyphen-separated letter runs cannot overlap, so no catastrophic backtracking.
  // eslint-disable-next-line security/detect-unsafe-regex
  const re = /[A-Za-z]+(?:-[A-Za-z]+)*/gu;
  const words: { text: string; start: number; end: number }[] = [];
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    words.push({ text: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  let out = '';
  let cursor = 0;
  let i = 0;
  while (i < words.length) {
    // Only words separated purely by whitespace may form one phrase; punctuation breaks it.
    let runEnd = i + 1;
    while (runEnd < words.length) {
      const prev = words[runEnd - 1];
      const cur = words[runEnd];
      if (!prev || !cur || !/^\s+$/u.test(text.slice(prev.end, cur.start))) break;
      runEnd += 1;
    }
    const run = words.slice(i, runEnd);
    const texts = run.map((w) => w.text);
    let j = 0;
    while (j < run.length) {
      const r = readNumberPhrase(texts, j);
      const first = run[j];
      const last = r ? run[j + r.length - 1] : undefined;
      if (r && first && last) {
        out += text.slice(cursor, first.start) + String(r.value);
        cursor = last.end;
        j += r.length;
      } else {
        j += 1;
      }
    }
    i = runEnd;
  }
  return out + text.slice(cursor);
}

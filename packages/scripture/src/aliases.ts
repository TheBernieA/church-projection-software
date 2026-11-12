import type { BookId } from '@lampstand/core';
import { BOOKS } from './books';

/**
 * Book-name alias tables, keyed by language then by normalized alias (see
 * {@link normalizeAliasKey}). Numbered books are stored with a digit prefix ("1 cor"); the
 * matcher turns "1st", "first", "I", "one" etc. into that digit before lookup, so tables never
 * need to spell out ordinal variants.
 */
export const ALIASES: Record<string, Record<string, BookId>> = {};

/**
 * Aliases that are safe to recognise in free speech (full names and spoken forms such as
 * "song of songs"). Short abbreviations like "is", "am", "ex", "mt" are valid in the typed quick
 * bar but would produce false positives in a transcript, so the transcript scanner only uses
 * this subset.
 */
const SPOKEN: Record<string, Set<string>> = {};

const ORDINAL_PREFIX = new Map<string, string>([
  ['1', '1'],
  ['1st', '1'],
  ['first', '1'],
  ['i', '1'],
  ['one', '1'],
  ['2', '2'],
  ['2nd', '2'],
  ['second', '2'],
  ['ii', '2'],
  ['two', '2'],
  ['3', '3'],
  ['3rd', '3'],
  ['third', '3'],
  ['iii', '3'],
  ['three', '3'],
]);

/**
 * Normalizes an alias for table lookup: lowercase, diacritics stripped (so "Ésaïe" = "esaie"),
 * periods dropped, digits split from letters ("1cor" → "1 cor") and a leading ordinal turned
 * into a digit ("First John" → "1 john").
 */
export function normalizeAliasKey(alias: string): string {
  const words = alias
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[.]/gu, ' ')
    .replace(/(\d)(?!(?:st|nd|rd|th)(?:\s|$))(\p{L})/gu, '$1 $2')
    .split(/\s+/u)
    .filter((w) => w.length > 0);
  const first = words[0];
  if (first !== undefined && words.length > 1) {
    const digit = ORDINAL_PREFIX.get(first);
    if (digit !== undefined) words[0] = digit;
  }
  return words.join(' ');
}

/**
 * Adds (or overrides) aliases for a language. Keys are normalized, so callers may pass display
 * forms like "1 Corinthiens". Mark `spoken: true` for full names that are safe to detect in
 * speech transcripts; abbreviations should stay typed-only.
 */
export function registerAliases(
  lang: string,
  map: Readonly<Record<string, BookId>>,
  opts: { spoken?: boolean } = {},
): void {
  const table = (ALIASES[lang] ??= {});
  const spoken = (SPOKEN[lang] ??= new Set<string>());
  for (const [alias, id] of Object.entries(map)) {
    const key = normalizeAliasKey(alias);
    if (key.length === 0) continue;
    table[key] = id;
    if (opts.spoken === true) spoken.add(key);
  }
}

function tablesFor(lang: string): string[] {
  return lang === 'en' ? ['en'] : [lang, 'en'];
}

/**
 * Exact alias lookup for an already-normalized key. Falls back to English for other languages
 * because English abbreviations are common in multilingual congregations.
 */
export function lookupAlias(
  key: string,
  opts: { lang?: string; spokenOnly?: boolean } = {},
): BookId | undefined {
  for (const lang of tablesFor(opts.lang ?? 'en')) {
    const table = ALIASES[lang];
    if (!table || !Object.hasOwn(table, key)) continue;
    if (opts.spokenOnly === true && SPOKEN[lang]?.has(key) !== true) continue;
    return table[key];
  }
  return undefined;
}

/** All distinct books with an alias starting with `prefix` (unranked, table order). */
export function lookupAliasPrefix(prefix: string, opts: { lang?: string } = {}): BookId[] {
  const found = new Set<BookId>();
  for (const lang of tablesFor(opts.lang ?? 'en')) {
    const table = ALIASES[lang];
    if (!table) continue;
    for (const [key, id] of Object.entries(table)) {
      if (key.startsWith(prefix)) found.add(id);
    }
  }
  return [...found];
}

// --- English -----------------------------------------------------------------------------

// Typed abbreviations and alternate names. Canonical names are added from BOOKS below.
const EN_TYPED: Partial<Record<BookId, readonly string[]>> = {
  GEN: ['gen', 'ge', 'gn'],
  EXO: ['exod', 'exo', 'ex'],
  LEV: ['lev', 'le', 'lv'],
  NUM: ['num', 'nu', 'nm', 'nb'],
  DEU: ['deut', 'deu', 'dt', 'de'],
  JOS: ['josh', 'jos', 'jsh'],
  JDG: ['judg', 'jdg', 'jdgs', 'jg'],
  RUT: ['rut', 'ru', 'rth'],
  '1SA': ['1 sam', '1 sa', '1 sm', 'sam'],
  '2SA': ['2 sam', '2 sa', '2 sm'],
  '1KI': ['1 kgs', '1 ki', '1 kin', '1 kg', 'kgs'],
  '2KI': ['2 kgs', '2 ki', '2 kin', '2 kg'],
  '1CH': ['1 chron', '1 chr', '1 ch', 'chron'],
  '2CH': ['2 chron', '2 chr', '2 ch'],
  EZR: ['ezr'],
  NEH: ['neh', 'ne'],
  EST: ['esth', 'est', 'es'],
  JOB: ['jb'],
  PSA: ['ps', 'psa', 'pss', 'psm', 'pslm', 'psalter'],
  PRO: ['prov', 'pro', 'prv', 'pr'],
  ECC: ['eccl', 'eccles', 'eccle', 'ecc', 'ec', 'qoh'],
  SNG: ['song of sol', 'song', 'songs', 'sos', 'sng', 'cant', 'canticle of canticles'],
  ISA: ['isa', 'is'],
  JER: ['jer', 'je', 'jr'],
  LAM: ['lam', 'la'],
  EZK: ['ezek', 'eze', 'ezk'],
  DAN: ['dan', 'da', 'dn'],
  HOS: ['hos', 'ho'],
  JOL: ['jl', 'joe'],
  AMO: ['am', 'amo'],
  OBA: ['obad', 'oba', 'ob'],
  JON: ['jon', 'jnh'],
  MIC: ['mic', 'mc'],
  NAM: ['nah', 'na'],
  HAB: ['hab', 'hb'],
  ZEP: ['zeph', 'zep', 'zp'],
  HAG: ['hag', 'hg'],
  ZEC: ['zech', 'zec', 'zc'],
  MAL: ['mal', 'ml'],
  MAT: ['matt', 'mat', 'mt'],
  MRK: ['mrk', 'mk', 'mr'],
  LUK: ['luk', 'lk'],
  JHN: ['jn', 'jhn', 'joh'],
  ACT: ['act', 'ac'],
  ROM: ['rom', 'ro', 'rm'],
  '1CO': ['1 cor', '1 co', 'cor'],
  '2CO': ['2 cor', '2 co'],
  GAL: ['gal', 'ga'],
  EPH: ['eph', 'ephes'],
  PHP: ['phil', 'php', 'philip', 'pp'],
  COL: ['col'],
  '1TH': ['1 thess', '1 thes', '1 th', 'thess'],
  '2TH': ['2 thess', '2 thes', '2 th'],
  '1TI': ['1 tim', '1 ti', 'tim'],
  '2TI': ['2 tim', '2 ti'],
  TIT: ['tit'],
  PHM: ['philem', 'phm', 'phlm', 'phile'],
  HEB: ['heb'],
  JAS: ['jas', 'jm', 'jam'],
  '1PE': ['1 pet', '1 pe', '1 pt', 'pet'],
  '2PE': ['2 pet', '2 pe', '2 pt'],
  '1JN': ['1 jn', '1 jhn', '1 joh', '1 jo'],
  '2JN': ['2 jn', '2 jhn', '2 joh', '2 jo'],
  '3JN': ['3 jn', '3 jhn', '3 joh', '3 jo'],
  JUD: ['jd'],
  REV: ['rev', 're', 'rv'],
};

// Spoken alternatives that are safe in transcripts. Bare family names ("corinthians", "kings")
// resolve to the first book; the parser adds the sibling books as lower-ranked alternatives.
const EN_SPOKEN: Partial<Record<BookId, readonly string[]>> = {
  '1SA': ['samuel'],
  '1KI': ['kings'],
  '1CH': ['chronicles'],
  PSA: ['psalm'],
  PRO: ['proverb'],
  ECC: ['qoheleth', 'qohelet'],
  SNG: ['song of songs', 'canticles', 'song of song'],
  ACT: ['acts of the apostles'],
  '1CO': ['corinthians'],
  '1TH': ['thessalonians'],
  '1TI': ['timothy'],
  '1PE': ['peter'],
  REV: ['revelations', 'apocalypse'],
};

function flatten(src: Partial<Record<BookId, readonly string[]>>): Record<string, BookId> {
  const out: Record<string, BookId> = {};
  for (const [id, list] of Object.entries(src) as [BookId, readonly string[]][]) {
    for (const alias of list) out[alias] = id;
  }
  return out;
}

registerAliases('en', Object.fromEntries(BOOKS.map((b) => [b.name, b.id])), { spoken: true });
registerAliases('en', flatten(EN_SPOKEN), { spoken: true });
registerAliases('en', flatten(EN_TYPED));

// --- Starter sets proving the per-language structure; extend via registerAliases ---------

registerAliases(
  'fr',
  {
    Genèse: 'GEN',
    Exode: 'EXO',
    Lévitique: 'LEV',
    Nombres: 'NUM',
    Deutéronome: 'DEU',
    Josué: 'JOS',
    Juges: 'JDG',
    Psaumes: 'PSA',
    Psaume: 'PSA',
    Proverbes: 'PRO',
    Ésaïe: 'ISA',
    Isaïe: 'ISA',
    Jérémie: 'JER',
    Matthieu: 'MAT',
    Marc: 'MRK',
    Luc: 'LUK',
    Jean: 'JHN',
    Actes: 'ACT',
    Romains: 'ROM',
    '1 Corinthiens': '1CO',
    '2 Corinthiens': '2CO',
    Galates: 'GAL',
    Éphésiens: 'EPH',
    Philippiens: 'PHP',
    Hébreux: 'HEB',
    Jacques: 'JAS',
    '1 Pierre': '1PE',
    '2 Pierre': '2PE',
    '1 Jean': '1JN',
    '2 Jean': '2JN',
    '3 Jean': '3JN',
    Apocalypse: 'REV',
  },
  { spoken: true },
);
registerAliases('fr', {
  Gn: 'GEN',
  Ex: 'EXO',
  Mt: 'MAT',
  Mc: 'MRK',
  Lc: 'LUK',
  Jn: 'JHN',
  Ap: 'REV',
});

registerAliases(
  'es',
  {
    Génesis: 'GEN',
    Éxodo: 'EXO',
    Levítico: 'LEV',
    Números: 'NUM',
    Deuteronomio: 'DEU',
    Josué: 'JOS',
    Jueces: 'JDG',
    Salmos: 'PSA',
    Salmo: 'PSA',
    Proverbios: 'PRO',
    Isaías: 'ISA',
    Jeremías: 'JER',
    Mateo: 'MAT',
    Marcos: 'MRK',
    Lucas: 'LUK',
    Juan: 'JHN',
    Hechos: 'ACT',
    Romanos: 'ROM',
    '1 Corintios': '1CO',
    '2 Corintios': '2CO',
    Gálatas: 'GAL',
    Efesios: 'EPH',
    Filipenses: 'PHP',
    Hebreos: 'HEB',
    Santiago: 'JAS',
    '1 Pedro': '1PE',
    '2 Pedro': '2PE',
    '1 Juan': '1JN',
    '2 Juan': '2JN',
    '3 Juan': '3JN',
    Judas: 'JUD',
    Apocalipsis: 'REV',
  },
  { spoken: true },
);
registerAliases('es', {
  Gn: 'GEN',
  Sal: 'PSA',
  Mt: 'MAT',
  Mr: 'MRK',
  Lc: 'LUK',
  Jn: 'JHN',
  Ap: 'REV',
});

import type { BookId } from '@lampstand/core';

/** Static metadata for one canonical book (66-book Protestant canon, KJV chapter counts). */
export interface BookInfo {
  readonly id: BookId;
  /** English display name, e.g. "1 Corinthians", "Psalms", "Song of Solomon". */
  readonly name: string;
  /** Short display name (SBL-style abbreviation), e.g. "1 Cor". */
  readonly shortName: string;
  readonly testament: 'OT' | 'NT';
  /** Number of chapters in KJV versification. */
  readonly chapters: number;
}

// [id, name, shortName, chapters] in canonical order; testament is derived from position
// (the first 39 entries are the Old Testament) so it can never drift out of sync.
const RAW: ReadonlyArray<readonly [BookId, string, string, number]> = [
  ['GEN', 'Genesis', 'Gen', 50],
  ['EXO', 'Exodus', 'Exod', 40],
  ['LEV', 'Leviticus', 'Lev', 27],
  ['NUM', 'Numbers', 'Num', 36],
  ['DEU', 'Deuteronomy', 'Deut', 34],
  ['JOS', 'Joshua', 'Josh', 24],
  ['JDG', 'Judges', 'Judg', 21],
  ['RUT', 'Ruth', 'Ruth', 4],
  ['1SA', '1 Samuel', '1 Sam', 31],
  ['2SA', '2 Samuel', '2 Sam', 24],
  ['1KI', '1 Kings', '1 Kgs', 22],
  ['2KI', '2 Kings', '2 Kgs', 25],
  ['1CH', '1 Chronicles', '1 Chr', 29],
  ['2CH', '2 Chronicles', '2 Chr', 36],
  ['EZR', 'Ezra', 'Ezra', 10],
  ['NEH', 'Nehemiah', 'Neh', 13],
  ['EST', 'Esther', 'Esth', 10],
  ['JOB', 'Job', 'Job', 42],
  ['PSA', 'Psalms', 'Ps', 150],
  ['PRO', 'Proverbs', 'Prov', 31],
  ['ECC', 'Ecclesiastes', 'Eccl', 12],
  ['SNG', 'Song of Solomon', 'Song', 8],
  ['ISA', 'Isaiah', 'Isa', 66],
  ['JER', 'Jeremiah', 'Jer', 52],
  ['LAM', 'Lamentations', 'Lam', 5],
  ['EZK', 'Ezekiel', 'Ezek', 48],
  ['DAN', 'Daniel', 'Dan', 12],
  ['HOS', 'Hosea', 'Hos', 14],
  ['JOL', 'Joel', 'Joel', 3],
  ['AMO', 'Amos', 'Amos', 9],
  ['OBA', 'Obadiah', 'Obad', 1],
  ['JON', 'Jonah', 'Jonah', 4],
  ['MIC', 'Micah', 'Mic', 7],
  ['NAM', 'Nahum', 'Nah', 3],
  ['HAB', 'Habakkuk', 'Hab', 3],
  ['ZEP', 'Zephaniah', 'Zeph', 3],
  ['HAG', 'Haggai', 'Hag', 2],
  ['ZEC', 'Zechariah', 'Zech', 14],
  ['MAL', 'Malachi', 'Mal', 4],
  ['MAT', 'Matthew', 'Matt', 28],
  ['MRK', 'Mark', 'Mark', 16],
  ['LUK', 'Luke', 'Luke', 24],
  ['JHN', 'John', 'John', 21],
  ['ACT', 'Acts', 'Acts', 28],
  ['ROM', 'Romans', 'Rom', 16],
  ['1CO', '1 Corinthians', '1 Cor', 16],
  ['2CO', '2 Corinthians', '2 Cor', 13],
  ['GAL', 'Galatians', 'Gal', 6],
  ['EPH', 'Ephesians', 'Eph', 6],
  ['PHP', 'Philippians', 'Phil', 4],
  ['COL', 'Colossians', 'Col', 4],
  ['1TH', '1 Thessalonians', '1 Thess', 5],
  ['2TH', '2 Thessalonians', '2 Thess', 3],
  ['1TI', '1 Timothy', '1 Tim', 6],
  ['2TI', '2 Timothy', '2 Tim', 4],
  ['TIT', 'Titus', 'Titus', 3],
  ['PHM', 'Philemon', 'Phlm', 1],
  ['HEB', 'Hebrews', 'Heb', 13],
  ['JAS', 'James', 'Jas', 5],
  ['1PE', '1 Peter', '1 Pet', 5],
  ['2PE', '2 Peter', '2 Pet', 3],
  ['1JN', '1 John', '1 John', 5],
  ['2JN', '2 John', '2 John', 1],
  ['3JN', '3 John', '3 John', 1],
  ['JUD', 'Jude', 'Jude', 1],
  ['REV', 'Revelation', 'Rev', 22],
];

const OT_COUNT = 39;

/** All 66 books in canonical order. */
export const BOOKS: ReadonlyArray<BookInfo> = RAW.map(([id, name, shortName, chapters], i) => ({
  id,
  name,
  shortName,
  chapters,
  testament: i < OT_COUNT ? 'OT' : 'NT',
}));

const BY_ID = new Map<BookId, BookInfo>(BOOKS.map((b) => [b.id, b]));
const INDEX = new Map<BookId, number>(BOOKS.map((b, i) => [b.id, i]));

/**
 * Metadata for a book. Throws for an unknown id: a `BookId` is a closed enum, so a miss means
 * unvalidated data leaked in and failing loudly beats silently projecting the wrong thing.
 */
export function getBook(id: BookId): BookInfo {
  const b = BY_ID.get(id);
  if (!b) throw new Error(`Unknown book id: ${id}`);
  return b;
}

/** English display name for a book; `short` gives the abbreviation ("1 Cor"). */
export function bookName(id: BookId, opts: { short?: boolean } = {}): string {
  const b = getBook(id);
  return opts.short === true ? b.shortName : b.name;
}

/** Zero-based canonical position of a book (Genesis = 0), used for ordering comparisons. */
export function bookIndex(id: BookId): number {
  const i = INDEX.get(id);
  if (i === undefined) throw new Error(`Unknown book id: ${id}`);
  return i;
}

/** The book at a canonical position, or undefined past either end. */
export function bookAt(index: number): BookInfo | undefined {
  return BOOKS[index];
}

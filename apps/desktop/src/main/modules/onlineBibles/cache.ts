import { BOOK_IDS, type BookId } from '@lampstand/core';
import { type CachePolicy } from './providers';

/**
 * The chapters of one online Bible kept on this computer, within its provider's terms: no more
 * than `maxVerses` in all, never more than half of one book when `halfBook`, none older than
 * `maxAgeDays`. The least recently used go first. Chapters that can't be kept (Jude is a whole
 * book in one chapter) are held in memory only while the app runs.
 *
 * Also kept: each chapter's verse count and the version's book names (metadata, not text).
 */

interface Saved {
  verses: string[];
  /** When it was fetched, and last used (ms). */
  at: number;
  used: number;
}

export interface CacheFile {
  version: 1;
  chapters: Record<string, Saved>;
  counts: Partial<Record<BookId, number[]>>;
  names: Partial<Record<BookId, string>>;
  copyright?: string;
  /** Requests made, for limits counted over days or months. */
  requests: number[];
}

export const emptyCache = (): CacheFile => ({
  version: 1,
  chapters: {},
  counts: {},
  names: {},
  requests: [],
});

const keyOf = (book: BookId, chapter: number): string => `${book}.${chapter}`;
const DAY = 24 * 60 * 60 * 1000;
/** Chapters held in memory only (not allowed on disk): a few, for the service in hand. */
const MEMORY_CHAPTERS = 6;

export class ChapterCache {
  private readonly memory = new Map<string, string[]>();

  constructor(
    readonly file: CacheFile,
    private readonly policy: CachePolicy,
    /** Verses in each chapter of each book (the KJV's, for the half-a-book rule). */
    private readonly bookVerses: (book: BookId) => number,
    private readonly now: () => number = Date.now,
  ) {
    this.expire();
  }

  get(book: BookId, chapter: number): string[] | null {
    const k = keyOf(book, chapter);
    const mem = this.memory.get(k);
    if (mem) return mem;
    const saved = this.file.chapters[k];
    if (!saved) return null;
    if (this.now() - saved.at > this.policy.maxAgeDays * DAY) {
      this.drop((key) => key === k);
      return null;
    }
    saved.used = this.now();
    return saved.verses;
  }

  /** Keep a fetched chapter (on disk if the terms allow, else in memory). True if on disk. */
  put(book: BookId, chapter: number, verses: string[]): boolean {
    const k = keyOf(book, chapter);
    const counts = (this.file.counts[book] ??= []);
    counts[chapter - 1] = verses.length;
    this.drop((key) => key === k);
    const n = verses.length;
    const bookCap = this.policy.halfBook ? Math.floor(this.bookVerses(book) / 2) : Infinity;
    if (n > this.policy.maxVerses || n > bookCap) {
      this.memory.delete(k);
      this.memory.set(k, verses);
      while (this.memory.size > MEMORY_CHAPTERS) {
        const first = this.memory.keys().next().value;
        if (first === undefined) break;
        this.memory.delete(first);
      }
      return false;
    }
    // Make room: the least recently used chapters of this book, then of any book.
    this.evict((key) => key.startsWith(`${book}.`), bookCap - n);
    this.evict(() => true, this.policy.maxVerses - n);
    const t = this.now();
    this.file.chapters[k] = { verses, at: t, used: t };
    return true;
  }

  /** Verses kept on disk now. */
  verseCount(): number {
    return Object.values(this.file.chapters).reduce((sum, c) => sum + c.verses.length, 0);
  }

  clear(): void {
    this.file.chapters = {};
    this.memory.clear();
  }

  /** Drop least recently used chapters (of those `match` picks) until they total ≤ `room`. */
  private evict(match: (key: string) => boolean, room: number): void {
    const picked = Object.entries(this.file.chapters)
      .filter(([k]) => match(k))
      .sort((a, b) => a[1].used - b[1].used);
    let total = picked.reduce((sum, [, c]) => sum + c.verses.length, 0);
    const gone = new Set<string>();
    for (const [k, c] of picked) {
      if (total <= room) break;
      gone.add(k);
      total -= c.verses.length;
    }
    if (gone.size) this.drop((key) => gone.has(key));
  }

  /** Forget the saved chapters `match` picks. */
  private drop(match: (key: string, c: Saved) => boolean): void {
    this.file.chapters = Object.fromEntries(
      Object.entries(this.file.chapters).filter(([k, c]) => !match(k, c)),
    );
  }

  private expire(): void {
    const limit = this.now() - this.policy.maxAgeDays * DAY;
    this.drop((k, c) => c.at < limit || !BOOK_IDS.includes(k.split('.')[0] as BookId));
  }
}

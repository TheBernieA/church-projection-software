import { BOOK_IDS, type BookId, type OnlineBible, type OnlineBibleProvider } from '@lampstand/core';
import { bookName } from '@lampstand/scripture';
import { atPath, fillTemplate, versesFromBracketed, versesFromList } from './parse';

/**
 * What each Bible API needs: how to ask for one chapter, how to read the reply, and the limits
 * its terms set. Sources for every rule: docs/online-bibles.md.
 */

export interface ChapterRequest {
  url: string;
  headers: Record<string, string>;
}

export interface ChapterReply {
  verses: string[];
  /** The book's name in the version's own language, when the reply has it. */
  bookName?: string;
  /** A credit the provider sends with the text (API.Bible). */
  copyright?: string;
  /** API.Bible's Fair Use token, reported when the text is shown. */
  fumsToken?: string;
}

export interface CachePolicy {
  /** Verses kept on this computer at most (all books together). */
  maxVerses: number;
  /** Never keep more than half of any one book (ESV's rule, and the safe default). */
  halfBook: boolean;
  /** Saved chapters are fetched again after this many days. */
  maxAgeDays: number;
}

/** No more than `limit` requests in any `windowMs`. */
export interface RateRule {
  limit: number;
  windowMs: number;
}

export interface Provider {
  id: OnlineBibleProvider;
  label: string;
  needsKey: boolean;
  /** Where a church gets a key, or reads the terms. */
  site: string;
  policy: CachePolicy;
  rates: RateRule[];
  request(src: OnlineBible, book: BookId, chapter: number, key: string): ChapterRequest;
  parse(reply: unknown, book: BookId, chapter: number, src: OnlineBible): ChapterReply;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const bookNumber = (book: BookId): number => BOOK_IDS.indexOf(book) + 1;

/** The reply is for a different chapter than asked (a misread reference): refuse it. */
export class WrongChapterError extends Error {}

const LICENSED: CachePolicy = { maxVerses: 500, halfBook: true, maxAgeDays: 30 };
const OPEN: CachePolicy = { maxVerses: 3000, halfBook: false, maxAgeDays: 30 };

const ESV_TEXT_OPTIONS = new URLSearchParams({
  'include-passage-references': 'false',
  'include-verse-numbers': 'true',
  'include-first-verse-numbers': 'true',
  'include-footnotes': 'false',
  'include-footnote-body': 'false',
  'include-headings': 'false',
  'include-short-copyright': 'false',
  'include-copyright': 'false',
  'include-passage-horizontal-lines': 'false',
  'include-heading-horizontal-lines': 'false',
  'include-selahs': 'true',
  'indent-paragraphs': '0',
  'indent-poetry': 'false',
  'indent-declares': '0',
  'indent-psalm-doxology': '0',
  'line-length': '0',
});

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

export const PROVIDERS: Record<OnlineBibleProvider, Provider> = {
  esv: {
    id: 'esv',
    label: 'ESV API (Crossway)',
    needsKey: true,
    site: 'https://api.esv.org/account/create-application/',
    // "You may not locally store more than 500 verses or one-half of any book", and "no more
    // than 60 requests per minute", 1,000 an hour, 5,000 a day.
    policy: LICENSED,
    rates: [
      { limit: 60, windowMs: MINUTE },
      { limit: 1000, windowMs: HOUR },
      { limit: 5000, windowMs: DAY },
    ],
    request: (_src, book, chapter, key) => {
      const q = new URLSearchParams({ q: `${bookName(book)} ${chapter}` });
      return {
        url: `https://api.esv.org/v3/passage/text/?${q.toString()}&${ESV_TEXT_OPTIONS.toString()}`,
        headers: { Authorization: `Token ${key}` },
      };
    },
    parse: (reply, book, chapter) => {
      const r = obj(reply);
      // parsed: [[43003001, 43003036]] — book, chapter, verse as BBCCCVVV.
      const start =
        Array.isArray(r.parsed) && Array.isArray(r.parsed[0]) ? Number(r.parsed[0][0]) : 0;
      if (
        start &&
        (Math.floor(start / 1e6) !== bookNumber(book) || Math.floor(start / 1e3) % 1e3 !== chapter)
      )
        throw new WrongChapterError();
      const text =
        Array.isArray(r.passages) && typeof r.passages[0] === 'string' ? r.passages[0] : '';
      return { verses: versesFromBracketed(text) };
    },
  },

  apibible: {
    id: 'apibible',
    label: 'API.Bible (American Bible Society)',
    needsKey: true,
    site: 'https://api.bible/',
    // No storage rule found in its docs: kept to the same careful limits as other licensed
    // texts. Its free plan allows 5,000 requests a month.
    policy: LICENSED,
    rates: [
      { limit: 60, windowMs: MINUTE },
      { limit: 5000, windowMs: 30 * DAY },
    ],
    request: (src, book, chapter, key) => {
      const q = new URLSearchParams({
        'content-type': 'text',
        'include-notes': 'false',
        'include-titles': 'false',
        'include-chapter-numbers': 'false',
        'include-verse-numbers': 'true',
        'include-verse-spans': 'false',
      });
      return {
        url: `https://rest.api.bible/v1/bibles/${encodeURIComponent(src.remoteId)}/chapters/${book}.${chapter}?${q.toString()}`,
        headers: { 'api-key': key },
      };
    },
    parse: (reply, book, chapter) => {
      const r = obj(reply);
      const data = obj(r.data);
      const meta = obj(r.meta);
      if (typeof data.id === 'string' && data.id !== `${book}.${chapter}`)
        throw new WrongChapterError();
      const token = typeof meta.fumsToken === 'string' ? meta.fumsToken : undefined;
      return {
        verses: versesFromBracketed(typeof data.content === 'string' ? data.content : ''),
        ...(typeof data.copyright === 'string' && data.copyright.trim()
          ? { copyright: data.copyright.trim().slice(0, 500) }
          : {}),
        ...(token ? { fumsToken: token } : {}),
      };
    },
  },

  bibleapi: {
    id: 'bibleapi',
    label: 'bible-api.com',
    needsKey: false,
    site: 'https://bible-api.com/',
    // "15 requests every 30 seconds"; "do not use this API to download an entire bible".
    policy: OPEN,
    rates: [{ limit: 15, windowMs: 30_000 }],
    request: (src, book, chapter) => {
      const ref = `${bookName(book)} ${chapter}`.toLowerCase().replace(/\s+/g, '+');
      const q = new URLSearchParams({
        translation: src.remoteId || 'web',
        single_chapter_book_matching: 'indifferent',
      });
      return { url: `https://bible-api.com/${encodeURI(ref)}?${q.toString()}`, headers: {} };
    },
    parse: (reply, _book, chapter) => {
      const r = obj(reply);
      const list = Array.isArray(r.verses) ? r.verses : [];
      const first = obj(list[0]);
      if (first.chapter !== undefined && Number(first.chapter) !== chapter)
        throw new WrongChapterError();
      return {
        verses: versesFromList(list, 'text', 'verse'),
        ...(typeof first.book_name === 'string' ? { bookName: first.book_name } : {}),
      };
    },
  },

  getbible: {
    id: 'getbible',
    label: 'getBible',
    needsKey: false,
    site: 'https://getbible.net/api',
    // Asks clients to check cached data again at least weekly.
    policy: { ...OPEN, maxAgeDays: 7 },
    rates: [{ limit: 60, windowMs: MINUTE }],
    request: (src, book, chapter) => ({
      url: `https://api.getbible.net/v2/${encodeURIComponent(src.remoteId || 'kjv')}/${bookNumber(book)}/${chapter}.json`,
      headers: {},
    }),
    parse: (reply, _book, chapter) => {
      const r = obj(reply);
      if (r.chapter !== undefined && Number(r.chapter) !== chapter) throw new WrongChapterError();
      return {
        verses: versesFromList(r.verses, 'text', 'verse'),
        ...(typeof r.book_name === 'string' ? { bookName: r.book_name } : {}),
      };
    },
  },

  custom: {
    id: 'custom',
    label: 'Custom API',
    needsKey: false,
    site: '',
    policy: LICENSED,
    rates: [{ limit: 60, windowMs: MINUTE }],
    request: (src, book, chapter, key) => {
      const c = src.custom;
      if (!c) throw new Error('custom API not set up');
      const url = fillTemplate(c.urlTemplate, {
        book,
        bookNumber: bookNumber(book),
        bookName: bookName(book),
        chapter,
        key,
      });
      const headers: Record<string, string> =
        c.keyHeader.trim() && key ? { [c.keyHeader.trim()]: `${c.keyPrefix}${key}` } : {};
      return { url, headers };
    },
    parse: (reply, _book, _chapter, src) => {
      const c = src.custom;
      if (!c) return { verses: [] };
      if (c.format === 'text') {
        const text = atPath(reply, c.textPath);
        return { verses: typeof text === 'string' ? versesFromBracketed(text) : [] };
      }
      return { verses: versesFromList(atPath(reply, c.versesPath), c.textField, c.numberField) };
    },
  },
};

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AppError,
  BOOK_IDS,
  type BibleVersionInfo,
  type BookId,
  type OnlineBible,
} from '@lampstand/core';
import type { OnlineBibleStatus } from '@lampstand/ipc-contract';
import { bookName } from '@lampstand/scripture';
import { writeFileAtomic, writeJsonAtomic } from '../../storage/atomic';
import { type Logger } from '../../types';
import { ChapterCache, emptyCache, type CacheFile } from './cache';
import { isAllowedApiUrl } from './parse';
import { PROVIDERS, WrongChapterError, type Provider } from './providers';

/** The bits of the secret store used here: keys are kept encrypted, never in settings. */
export interface KeyStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
  names(): Promise<Set<string>>;
}

export type Fetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export const keyName = (id: string): string => `online-bible:${id}`;

const TIMEOUT_MS = 15_000;
/** ISO 639-3 codes API.Bible uses, for the languages Lampstand has names for. */
const LANG3: Record<string, string> = {
  eng: 'en',
  spa: 'es',
  fra: 'fr',
  deu: 'de',
  ita: 'it',
  por: 'pt',
  nld: 'nl',
  twi: 'tw',
  aka: 'ak',
  yor: 'yo',
  swh: 'sw',
  swa: 'sw',
  zho: 'zh',
  cmn: 'zh',
  kor: 'ko',
  jpn: 'ja',
  rus: 'ru',
  arb: 'ar',
  ara: 'ar',
  heb: 'he',
  hin: 'hi',
};
export const toLang = (code: string): string => LANG3[code.toLowerCase()] ?? code.toLowerCase();

/** Bibles read from APIs as they're used, each within its provider's terms. */
export class OnlineBibles {
  private sources = new Map<string, OnlineBible>();
  private caches = new Map<string, Promise<ChapterCache>>();
  private inflight = new Map<string, Promise<string[]>>();
  private errors = new Map<string, string>();
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** API.Bible's Fair Use reporting: a random id for this computer, and one for this run. */
  private deviceId: string | null = null;
  private readonly sessionId = randomUUID();

  constructor(
    private readonly o: {
      dir: string;
      keys: KeyStore;
      fetch: Fetch;
      log: Logger;
      /** Verses in each book (from the bundled KJV): the half-a-book rule, and verse counts. */
      kjvCounts: () => Promise<Partial<Record<BookId, number[]>>>;
      now?: () => number;
    },
  ) {}

  setSources(list: OnlineBible[]): void {
    this.sources = new Map(list.map((s) => [s.id, s]));
    for (const id of [...this.caches.keys()]) if (!this.sources.has(id)) this.caches.delete(id);
  }

  has(id: string): boolean {
    return this.sources.has(id);
  }

  /** As the Bible list shows them (next to installed versions). */
  infos(): BibleVersionInfo[] {
    return [...this.sources.values()].map((s) => ({
      id: s.id,
      name: s.name,
      abbreviation: s.abbreviation,
      language: s.language,
      direction: s.direction,
      versification: 'kjv',
      license: { kind: 'licensed', text: `Read from ${PROVIDERS[s.provider].label} as it's used.` },
      ...(s.copyrightLine ? { copyrightLine: s.copyrightLine } : {}),
      source: 'online',
      checksumSha256: '',
      moduleVersion: s.provider,
    }));
  }

  async chapter(id: string, book: BookId, chapter: number): Promise<string[]> {
    const src = this.source(id);
    const cache = await this.cache(src);
    const hit = cache.get(book, chapter);
    if (hit) return hit;
    const k = `${id}/${book}.${chapter}`;
    let p = this.inflight.get(k);
    if (!p) {
      p = this.fetchChapter(src, cache, book, chapter).finally(() => this.inflight.delete(k));
      this.inflight.set(k, p);
    }
    return p;
  }

  /** The KJV's verse counts, corrected by the chapters this version has sent. */
  async verseCounts(id: string): Promise<Partial<Record<BookId, number[]>>> {
    const cache = await this.cache(this.source(id));
    const base = await this.o.kjvCounts();
    const out: Partial<Record<BookId, number[]>> = {};
    for (const b of BOOK_IDS) {
      const known = cache.file.counts[b];
      const kjv = base[b];
      if (!kjv && !known) continue;
      out[b] = (kjv ?? []).map((n, i) => known?.[i] ?? n);
    }
    return out;
  }

  /** Book names in the version's own language, as its replies give them (English: none). */
  async bookNames(id: string): Promise<Partial<Record<BookId, string>>> {
    const src = this.source(id);
    if (/^en\b/i.test(src.language)) return {};
    return { ...(await this.cache(src)).file.names };
  }

  async status(): Promise<OnlineBibleStatus[]> {
    const saved = await this.o.keys.names();
    return Promise.all(
      [...this.sources.values()].map(async (s) => {
        const cache = await this.cache(s);
        const err = this.errors.get(s.id);
        return {
          id: s.id,
          hasKey: saved.has(keyName(s.id)),
          savedVerses: cache.verseCount(),
          maxVerses: PROVIDERS[s.provider].policy.maxVerses,
          ...(err ? { lastError: err } : {}),
        };
      }),
    );
  }

  async clearSaved(id: string): Promise<void> {
    const cache = await this.cache(this.source(id));
    cache.clear();
    await this.save(id, cache.file, true);
  }

  /** Forget a source entirely: its saved chapters and its key. */
  async remove(id: string): Promise<void> {
    this.caches.delete(id);
    await rm(this.fileOf(id), { force: true });
    await this.o.keys.delete(keyName(id));
  }

  /**
   * Try a source before it's added: fetch John 3 and return verse 16, or say what's wrong. Not
   * cached (it may never be added).
   */
  async probe(
    src: OnlineBible,
    key: string,
  ): Promise<{ sample: string; copyright?: string; bookName?: string }> {
    const reply = await this.request(src, PROVIDERS[src.provider], 'JHN', 3, key, false);
    const verse = reply.verses[15] ?? reply.verses.find((v) => v.trim()) ?? '';
    if (!verse.trim())
      throw new AppError(
        'online-bible-empty',
        'The API answered, but no verses were found in its reply. Check where the verses are (the path and field names).',
      );
    return {
      sample: verse,
      ...(reply.copyright ? { copyright: reply.copyright } : {}),
      ...(reply.bookName ? { bookName: reply.bookName } : {}),
    };
  }

  /** API.Bible: the Bibles this key may read. */
  async apiBibleCatalog(
    key: string,
  ): Promise<
    { id: string; name: string; abbreviation: string; language: string; direction: 'ltr' | 'rtl' }[]
  > {
    const json = await this.getJson(
      'https://rest.api.bible/v1/bibles',
      { 'api-key': key },
      'API.Bible',
    );
    const list = json && typeof json === 'object' ? (json as { data?: unknown }).data : null;
    if (!Array.isArray(list)) return [];
    return list.flatMap((b: unknown) => {
      const r = (b ?? {}) as Record<string, unknown>;
      const lang = (r.language ?? {}) as Record<string, unknown>;
      if (typeof r.id !== 'string' || typeof r.name !== 'string') return [];
      return [
        {
          id: r.id,
          name: (typeof r.nameLocal === 'string' && r.nameLocal) || r.name,
          abbreviation:
            [r.abbreviationLocal, r.abbreviation, r.name]
              .find((x): x is string => typeof x === 'string' && x.trim() !== '')
              ?.slice(0, 20) ?? r.name.slice(0, 20),
          language: toLang(typeof lang.id === 'string' ? lang.id : 'en'),
          direction: lang.scriptDirection === 'RTL' ? 'rtl' : 'ltr',
        },
      ];
    });
  }

  // ---------- inside ----------

  private source(id: string): OnlineBible {
    const s = this.sources.get(id);
    if (!s) throw new AppError('bible-not-found', 'That Bible version is not available.');
    return s;
  }

  private fileOf(id: string): string {
    return join(this.o.dir, `${id}.json`);
  }

  private cache(src: OnlineBible): Promise<ChapterCache> {
    let p = this.caches.get(src.id);
    if (!p) {
      p = (async () => {
        const counts = await this.o.kjvCounts();
        let file: CacheFile = emptyCache();
        try {
          const raw = JSON.parse(
            await readFile(this.fileOf(src.id), 'utf8'),
          ) as Partial<CacheFile> | null;
          if (raw?.version === 1 && typeof raw.chapters === 'object')
            file = { ...emptyCache(), ...raw };
        } catch {
          /* none yet, or unreadable: start empty */
        }
        const total = (b: BookId): number => (counts[b] ?? []).reduce((a, n) => a + n, 0);
        return new ChapterCache(file, PROVIDERS[src.provider].policy, total, this.o.now);
      })();
      this.caches.set(src.id, p);
    }
    return p;
  }

  private async fetchChapter(
    src: OnlineBible,
    cache: ChapterCache,
    book: BookId,
    chapter: number,
  ): Promise<string[]> {
    const provider = PROVIDERS[src.provider];
    const key = (await this.o.keys.get(keyName(src.id))) ?? '';
    if (provider.needsKey && !key)
      throw new AppError(
        'online-bible-key',
        `${src.name} needs its API key. Add it in Settings › Bibles & hymnals › Online Bibles.`,
      );
    this.takeRequest(cache.file, provider, src);
    try {
      const reply = await this.request(src, provider, book, chapter, key, true);
      this.errors.delete(src.id);
      if (reply.bookName && !/^en\b/i.test(src.language))
        cache.file.names[book] = reply.bookName.slice(0, 100);
      if (reply.copyright) cache.file.copyright = reply.copyright;
      cache.put(book, chapter, reply.verses);
      void this.save(src.id, cache.file);
      if (reply.fumsToken) this.reportFums(reply.fumsToken);
      return reply.verses;
    } catch (e) {
      this.errors.set(src.id, e instanceof AppError ? e.message : 'Could not read it.');
      throw e;
    }
  }

  /** Within the provider's request limits, counted over minutes, hours, days or a month. */
  private takeRequest(file: CacheFile, provider: Provider, src: OnlineBible): void {
    const now = (this.o.now ?? Date.now)();
    const longest = Math.max(...provider.rates.map((r) => r.windowMs));
    file.requests = file.requests.filter((t) => now - t < longest);
    for (const r of provider.rates) {
      const used = file.requests.filter((t) => now - t < r.windowMs).length;
      if (used >= r.limit)
        throw new AppError(
          'online-bible-busy',
          r.windowMs >= 24 * 60 * 60 * 1000
            ? `${src.name} has reached ${provider.label}'s limit of ${r.limit} requests for now. Saved chapters still work.`
            : `Too many requests to ${provider.label} just now. Try again in a minute.`,
        );
    }
    file.requests.push(now);
  }

  private async request(
    src: OnlineBible,
    provider: Provider,
    book: BookId,
    chapter: number,
    key: string,
    keyRequired: boolean,
  ) {
    if (provider.needsKey && !key)
      throw new AppError(
        'online-bible-key',
        keyRequired ? `${src.name} needs its API key.` : `${provider.label} needs an API key.`,
      );
    const req = provider.request(src, book, chapter, key);
    if (!isAllowedApiUrl(req.url))
      throw new AppError(
        'online-bible-url',
        'The API address must start with https:// (http:// only for this computer).',
      );
    const json = await this.getJson(req.url, req.headers, src.name, `${bookName(book)} ${chapter}`);
    try {
      return provider.parse(json, book, chapter, src);
    } catch (e) {
      if (e instanceof WrongChapterError)
        throw new AppError(
          'online-bible-missing',
          `${src.name} sent a different passage for ${bookName(book)} ${chapter}.`,
        );
      throw new AppError('online-bible-format', `${src.name}'s reply couldn't be read.`);
    }
  }

  /** One GET, its errors in words. The address (it may hold a key) is never logged. */
  private async getJson(
    url: string,
    headers: Record<string, string>,
    who: string,
    what = '',
  ): Promise<unknown> {
    let res: Awaited<ReturnType<Fetch>>;
    try {
      res = await this.o.fetch(url, {
        headers: { Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new AppError(
        'online-bible-offline',
        `${who} needs an internet connection${what ? `, and ${what} isn't saved on this computer` : ''}.`,
      );
    }
    if (res.status === 401 || res.status === 403)
      throw new AppError(
        'online-bible-key',
        `${who} didn't accept the API key (it may be wrong, or not allowed this version).`,
      );
    if (res.status === 404)
      throw new AppError('online-bible-missing', `${who} has no ${what || 'such passage'}.`);
    if (res.status === 429)
      throw new AppError(
        'online-bible-busy',
        `${who} is busy (too many requests). Try again in a minute.`,
      );
    if (!res.ok)
      throw new AppError(
        'online-bible-failed',
        `${who} couldn't send ${what || 'that'} (error ${res.status}).`,
      );
    const text = await res.text();
    if (text.length > 4 * 1024 * 1024)
      throw new AppError('online-bible-format', `${who}'s reply is too large.`);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text; // a plain-text reply (a custom API in 'text' form)
    }
  }

  private save(id: string, file: CacheFile, now = false): Promise<void> {
    const prev = this.saveTimers.get(id);
    if (prev) clearTimeout(prev);
    const write = async (): Promise<void> => {
      this.saveTimers.delete(id);
      try {
        await mkdir(this.o.dir, { recursive: true });
        await writeJsonAtomic(this.fileOf(id), file);
      } catch {
        this.o.log.warn('online bible cache not saved', { id });
      }
    };
    if (now) return write();
    this.saveTimers.set(
      id,
      setTimeout(() => void write(), 500),
    );
    return Promise.resolve();
  }

  /** Flush saved chapters (on quit). */
  async flush(): Promise<void> {
    const pending = [...this.saveTimers.keys()];
    for (const id of pending) {
      const cache = await this.caches.get(id);
      if (cache) await this.save(id, cache.file, true);
    }
  }

  /** API.Bible's Fair Use report for text shown: random ids, no personal data. Best effort. */
  private reportFums(token: string): void {
    void (async () => {
      try {
        if (!this.deviceId) {
          const f = join(this.o.dir, 'device-id');
          try {
            this.deviceId = (await readFile(f, 'utf8')).trim() || null;
          } catch {
            /* first time */
          }
          if (!this.deviceId) {
            this.deviceId = randomUUID();
            await mkdir(this.o.dir, { recursive: true });
            await writeFileAtomic(f, this.deviceId).catch(() => undefined);
          }
        }
        const q = new URLSearchParams({ t: token, dId: this.deviceId, sId: this.sessionId });
        await this.o.fetch(`https://fums.api.bible/f3?${q.toString()}`, {
          headers: {},
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        /* reporting never gets in the way of showing the text */
      }
    })();
  }
}

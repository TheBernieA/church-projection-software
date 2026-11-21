import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OnlineBibleSchema, type BookId, type OnlineBible } from '@lampstand/core';
import { ChapterCache, emptyCache } from './cache';
import { OnlineBibles, type Fetch, type KeyStore } from './onlineBibles';
import {
  atPath,
  fillTemplate,
  isAllowedApiUrl,
  versesFromBracketed,
  versesFromList,
} from './parse';
import { PROVIDERS } from './providers';

// Sample replies follow each provider's documented shape; the verse text is made up here.

describe('reading replies', () => {
  it('reads bracketed verse numbers, dropping a heading and tidying lines', () => {
    expect(
      versesFromBracketed('A Heading\n  [1] First   line\n of one. [2] Two. [4] Four.'),
    ).toEqual(['First line of one.', 'Two.', '', 'Four.']);
  });
  it('reads verse lists by number, or in order', () => {
    expect(
      versesFromList([
        { verse: 2, text: 'Two\n' },
        { verse: 1, text: ' One' },
      ]),
    ).toEqual(['One', 'Two']);
    expect(versesFromList(['a', 'b'])).toEqual(['a', 'b']);
    expect(versesFromList([{ n: '1', t: 'x' }], 't', 'n')).toEqual(['x']);
  });
  it('follows dot paths and fills address templates', () => {
    expect(atPath({ data: { passages: ['x'] } }, 'data.passages.0')).toBe('x');
    expect(atPath({ a: 1 }, '')).toEqual({ a: 1 });
    expect(
      fillTemplate('https://x.test/{book}/{bookNumber}/{bookName}/{chapter}?k={key}', {
        book: 'SNG',
        bookNumber: 22,
        bookName: 'Song of Solomon',
        chapter: 2,
        key: 'a&b',
      }),
    ).toBe('https://x.test/SNG/22/Song%20of%20Solomon/2?k=a%26b');
  });
  it('allows https anywhere, and http only to this computer', () => {
    expect(isAllowedApiUrl('https://api.example.org/x')).toBe(true);
    expect(isAllowedApiUrl('http://127.0.0.1:8080/x')).toBe(true);
    expect(isAllowedApiUrl('http://localhost/x')).toBe(true);
    expect(isAllowedApiUrl('http://api.example.org/x')).toBe(false);
    expect(isAllowedApiUrl('https://user:pw@api.example.org/x')).toBe(false);
    expect(isAllowedApiUrl('file:///etc/passwd')).toBe(false);
  });
});

const src = (o: Partial<OnlineBible> & Pick<OnlineBible, 'provider'>): OnlineBible =>
  OnlineBibleSchema.parse({ id: 'ol-test1', name: 'Test', abbreviation: 'TST', ...o });

describe('providers', () => {
  it('ESV: asks for the chapter by name with the key as a token, and checks the reply', () => {
    const p = PROVIDERS.esv;
    const req = p.request(src({ provider: 'esv' }), 'JHN', 3, 'k1');
    expect(req.url.startsWith('https://api.esv.org/v3/passage/text/?q=John+3&')).toBe(true);
    expect(req.url).toContain('include-headings=false');
    expect(req.url).toContain('include-footnotes=false');
    expect(req.headers.Authorization).toBe('Token k1');
    const reply = { parsed: [[43003001, 43003002]], passages: ['  [1] Alpha one. [2] Alpha two.'] };
    expect(p.parse(reply, 'JHN', 3, src({ provider: 'esv' })).verses).toEqual([
      'Alpha one.',
      'Alpha two.',
    ]);
    expect(() =>
      p.parse({ ...reply, parsed: [[43004001, 43004002]] }, 'JHN', 3, src({ provider: 'esv' })),
    ).toThrow();
  });
  it('API.Bible: plain text without titles or notes; its copyright and Fair Use token', () => {
    const p = PROVIDERS.apibible;
    const s = src({ provider: 'apibible', remoteId: 'de4e12af7f28f599-02' });
    const req = p.request(s, 'GEN', 1, 'k2');
    expect(req.url).toBe(
      'https://rest.api.bible/v1/bibles/de4e12af7f28f599-02/chapters/GEN.1?content-type=text&include-notes=false&include-titles=false&include-chapter-numbers=false&include-verse-numbers=true&include-verse-spans=false',
    );
    expect(req.headers['api-key']).toBe('k2');
    const out = p.parse(
      {
        data: { id: 'GEN.1', content: '     [1] Beta one. \n', copyright: 'Public Domain' },
        meta: { fumsToken: 'tok' },
      },
      'GEN',
      1,
      s,
    );
    expect(out).toEqual({ verses: ['Beta one.'], copyright: 'Public Domain', fumsToken: 'tok' });
  });
  it('bible-api.com and getBible: verse lists, with the book name in the version’s language', () => {
    const b = PROVIDERS.bibleapi.request(
      src({ provider: 'bibleapi', remoteId: 'cuv' }),
      'JUD',
      1,
      '',
    );
    expect(b.url).toBe(
      'https://bible-api.com/jude+1?translation=cuv&single_chapter_book_matching=indifferent',
    );
    expect(
      PROVIDERS.bibleapi.parse(
        { verses: [{ book_name: 'Judas', chapter: 1, verse: 1, text: 'Gamma.\n' }] },
        'JUD',
        1,
        src({ provider: 'bibleapi' }),
      ),
    ).toEqual({ verses: ['Gamma.'], bookName: 'Judas' });
    const g = PROVIDERS.getbible.request(
      src({ provider: 'getbible', remoteId: 'kjv' }),
      'JHN',
      3,
      '',
    );
    expect(g.url).toBe('https://api.getbible.net/v2/kjv/43/3.json');
  });
  it('custom: the template, the key header, and verses found by path', () => {
    const s = src({
      provider: 'custom',
      custom: {
        urlTemplate: 'https://bibles.example.org/{book}/{chapter}',
        keyHeader: 'Authorization',
        keyPrefix: 'Bearer ',
        format: 'verses',
        versesPath: 'data.verses',
        textField: 'content',
        numberField: 'num',
        textPath: '',
      },
    });
    const req = PROVIDERS.custom.request(s, 'PSA', 23, 'k3');
    expect(req).toEqual({
      url: 'https://bibles.example.org/PSA/23',
      headers: { Authorization: 'Bearer k3' },
    });
    expect(
      PROVIDERS.custom.parse({ data: { verses: [{ num: 1, content: 'Delta.' }] } }, 'PSA', 23, s)
        .verses,
    ).toEqual(['Delta.']);
  });
});

describe('what is kept on this computer', () => {
  const verses = (n: number) => Array.from({ length: n }, (_, i) => `v${i + 1}`);
  // John: 879 verses in the KJV, so at most 439 of it may be kept.
  const totals = (b: BookId) => (b === 'JHN' ? 879 : b === 'JUD' ? 25 : 1000);
  const policy = { maxVerses: 500, halfBook: true, maxAgeDays: 30 };

  it('never more than half a book, dropping the least recently used chapters of it', () => {
    let t = 0;
    const c = new ChapterCache(emptyCache(), policy, totals, () => ++t);
    for (let ch = 1; ch <= 10; ch++) c.put('JHN', ch, verses(50));
    expect(c.verseCount()).toBeLessThanOrEqual(439);
    expect(c.get('JHN', 1)).toBeNull(); // the oldest went first
    expect(c.get('JHN', 10)).not.toBeNull();
  });
  it('never more than 500 verses in all', () => {
    let t = 0;
    const c = new ChapterCache(emptyCache(), policy, totals, () => ++t);
    for (let ch = 1; ch <= 8; ch++) c.put('GEN', ch, verses(100));
    expect(c.verseCount()).toBeLessThanOrEqual(500);
  });
  it('a chapter that is more than half its book is held in memory only', () => {
    const c = new ChapterCache(emptyCache(), policy, totals);
    expect(c.put('JUD', 1, verses(25))).toBe(false);
    expect(c.get('JUD', 1)).toHaveLength(25);
    expect(c.file.chapters['JUD.1']).toBeUndefined();
    expect(c.file.counts.JUD).toEqual([25]);
  });
  it('drops chapters older than the provider allows', () => {
    let now = 0;
    const c = new ChapterCache(emptyCache(), policy, totals, () => now);
    c.put('GEN', 1, verses(10));
    now = 31 * 24 * 60 * 60 * 1000;
    expect(c.get('GEN', 1)).toBeNull();
  });
});

describe('the online Bible manager', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ls-online-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const keys = (): KeyStore & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return {
      data,
      get: (n) => Promise.resolve(data.get(n) ?? null),
      set: (n, v) => {
        data.set(n, v);
        return Promise.resolve();
      },
      delete: (n) => {
        data.delete(n);
        return Promise.resolve();
      },
      names: () => Promise.resolve(new Set(data.keys())),
    };
  };
  const reply = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  const log = { info: () => {}, warn: () => {}, error: () => {}, child: () => log } as never;
  const kjvCounts = () => Promise.resolve({ JHN: Array.from({ length: 21 }, () => 40) }) as never;

  it('fetches once, then serves the saved chapter, even offline', async () => {
    const calls: string[] = [];
    let online = true;
    const fetch: Fetch = (url) => {
      calls.push(url);
      if (!online) return Promise.reject(new Error('offline'));
      return Promise.resolve(reply(200, { verses: [{ verse: 1, text: 'Epsilon.' }] }));
    };
    const ks = keys();
    const m = new OnlineBibles({ dir, keys: ks, fetch, log, kjvCounts });
    m.setSources([src({ provider: 'bibleapi', remoteId: 'web' })]);
    expect(await m.chapter('ol-test1', 'JHN', 3)).toEqual(['Epsilon.']);
    online = false;
    expect(await m.chapter('ol-test1', 'JHN', 3)).toEqual(['Epsilon.']);
    expect(calls).toHaveLength(1);
    await expect(m.chapter('ol-test1', 'JHN', 4)).rejects.toThrow(/internet connection/);
    await m.flush();
    expect(
      JSON.parse(await readFile(join(dir, 'ol-test1.json'), 'utf8')).chapters['JHN.3'],
    ).toBeTruthy();
  });

  it('needs a key where the provider does, sends it, and says when it is refused', async () => {
    const ks = keys();
    const seen: Record<string, string>[] = [];
    const fetch: Fetch = (_url, init) => {
      seen.push(init.headers);
      return Promise.resolve(reply(401, {}));
    };
    const m = new OnlineBibles({ dir, keys: ks, fetch, log, kjvCounts });
    m.setSources([src({ provider: 'esv' })]);
    await expect(m.chapter('ol-test1', 'JHN', 3)).rejects.toThrow(/needs its API key/);
    ks.data.set('online-bible:ol-test1', 'secret-key');
    await expect(m.chapter('ol-test1', 'JHN', 3)).rejects.toThrow(/didn't accept the API key/);
    expect(seen[0]?.Authorization).toBe('Token secret-key');
    const [status] = await m.status();
    expect(status).toMatchObject({ hasKey: true, savedVerses: 0, maxVerses: 500 });
    expect(status?.lastError).toMatch(/didn't accept/);
  });

  it('keeps within the provider’s request limits', async () => {
    const fetch: Fetch = () =>
      Promise.resolve(reply(200, { verses: [{ verse: 1, text: 'Zeta.' }] }));
    const m = new OnlineBibles({ dir, keys: keys(), fetch, log, kjvCounts, now: () => 1000 });
    m.setSources([src({ provider: 'bibleapi' })]);
    for (let ch = 1; ch <= 15; ch++) await m.chapter('ol-test1', 'JHN', ch);
    await expect(m.chapter('ol-test1', 'JHN', 16)).rejects.toThrow(/Too many requests/);
  });

  it('asks for a chapter only once at a time, and corrects verse counts from replies', async () => {
    let calls = 0;
    const fetch: Fetch = () => {
      calls++;
      return Promise.resolve(
        reply(200, {
          verses: [
            { verse: 1, text: 'a' },
            { verse: 2, text: 'b' },
          ],
        }),
      );
    };
    const m = new OnlineBibles({ dir, keys: keys(), fetch, log, kjvCounts });
    m.setSources([src({ provider: 'getbible' })]);
    await Promise.all([m.chapter('ol-test1', 'JHN', 1), m.chapter('ol-test1', 'JHN', 1)]);
    expect(calls).toBe(1);
    const counts = await m.verseCounts('ol-test1');
    expect(counts.JHN?.[0]).toBe(2);
    expect(counts.JHN?.[1]).toBe(40);
  });

  it('tries a source before it is added, and lists API.Bible versions', async () => {
    const fetch: Fetch = (url) =>
      Promise.resolve(
        url.endsWith('/bibles')
          ? reply(200, {
              data: [
                {
                  id: 'b1',
                  name: 'Twi Bible',
                  abbreviation: 'TWI',
                  language: { id: 'twi', scriptDirection: 'LTR' },
                },
              ],
            })
          : reply(200, {
              verses: Array.from({ length: 16 }, (_, i) => ({ verse: i + 1, text: `t${i + 1}` })),
            }),
      );
    const m = new OnlineBibles({ dir, keys: keys(), fetch, log, kjvCounts });
    expect((await m.probe(src({ provider: 'bibleapi' }), '')).sample).toBe('t16');
    expect(await m.apiBibleCatalog('k')).toEqual([
      { id: 'b1', name: 'Twi Bible', abbreviation: 'TWI', language: 'tw', direction: 'ltr' },
    ]);
  });
});

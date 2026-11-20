/**
 * SearchWorker — runs in an Electron utilityProcess so indexing/search never blocks the main
 * thread or a renderer (§3.2). Holds MiniSearch indexes for installed Bibles and songs.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import MiniSearch from 'minisearch';
import { BOOK_IDS, stripBibleMarkup, type BookId } from '@lampstand/core';
import type { SearchHit } from '@lampstand/ipc-contract';
import { normalizeText } from './normalize';
import type { FromWorker, SongDoc, ToWorker } from './protocol';

interface VerseDoc {
  id: string;
  b: BookId;
  c: number;
  v: number;
  text: string;
}

const port = process.parentPort;
let biblesDir = '';
let cacheDir = '';
const verseIndexes = new Map<
  string,
  { checksum: string; index: MiniSearch<VerseDoc>; texts: Map<string, string> }
>();
/** Installed versions (id → checksum). Each is indexed the first time it's searched (an index is
 *  about 60 MB, so a dozen Bibles indexed up front would be most of a gigabyte). */
const installed = new Map<string, string>();
const indexing = new Map<string, Promise<void>>();
let songIndex: MiniSearch<SongDoc> | null = null;
let songsById = new Map<string, SongDoc>();

const send = (m: FromWorker): void => port.postMessage(m);

const VERSE_OPTIONS = {
  fields: ['text'],
  storeFields: ['b', 'c', 'v'],
  processTerm: (t: string) => normalizeText(t) || null,
};

async function indexBible(versionId: string, checksum: string): Promise<void> {
  const started = Date.now();
  const texts = new Map<string, string>();
  const docs: VerseDoc[] = [];
  for (const b of BOOK_IDS) {
    let raw: string;
    try {
      raw = await readFile(join(biblesDir, versionId, 'books', `${b}.json`), 'utf8');
    } catch {
      continue;
    }
    const book = JSON.parse(raw) as { chapters: string[][] };
    book.chapters.forEach((verses, ci) =>
      verses.forEach((t, vi) => {
        const id = `${b}.${ci + 1}.${vi + 1}`;
        const clean = stripBibleMarkup(t);
        texts.set(id, clean);
        docs.push({ id, b, c: ci + 1, v: vi + 1, text: clean });
      }),
    );
  }
  // Cached index keyed by module checksum keeps startup fast (§6.2).
  const key = createHash('sha256').update(`${versionId}|${checksum}|v1`).digest('hex').slice(0, 16);
  const cacheFile = join(cacheDir, `verses-${versionId}-${key}.json`);
  let index: MiniSearch<VerseDoc>;
  try {
    index = await MiniSearch.loadJSONAsync(await readFile(cacheFile, 'utf8'), VERSE_OPTIONS);
  } catch {
    index = new MiniSearch<VerseDoc>(VERSE_OPTIONS);
    await index.addAllAsync(docs, { chunkSize: 2000 });
    await mkdir(cacheDir, { recursive: true });
    await writeFile(cacheFile, JSON.stringify(index)).catch(() => undefined);
  }
  verseIndexes.set(versionId, { checksum, index, texts });
  send({ type: 'indexed', what: 'bible', versionId, ms: Date.now() - started });
}

/** Index a version if it's installed and not indexed (or indexing) already. */
function ensureIndexed(versionId: string): Promise<void> {
  const checksum = installed.get(versionId);
  if (checksum === undefined || verseIndexes.get(versionId)?.checksum === checksum)
    return Promise.resolve();
  let p = indexing.get(versionId);
  if (!p) {
    p = indexBible(versionId, checksum).finally(() => indexing.delete(versionId));
    indexing.set(versionId, p);
  }
  return p;
}

function indexSongs(docs: SongDoc[]): void {
  const started = Date.now();
  songsById = new Map(docs.map((d) => [d.id, d]));
  songIndex = new MiniSearch<SongDoc>({
    fields: ['title', 'firstLine', 'lyrics', 'authors', 'ccli', 'hymn', 'tags'],
    storeFields: ['id'],
    processTerm: (t) => normalizeText(t) || null,
    searchOptions: {
      boost: { title: 4, firstLine: 2, hymn: 3, ccli: 3 },
      prefix: true,
      fuzzy: 0.2,
    },
  });
  songIndex.addAll(docs);
  send({ type: 'indexed', what: 'songs', ms: Date.now() - started });
}

function query(text: string, limit: number, versionId?: string): SearchHit[] {
  const q = text.trim();
  if (q.length < 2) return [];
  const norm = normalizeText(q);
  const hits: SearchHit[] = [];
  if (songIndex) {
    for (const r of songIndex.search(q).slice(0, limit)) {
      const d = songsById.get(String(r.id));
      if (!d) continue;
      hits.push({
        kind: d.isHymn ? 'hymn' : 'song',
        id: d.id,
        title: d.title,
        subtitle: d.hymn ? `#${d.hymn.replace(/^h/, '')} · ${d.firstLine}` : d.firstLine,
        score: r.score * 1.2,
      });
    }
  }
  // One version when asked for; otherwise those indexed so far.
  const versions =
    versionId && verseIndexes.has(versionId) ? [versionId] : [...verseIndexes.keys()];
  for (const vid of versions) {
    const entry = verseIndexes.get(vid);
    if (!entry) continue;
    const results = entry.index.search(q, {
      prefix: (t, i, all) => i === all.length - 1,
      fuzzy: (t) => (t.length > 4 ? 0.2 : 0),
      combineWith: 'AND',
    });
    for (const r of results.slice(0, limit * 2)) {
      const t = entry.texts.get(String(r.id)) ?? '';
      // Phrase matches outrank scattered-word matches.
      const phrase = norm.includes(' ') && normalizeText(t).includes(norm) ? 3 : 1;
      const b = r.b as BookId;
      const c = r.c as number;
      const v = r.v as number;
      hits.push({
        kind: 'verse',
        id: `${vid}:${String(r.id)}`,
        title: t,
        subtitle: `${b} ${c}:${v} ${vid.toUpperCase()}`,
        score: r.score * phrase,
        ref: { versionId: vid, book: b, chapter: c, verse: v },
      });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

port.on('message', (e: { data: ToWorker }) => {
  const m = e.data;
  void (async () => {
    try {
      switch (m.type) {
        case 'init':
          biblesDir = m.biblesDir;
          cacheDir = m.cacheDir;
          send({ type: 'ready' });
          break;
        case 'bibles':
          installed.clear();
          for (const v of m.versions) installed.set(v.id, v.checksum);
          // Drop indexes of versions removed or changed; the default is indexed now.
          for (const [id, e] of [...verseIndexes])
            if (installed.get(id) !== e.checksum) verseIndexes.delete(id);
          if (m.warm) await ensureIndexed(m.warm);
          break;
        case 'songs':
          indexSongs(m.docs);
          break;
        case 'query': {
          const t = Date.now();
          if (m.versionId) await ensureIndexed(m.versionId);
          send({
            type: 'result',
            id: m.id,
            hits: query(m.text, m.limit, m.versionId),
            ms: Date.now() - t,
          });
          break;
        }
      }
    } catch (err) {
      send({
        type: 'error',
        id: m.type === 'query' ? m.id : undefined,
        message: err instanceof Error ? err.message : 'error',
      });
    }
  })();
});

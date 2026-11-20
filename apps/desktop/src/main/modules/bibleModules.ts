import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AppError,
  BibleBookFileSchema,
  BibleModuleManifestSchema,
  BibleVersionInfoSchema,
  BOOK_IDS,
  type BibleBookFile,
  type BibleVersionInfo,
  type BookId,
} from '@lampstand/core';
import { listDir, readJson, writeFileAtomic, writeJsonAtomic } from '../storage/atomic';
import { installIntoPlace, parseJsonBytes, sha256 } from './packageIo';
import { safeUnzip, ZipError } from './zip';
import { type InstallOptions } from '../types';
import { MODULE_LIMITS } from '../constants';

/**
 * Install pipeline (§8.3): size/zip limits → checksum → zip-slip-safe extract in memory →
 * per-file sha256 → Zod-validate every JSON → write to staging → atomic rename into place.
 * Signature verification for catalog downloads plugs in before this (Phase 4).
 */
export async function installBibleModule(
  zip: Uint8Array,
  o: InstallOptions,
): Promise<BibleVersionInfo> {
  if (zip.byteLength > MODULE_LIMITS.maxTotalBytes)
    throw new AppError('module-too-large', 'Module is too large.');
  const moduleSum = sha256(zip);
  if (o.expectedSha256 && o.expectedSha256 !== moduleSum)
    throw new AppError('module-checksum', 'Module checksum does not match.');
  let entries: Map<string, Uint8Array>;
  try {
    entries = safeUnzip(zip, MODULE_LIMITS);
  } catch (e) {
    throw new AppError(
      'module-invalid',
      e instanceof ZipError ? `Module archive rejected (${e.code}).` : 'Module archive is invalid.',
    );
  }
  const manifestBytes = entries.get('manifest.json');
  if (!manifestBytes) throw new AppError('module-invalid', 'Module has no manifest.');
  const manifestParsed = BibleModuleManifestSchema.safeParse(parseJsonBytes(manifestBytes));
  if (!manifestParsed.success) throw new AppError('module-invalid', 'Module manifest is invalid.');
  const manifest = manifestParsed.data;

  const verseCounts: Partial<Record<BookId, number[]>> = {};
  for (const f of manifest.files) {
    const bytes = entries.get(f.path);
    if (!bytes || bytes.byteLength !== f.size || sha256(bytes) !== f.sha256) {
      throw new AppError('module-tampered', 'Module contents do not match its manifest.');
    }
    if (f.path.startsWith('books/')) {
      const book = BibleBookFileSchema.safeParse(parseJsonBytes(bytes));
      if (!book.success || `books/${book.data.book}.json` !== f.path)
        throw new AppError('module-invalid', 'A book file in the module is invalid.');
      verseCounts[book.data.book] = book.data.chapters.map((c) => c.length);
    }
  }
  if (Object.keys(verseCounts).length === 0)
    throw new AppError('module-invalid', 'Module contains no books.');

  const info: BibleVersionInfo = {
    ...manifest.version,
    source: o.source,
    checksumSha256: moduleSum,
  };
  await installIntoPlace(o.root, info.id, async (dir) => {
    for (const f of manifest.files) {
      const bytes = entries.get(f.path);
      if (bytes) await writeFileAtomic(join(dir, f.path), bytes);
    }
    await writeJsonAtomic(join(dir, 'version.json'), info);
    await writeJsonAtomic(join(dir, 'verse-counts.json'), verseCounts);
  });
  return info;
}

/** Read access to installed Bibles with a small per-book cache (per-book files → fast loads). */
export class BibleStore {
  private versions = new Map<string, BibleVersionInfo>();
  private counts = new Map<string, Partial<Record<BookId, number[]>>>();
  private names = new Map<string, Partial<Record<BookId, string>>>();
  private books = new Map<string, BibleBookFile>();

  constructor(private readonly root: string) {}

  async refresh(): Promise<BibleVersionInfo[]> {
    this.versions.clear();
    this.counts.clear();
    this.names.clear();
    this.books.clear();
    const dirs = (await listDir(this.root))
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name);
    for (const d of dirs) {
      const res = await readJson(join(this.root, d, 'version.json'), BibleVersionInfoSchema);
      if (res.status === 'ok') this.versions.set(res.value.id, res.value);
    }
    return this.list();
  }

  list(): BibleVersionInfo[] {
    return [...this.versions.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async verseCounts(versionId: string): Promise<Partial<Record<BookId, number[]>>> {
    const cached = this.counts.get(versionId);
    if (cached) return cached;
    if (!this.versions.has(versionId))
      throw new AppError('bible-not-found', 'That Bible version is not installed.');
    const raw = JSON.parse(
      await readFile(join(this.root, versionId, 'verse-counts.json'), 'utf8'),
    ) as unknown;
    const out: Partial<Record<BookId, number[]>> = {};
    if (raw && typeof raw === 'object') {
      for (const id of BOOK_IDS) {
        const v = (raw as Record<string, unknown>)[id];
        if (Array.isArray(v) && v.every((n) => typeof n === 'number')) out[id] = v;
      }
    }
    this.counts.set(versionId, out);
    return out;
  }

  /**
   * The version's own book names, from its book files ("Genesi", "1 Corinzi"). English versions
   * get none: the built-in names know "Psalm 23" from "Psalms 23–24".
   */
  async bookNames(versionId: string): Promise<Partial<Record<BookId, string>>> {
    const cached = this.names.get(versionId);
    if (cached) return cached;
    const info = this.versions.get(versionId);
    if (!info) throw new AppError('bible-not-found', 'That Bible version is not installed.');
    const out: Partial<Record<BookId, string>> = {};
    if (!/^en\b/i.test(info.language))
      for (const id of BOOK_IDS) {
        const res = await readJson(
          join(this.root, versionId, 'books', `${id}.json`),
          BibleBookFileSchema,
        );
        if (res.status === 'ok' && res.value.name.trim()) out[id] = res.value.name.trim();
      }
    this.names.set(versionId, out);
    return out;
  }

  async book(versionId: string, book: BookId): Promise<BibleBookFile | null> {
    const key = `${versionId}/${book}`;
    const hit = this.books.get(key);
    if (hit) return hit;
    if (!this.versions.has(versionId)) return null;
    const res = await readJson(
      join(this.root, versionId, 'books', `${book}.json`),
      BibleBookFileSchema,
    );
    if (res.status !== 'ok') return null;
    this.books.set(key, res.value);
    if (this.books.size > 40) {
      const first = this.books.keys().next().value;
      if (first) this.books.delete(first);
    }
    return res.value;
  }

  async chapter(versionId: string, book: BookId, chapter: number): Promise<string[]> {
    const b = await this.book(versionId, book);
    return b?.chapters[chapter - 1] ?? [];
  }
}

import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BibleStore, installBibleModule } from './bibleModules';
import { installHymnalModule, readHymnals } from './hymnalModules';
import { isSafeEntryName, safeUnzip, ZipError } from './zip';
import { MODULE_LIMITS } from '../constants';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ls-mod-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

function bibleZip(opts: { tamper?: boolean; extra?: Record<string, Uint8Array> } = {}): Uint8Array {
  const book = strToU8(
    JSON.stringify({
      book: 'JHN',
      name: 'John',
      chapters: [['In the beginning was the Word'], ['v1', 'v2']],
    }),
  );
  const manifest = {
    format: 'lampstand-bible',
    formatVersion: 1,
    version: {
      id: 'test',
      name: 'Test Version',
      abbreviation: 'TST',
      language: 'en',
      direction: 'ltr',
      versification: 'kjv',
      license: { kind: 'public-domain', text: 'PD' },
      source: 'bundled',
      checksumSha256: '',
      moduleVersion: '1',
    },
    files: [{ path: 'books/JHN.json', sha256: sha(book), size: book.byteLength }],
  };
  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'books/JHN.json': opts.tamper
      ? strToU8(JSON.stringify({ book: 'JHN', name: 'John', chapters: [['evil']] }))
      : book,
    ...opts.extra,
  };
  return zipSync(files);
}

describe('zip guards', () => {
  it('rejects zip-slip entry names', async () => {
    for (const bad of ['../x', '/etc/passwd', 'a/../../b', 'C:\\x', 'a\\b', './a'])
      expect(isSafeEntryName(bad)).toBe(false);
    expect(isSafeEntryName('books/GEN.json')).toBe(true);
    await expect(
      safeUnzip(zipSync({ '../evil.txt': strToU8('x') }), MODULE_LIMITS),
    ).rejects.toThrow(ZipError);
  });
  it('rejects zip bombs by ratio and size', async () => {
    const bomb = zipSync({ 'a.json': [new Uint8Array(5 * 1024 * 1024), { level: 9 }] });
    await expect(safeUnzip(bomb, MODULE_LIMITS)).rejects.toThrow(/zip-ratio|zip-too-large/);
  });
  it('rejects too many files and garbage', async () => {
    const many: Record<string, Uint8Array> = {};
    for (let i = 0; i < 400; i++) many[`f${i}.json`] = strToU8('{}');
    await expect(safeUnzip(zipSync(many), MODULE_LIMITS)).rejects.toThrow(/zip-too-many/);
    await expect(safeUnzip(strToU8('not a zip'), MODULE_LIMITS)).rejects.toThrow(ZipError);
  });
});

describe('Bible module install pipeline', () => {
  it('installs a valid module and serves chapters', async () => {
    const info = await installBibleModule(bibleZip(), { root: dir, source: 'imported' });
    expect(info.source).toBe('imported');
    expect(info.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    const store = new BibleStore(dir);
    await store.refresh();
    expect(store.list().map((v) => v.id)).toEqual(['test']);
    expect(await store.chapter('test', 'JHN', 2)).toEqual(['v1', 'v2']);
    expect((await store.verseCounts('test')).JHN).toEqual([1, 2]);
  });
  it('rejects tampered contents', async () => {
    await expect(
      installBibleModule(bibleZip({ tamper: true }), { root: dir, source: 'imported' }),
    ).rejects.toThrow(/do not match/);
  });
  it('rejects a checksum mismatch from a catalog', async () => {
    await expect(
      installBibleModule(bibleZip(), {
        root: dir,
        source: 'downloaded',
        expectedSha256: 'f'.repeat(64),
      }),
    ).rejects.toThrow(/checksum/);
  });
  it('rejects zip-slip inside a module', async () => {
    await expect(
      installBibleModule(bibleZip({ extra: { '../../escape.json': strToU8('{}') } }), {
        root: dir,
        source: 'imported',
      }),
    ).rejects.toThrow(/rejected/);
  });
});

describe('hymnal packages', () => {
  const hymnal = {
    format: 'lampstand-hymnal',
    formatVersion: 1,
    id: 'test-hymns',
    name: 'Test Hymns',
    license: 'PD',
    hymns: [
      {
        number: '1',
        title: 'One',
        authors: [],
        sections: [{ kind: 'verse', label: 'Verse 1', lines: ['a'] }],
      },
    ],
  };
  it('installs plain JSON and .lshymnal zips', async () => {
    await installHymnalModule(strToU8(JSON.stringify(hymnal)), dir);
    const json = strToU8(JSON.stringify({ ...hymnal, id: 'zipped' }));
    const manifest = {
      format: 'lampstand-hymnal-module',
      formatVersion: 1,
      file: { path: 'hymnal.json', sha256: sha(json), size: json.byteLength },
    };
    await installHymnalModule(
      zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'hymnal.json': json }),
      dir,
    );
    expect((await readHymnals(dir, 'installed')).map((h) => h.id).sort()).toEqual([
      'test-hymns',
      'zipped',
    ]);
    expect(JSON.parse(await readFile(join(dir, 'zipped', 'hymnal.json'), 'utf8')).name).toBe(
      'Test Hymns',
    );
  });
  it('rejects invalid hymnals', async () => {
    await expect(installHymnalModule(strToU8('{"format":"nope"}'), dir)).rejects.toThrow(
      /not a valid/,
    );
  });
});

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BibleStore, installBibleModule } from './bibleModules';
import { installHymnalModule, readHymnals } from './hymnalModules';
import { isSafeEntryName, safeUnzip, ZipError } from './zip';
import { MODULE_LIMITS } from '../constants';
import { clearInstallLeftovers, installIntoPlace } from './packageIo';
import { packageKind } from './packageKind';
import { installBundledBibles } from '../app/services';
import type { AppPaths, Logger } from '../types';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ls-mod-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

function bibleZip(
  opts: { tamper?: boolean; extra?: Record<string, Uint8Array>; verse?: string } = {},
): Uint8Array {
  const book = strToU8(
    JSON.stringify({
      book: 'JHN',
      name: 'John',
      chapters: [[opts.verse ?? 'In the beginning was the Word'], ['v1', 'v2']],
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
  it('says a file that isn’t a zip is damaged, not unsafe', async () => {
    await expect(
      installBibleModule(strToU8('just some notes'), { root: dir, source: 'imported' }),
    ).rejects.toThrow(/damaged or isn’t a zip file/);
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

describe('what a package is', () => {
  it('reads the kind from the contents, not the name', async () => {
    expect(await packageKind(bibleZip())).toBe('bible');
    const json = strToU8(JSON.stringify({ format: 'lampstand-hymnal', id: 'x' }));
    expect(await packageKind(json)).toBe('hymnal');
    const manifest = strToU8(JSON.stringify({ format: 'lampstand-hymnal-module' }));
    expect(await packageKind(zipSync({ 'manifest.json': manifest }))).toBe('hymnal');
    expect(await packageKind(zipSync({ 'GEN.usfm': strToU8('\\id GEN') }))).toBeNull();
    expect(await packageKind(strToU8('not a package'))).toBeNull();
  });
});

describe('installing into place', () => {
  it('replaces an installed copy and leaves nothing behind', async () => {
    await installIntoPlace(dir, 'v', (d) => writeFile(join(d, 'a.txt'), 'one'));
    await installIntoPlace(dir, 'v', (d) => writeFile(join(d, 'a.txt'), 'two'));
    expect(await readFile(join(dir, 'v', 'a.txt'), 'utf8')).toBe('two');
    expect(await readdir(dir)).toEqual(['v']);
  });
  it('keeps the installed copy when writing the new one fails', async () => {
    await installIntoPlace(dir, 'v', (d) => writeFile(join(d, 'a.txt'), 'one'));
    await expect(
      installIntoPlace(dir, 'v', () => Promise.reject(new Error('disk full'))),
    ).rejects.toThrow('disk full');
    expect(await readFile(join(dir, 'v', 'a.txt'), 'utf8')).toBe('one');
    expect(await readdir(dir)).toEqual(['v']);
  });
  it('clears what an interrupted install left', async () => {
    await mkdir(join(dir, '.staging-v-1'));
    await mkdir(join(dir, '.old-v-2'));
    await mkdir(join(dir, 'v'));
    await clearInstallLeftovers(dir);
    expect(await readdir(dir)).toEqual(['v']);
  });
});

describe('bundled Bibles', () => {
  const log = { info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger;
  it('keep a copy the user installed, and come back when it is removed', async () => {
    const paths = {
      resources: join(dir, 'res'),
      bibles: join(dir, 'bibles'),
      hymnals: join(dir, 'hymnals'),
    } as AppPaths;
    await mkdir(join(paths.resources, 'bibles'), { recursive: true });
    await writeFile(join(paths.resources, 'bibles', 'test.lsbible'), bibleZip());
    const store = new BibleStore(paths.bibles);
    await installBundledBibles(paths, store, log);
    expect(store.list().map((v) => v.source)).toEqual(['bundled']);
    // The user installs their own edition of the same version: it survives a restart.
    await installBibleModule(bibleZip({ verse: 'Their edition' }), {
      root: paths.bibles,
      source: 'imported',
    });
    await installBundledBibles(paths, store, log);
    expect(store.list().map((v) => v.source)).toEqual(['imported']);
    expect(await store.chapter('test', 'JHN', 1)).toEqual(['Their edition']);
    // Removed: the bundled one is back.
    await rm(join(paths.bibles, 'test'), { recursive: true });
    await installBundledBibles(paths, store, log);
    expect(store.list().map((v) => v.source)).toEqual(['bundled']);
  });
});

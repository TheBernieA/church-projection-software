import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SongSchema, type Song } from '@lampstand/core';
import { createEmptySong } from '@lampstand/lyrics';
import { nullLogger } from '../app/logger';
import { cleanupTempFiles, writeJsonAtomic } from './atomic';
import { JsonFileRepository } from './jsonFileRepository';
import { MemoryRepository } from './repository';
import { type Repository } from '../types';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ls-store-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const song = (title: string): Song => createEmptySong(title, '2026-01-01T00:00:00.000Z');

/** Contract tests — run against every Repository implementation (§6.3). */
function contract(name: string, make: () => Repository<Song>): void {
  describe(`Repository contract: ${name}`, () => {
    it('upsert/get/list/remove', async () => {
      const repo = make();
      const a = await repo.upsert(song('A'));
      await repo.upsert(song('B'));
      expect((await repo.get(a.id))?.title).toBe('A');
      expect(await repo.list()).toHaveLength(2);
      await repo.remove(a.id);
      expect(await repo.get(a.id)).toBeNull();
      expect(await repo.list({ limit: 5 })).toHaveLength(1);
    });
    it('notifies watchers', async () => {
      const repo = make();
      const seen: string[] = [];
      const off = repo.watch((c) => seen.push(c.type));
      const s = await repo.upsert(song('A'));
      await repo.remove(s.id);
      off();
      await repo.upsert(song('C'));
      expect(seen).toEqual(['upsert', 'remove']);
    });
  });
}

const jsonRepo = (onQuarantine?: (f: string) => void) =>
  new JsonFileRepository<Song>({
    dir,
    suffix: '.song.json',
    schema: SongSchema,
    schemaVersion: 1,
    quarantineRoot: dir,
    log: nullLogger,
    onQuarantine,
  });

contract('memory', () => new MemoryRepository<Song>());
contract('json-file', () => jsonRepo());

describe('JsonFileRepository', () => {
  it('persists across instances', async () => {
    const s = await jsonRepo().upsert(song('Persist'));
    expect((await jsonRepo().get(s.id))?.title).toBe('Persist');
  });
  it('quarantines invalid files instead of crashing', async () => {
    await writeFile(join(dir, 'bad.song.json'), '{ not json');
    await writeFile(join(dir, 'wrong.song.json'), JSON.stringify({ id: 'x' }));
    const quarantined: string[] = [];
    expect(await jsonRepo((f) => quarantined.push(f)).list()).toEqual([]);
    expect(quarantined.sort()).toEqual(['bad.song.json', 'wrong.song.json']);
    expect(await readdir(join(dir, 'quarantine'))).toHaveLength(2);
  });
  it('rejects unsafe ids (no path traversal)', async () => {
    await expect(jsonRepo().remove('../../etc/passwd')).rejects.toThrow();
  });
});

describe('atomic writes', () => {
  it('writes complete files and cleans stale temp files', async () => {
    const f = join(dir, 'a.json');
    await writeJsonAtomic(f, { ok: 1 });
    expect(JSON.parse(await readFile(f, 'utf8'))).toEqual({ ok: 1 });
    await writeFile(join(dir, 'b.json.tmp'), 'half');
    expect(await cleanupTempFiles(dir)).toBe(1);
  });
});

describe('SettingsStore.update', () => {
  it('changes only the keys in the patch (regression: Zod partial() reset defaults)', async () => {
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore(join(dir, 'settings.json'), dir, nullLogger);
    await store.load();
    store.update({ windowMode: true, liveEditingKinds: ['song'], shortcuts: { goLive: 'Enter' } });
    store.update({ uiScale: 1.2 });
    const s = store.get();
    expect(s.uiScale).toBe(1.2);
    expect(s.windowMode).toBe(true);
    expect(s.liveEditingKinds).toEqual(['song']);
    expect(s.shortcuts).toEqual({ goLive: 'Enter' });
    await store.flush();
  });
  it('rejects invalid values and keeps the previous settings', async () => {
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore(join(dir, 'settings.json'), dir, nullLogger);
    await store.load();
    expect(() => store.update({ uiScale: 9 })).toThrow();
    expect(store.get().uiScale).toBe(1);
    await store.flush();
  });
});

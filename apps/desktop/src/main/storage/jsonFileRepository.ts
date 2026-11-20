import { access, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { migrate, type EntityMeta, type ID, type Unsubscribe } from '@lampstand/core';
import { cleanupTempFiles, listDir, quarantine, readJson, writeJsonAtomic } from './atomic';
import {
  type JsonFileRepositoryOptions,
  type ListQuery,
  type RepoChange,
  type Repository,
} from '../types';

const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

/**
 * One JSON file per entity (§6.1). Reads are validated and migrated; invalid files are
 * quarantined, never fatal. Keeps an in-memory cache so lists are instant during a service.
 */
export class JsonFileRepository<T extends EntityMeta> implements Repository<T> {
  private cache: Map<ID, T> | null = null;
  private listeners = new Set<(c: RepoChange<T>) => void>();
  private loading: Promise<Map<ID, T>> | null = null;

  constructor(private readonly o: JsonFileRepositoryOptions<T>) {}

  private file(id: ID): string {
    if (!SAFE_ID.test(id)) throw new Error('Invalid id');
    return join(this.o.dir, `${id}${this.o.suffix}`);
  }

  private async load(): Promise<Map<ID, T>> {
    if (this.cache) return this.cache;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      await cleanupTempFiles(this.o.dir);
      const map = new Map<ID, T>();
      const names = (await listDir(this.o.dir))
        .filter((e) => e.isFile() && e.name.endsWith(this.o.suffix))
        .map((e) => e.name);
      await Promise.all(
        names.map(async (name) => {
          const value = await this.readOne(name);
          if (value) map.set(value.id, value);
        }),
      );
      this.cache = map;
      this.loading = null;
      return map;
    })();
    return this.loading;
  }

  /** One file, validated and migrated (an invalid one is quarantined: null). */
  private async readOne(name: string): Promise<T | null> {
    const path = join(this.o.dir, name);
    const state = { migrated: false };
    const res = await readJson(path, this.o.schema, (raw) => {
      const m = migrate(raw, this.o.schemaVersion, this.o.migrations ?? {});
      state.migrated = m.migrated;
      return m.value;
    });
    if (res.status === 'ok') {
      if (state.migrated) await writeJsonAtomic(path, res.value).catch(() => undefined);
      return res.value;
    }
    if (res.status === 'invalid') {
      this.o.log.warn('quarantined invalid file', { reason: res.reason });
      await quarantine(path, this.o.quarantineRoot).catch(() => undefined);
      this.o.onQuarantine?.(name);
    }
    return null;
  }

  async get(id: ID): Promise<T | null> {
    return (await this.load()).get(id) ?? null;
  }

  async list(q?: ListQuery): Promise<T[]> {
    const all = [...(await this.load()).values()];
    return q?.limit ? all.slice(0, q.limit) : all;
  }

  async upsert(entity: T): Promise<T> {
    const valid = this.o.schema.parse(entity);
    await writeJsonAtomic(this.file(valid.id), valid);
    (await this.load()).set(valid.id, valid);
    this.emit({ type: 'upsert', entity: valid });
    return valid;
  }

  async remove(id: ID): Promise<void> {
    await rm(this.file(id), { force: true });
    (await this.load()).delete(id);
    this.emit({ type: 'remove', id });
  }

  /**
   * Files that changed on disk (another app, a shared folder): read just those. Lampstand's own
   * saves come back here too, and change nothing (the file says what the cache already does),
   * so a save never costs a re-read of the whole folder.
   */
  async refreshFiles(paths: string[]): Promise<void> {
    const cache = await this.load();
    for (const path of paths) {
      const name = basename(path);
      if (!name.endsWith(this.o.suffix)) continue;
      const id = name.slice(0, -this.o.suffix.length);
      const value = SAFE_ID.test(id) ? await this.readOne(name) : null;
      const had = cache.get(id);
      if (value) {
        if (had && JSON.stringify(had) === JSON.stringify(value)) continue;
        cache.set(value.id, value);
        this.emit({ type: 'upsert', entity: value });
      } else if (had && !(await exists(path))) {
        cache.delete(id);
        this.emit({ type: 'remove', id });
      }
    }
  }

  /** Drop the cache and re-read from disk (external edits, shared folders). */
  async reload(): Promise<void> {
    this.cache = null;
    await this.load();
    this.emit({ type: 'reload' });
  }

  watch(cb: (c: RepoChange<T>) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(c: RepoChange<T>): void {
    for (const l of this.listeners) l(c);
  }
}

import type { EntityMeta, ID, Unsubscribe } from '@lampstand/core';

export interface ListQuery {
  limit?: number;
}

export type RepoChange<T> =
  { type: 'upsert'; entity: T } | { type: 'remove'; id: ID } | { type: 'reload' };

/**
 * Storage port (§6.3). v1: JsonFileRepository. Later: SQLite or cloud sync — no UI or command
 * code changes required. Contract tests run against every implementation.
 */
export interface Repository<T extends EntityMeta> {
  get(id: ID): Promise<T | null>;
  list(query?: ListQuery): Promise<T[]>;
  upsert(entity: T): Promise<T>;
  remove(id: ID): Promise<void>;
  watch(cb: (change: RepoChange<T>) => void): Unsubscribe;
}

/** In-memory implementation — used for tests and read-only collections (e.g. hymnals). */
export class MemoryRepository<T extends EntityMeta> implements Repository<T> {
  private items = new Map<ID, T>();
  private listeners = new Set<(c: RepoChange<T>) => void>();
  constructor(initial: T[] = []) {
    for (const i of initial) this.items.set(i.id, i);
  }
  get(id: ID): Promise<T | null> {
    return Promise.resolve(this.items.get(id) ?? null);
  }
  list(q?: ListQuery): Promise<T[]> {
    const all = [...this.items.values()];
    return Promise.resolve(q?.limit ? all.slice(0, q.limit) : all);
  }
  upsert(entity: T): Promise<T> {
    this.items.set(entity.id, entity);
    for (const l of this.listeners) l({ type: 'upsert', entity });
    return Promise.resolve(entity);
  }
  remove(id: ID): Promise<void> {
    this.items.delete(id);
    for (const l of this.listeners) l({ type: 'remove', id });
    return Promise.resolve();
  }
  watch(cb: (c: RepoChange<T>) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

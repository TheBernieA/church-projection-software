import type { EntityMeta, ID, Unsubscribe } from '@lampstand/core';
import { type ListQuery, type RepoChange, type Repository } from '../types';

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

import { z } from 'zod';
import {
  AppError,
  CommandBus,
  MediaPlaylistSchema,
  nowIso,
  ServicePlanSchema,
  SongSchema,
  ThemeSchema,
  type EntityMeta,
} from '@lampstand/core';
import { type Repository } from '../types';

interface EntityCommandsOptions<T extends EntityMeta> {
  bus: CommandBus;
  name: 'song' | 'service' | 'theme' | 'mediaPlaylist';
  schema: z.ZodType<T>;
  repo: Repository<T>;
  /** Reject edits to read-only entities (hymnal songs, built-in themes). */
  isReadOnly?: (e: T) => boolean;
}

/**
 * `<name>.save` and `<name>.delete` — undoable (§16 "Undo/redo for all editing"). Each handler
 * returns its inverse command, so redo falls out for free.
 */
/** Equal apart from bookkeeping timestamps. */
function sameContent(a: EntityMeta, b: EntityMeta): boolean {
  return JSON.stringify({ ...a, updatedAt: 0 }) === JSON.stringify({ ...b, updatedAt: 0 });
}

function registerEntityCommands<T extends EntityMeta>(o: EntityCommandsOptions<T>): void {
  const saveType = `${o.name}.save`;
  const deleteType = `${o.name}.delete`;

  o.bus.register({
    type: saveType,
    schema: z.object({ entity: o.schema }),
    undoable: true,
    handle: async ({ entity }) => {
      if (o.isReadOnly?.(entity))
        throw new AppError('read-only', 'This item is read-only. Duplicate it to make changes.');
      const prev = await o.repo.get(entity.id);
      // Saving identical content is a no-op: don't touch the file and don't add an undo step.
      if (prev && sameContent(prev, entity)) return { result: prev };
      const saved = await o.repo.upsert({ ...entity, updatedAt: nowIso() });
      return {
        result: saved,
        undo: prev
          ? { type: saveType, payload: { entity: prev } }
          : { type: deleteType, payload: { id: entity.id } },
      };
    },
  });

  o.bus.register({
    type: deleteType,
    schema: z.object({ id: z.string().max(64) }),
    undoable: true,
    handle: async ({ id }) => {
      const prev = await o.repo.get(id);
      if (!prev) return { result: false };
      if (o.isReadOnly?.(prev)) throw new AppError('read-only', 'This item is read-only.');
      await o.repo.remove(id);
      return { result: true, undo: { type: saveType, payload: { entity: prev } } };
    },
  });
}

export function registerLibraryCommands(
  bus: CommandBus,
  repos: {
    songs: Repository<z.infer<typeof SongSchema>>;
    services: Repository<z.infer<typeof ServicePlanSchema>>;
    themes: Repository<z.infer<typeof ThemeSchema>>;
    mediaPlaylists: Repository<z.infer<typeof MediaPlaylistSchema>>;
  },
): void {
  registerEntityCommands({
    bus,
    name: 'song',
    schema: SongSchema,
    repo: repos.songs,
    isReadOnly: (s) => s.origin === 'hymnal',
  });
  registerEntityCommands({ bus, name: 'service', schema: ServicePlanSchema, repo: repos.services });
  registerEntityCommands({
    bus,
    name: 'theme',
    schema: ThemeSchema,
    repo: repos.themes,
    isReadOnly: (t) => t.builtIn === true,
  });
  registerEntityCommands({
    bus,
    name: 'mediaPlaylist',
    schema: MediaPlaylistSchema,
    repo: repos.mediaPlaylists,
  });
}

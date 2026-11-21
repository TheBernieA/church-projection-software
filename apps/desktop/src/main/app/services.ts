import { mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  MEDIA_PLAYLIST_SCHEMA_VERSION,
  MEDIA_SCHEMA_VERSION,
  MediaItemSchema,
  MediaPlaylistSchema,
  SERVICE_SCHEMA_VERSION,
  ServicePlanSchema,
  SONG_SCHEMA_VERSION,
  SongSchema,
  ThemeSchema,
  type HymnalFile,
  type MediaItem,
  type MediaPlaylist,
  type ServicePlan,
  type Song,
  type Theme,
} from '@lampstand/core';
import { hymnToSong } from '@lampstand/lyrics';
import { JsonFileRepository } from '../storage/jsonFileRepository';
import { BibleStore, installBibleModule } from '../modules/bibleModules';
import { readHymnals } from '../modules/hymnalModules';
import { listDir, writeJsonAtomic } from '../storage/atomic';
import { clearInstallLeftovers, sha256 } from '../modules/packageIo';
import { type AppPaths, type InstalledHymnal, type Logger } from '../types';
import { errorMessage } from '../utils';

export async function ensureLibrary(library: string): Promise<void> {
  for (const d of [
    'songs',
    'services',
    'themes',
    'media-playlists',
    'media',
    join('media', '.thumbs'),
    join('media', '.meta'),
    'backgrounds',
  ]) {
    await mkdir(join(library, d), { recursive: true });
  }
  const manifest = join(library, 'library.manifest.json');
  try {
    await stat(manifest);
  } catch {
    await writeJsonAtomic(manifest, {
      format: 'lampstand-library',
      schemaVersion: 1,
      createdWith: 'lampstand 0.1.0',
    });
  }
}

export function createRepos(paths: AppPaths, log: Logger, onQuarantine: (f: string) => void) {
  const common = { quarantineRoot: paths.library, log, onQuarantine };
  return {
    songs: new JsonFileRepository<Song>({
      ...common,
      dir: join(paths.library, 'songs'),
      suffix: '.song.json',
      schema: SongSchema,
      schemaVersion: SONG_SCHEMA_VERSION,
    }),
    services: new JsonFileRepository<ServicePlan>({
      ...common,
      dir: join(paths.library, 'services'),
      suffix: '.service.json',
      schema: ServicePlanSchema,
      schemaVersion: SERVICE_SCHEMA_VERSION,
    }),
    themes: new JsonFileRepository<Theme>({
      ...common,
      dir: join(paths.library, 'themes'),
      suffix: '.theme.json',
      schema: ThemeSchema,
      schemaVersion: 1,
    }),
    mediaPlaylists: new JsonFileRepository<MediaPlaylist>({
      ...common,
      dir: join(paths.library, 'media-playlists'),
      suffix: '.mediaplaylist.json',
      schema: MediaPlaylistSchema,
      schemaVersion: MEDIA_PLAYLIST_SCHEMA_VERSION,
    }),
    media: new JsonFileRepository<MediaItem>({
      ...common,
      dir: join(paths.library, 'media', '.meta'),
      suffix: '.media.json',
      schema: MediaItemSchema,
      schemaVersion: MEDIA_SCHEMA_VERSION,
    }),
  };
}

/**
 * Install every bundled `.lsbible` in resources/bibles that isn't installed (or is older).
 * Generic: dropping another valid module there bundles it — a content change, not code (§8.2).
 */
export async function installBundledBibles(
  paths: AppPaths,
  store: BibleStore,
  log: Logger,
): Promise<void> {
  await clearInstallLeftovers(paths.bibles);
  await clearInstallLeftovers(paths.hymnals);
  await store.refresh();
  const files = (await listDir(join(paths.resources, 'bibles')))
    .filter((e) => e.isFile() && e.name.endsWith('.lsbible'))
    .map((e) => e.name);
  if (!files.length) log.warn('no bundled bibles found');
  // Read and checked side by side; only a changed or missing one is installed (one at a time).
  const read = await Promise.all(
    files.map(async (f) => {
      try {
        const bytes = new Uint8Array(await readFile(join(paths.resources, 'bibles', f)));
        return { f, bytes, sum: sha256(bytes) };
      } catch (e) {
        log.error('bundled bible unreadable', { file: f, err: errorMessage(e) });
        return null;
      }
    }),
  );
  const installed = store.list();
  for (const r of read) {
    if (!r || installed.some((v) => v.checksumSha256 === r.sum)) continue;
    try {
      // A copy of this version the user installed themselves (a newer edition, say) stays:
      // the bundled one comes back only if they remove theirs.
      const id = bundledId(r.f);
      if (installed.some((v) => v.id === id && v.source !== 'bundled')) continue;
      await mkdir(paths.bibles, { recursive: true });
      const info = await installBibleModule(r.bytes, { root: paths.bibles, source: 'bundled' });
      log.info('installed bundled bible', { id: info.id });
    } catch (e) {
      log.error('bundled bible install failed', { file: r.f, err: errorMessage(e) });
    }
  }
  await store.refresh();
}

/** A bundled package's version id: its file name ("kjv.lsbible" → "kjv"), as the build names them. */
const bundledId = (file: string): string => file.replace(/\.lsbible$/, '');

/** Load bundled + user-installed hymnals as read-only songs (§9.2). Installed copies win. */
export async function loadHymnals(
  paths: AppPaths,
  log: Logger,
): Promise<{ songs: Song[]; hymnals: InstalledHymnal[] }> {
  const bundled = await readHymnals(join(paths.resources, 'hymns'), 'bundled');
  const installed = await readHymnals(paths.hymnals, 'installed');
  const byId = new Map<string, { h: HymnalFile; source: InstalledHymnal['source'] }>();
  for (const h of bundled) byId.set(h.id, { h, source: 'bundled' });
  for (const h of installed) byId.set(h.id, { h, source: 'installed' });
  const songs: Song[] = [];
  const hymnals: InstalledHymnal[] = [];
  for (const { h, source } of byId.values()) {
    for (const hymn of h.hymns) songs.push(hymnToSong(h, hymn));
    hymnals.push({ id: h.id, name: h.name, count: h.hymns.length, source });
  }
  log.info('hymnals loaded', { count: hymnals.length });
  return { songs, hymnals };
}

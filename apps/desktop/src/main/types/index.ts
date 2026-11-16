import type { BrowserWindow } from 'electron';
import type { z } from 'zod';
import type {
  BibleVersionInfo,
  CommandBus,
  EntityMeta,
  ID,
  LiveState,
  LiveStateStore,
  MediaItem,
  MediaKind,
  Migration,
  OutputRole,
  ScreenVisual,
  ServicePlan,
  Settings,
  Song,
  Standby,
  Theme,
  Unsubscribe,
  MediaPlaylist,
} from '@lampstand/core';
import type { QueryName, QueryResults } from '@lampstand/ipc-contract';
import type { MediaLibrary } from '../library/mediaLibrary';
import type { BibleStore } from '../modules/bibleModules';
import type { JsonFileRepository } from '../storage/jsonFileRepository';
import type { SettingsStore } from '../storage/settingsStore';

/** Types shared across the main process. */

export interface AppPaths {
  userData: string;
  settingsFile: string;
  bibles: string;
  hymnals: string;
  models: string;
  cache: string;
  logs: string;
  backups: string;
  library: string;
  resources: string;
}

export type Level = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  child(module: string): Logger;
}

/** Everything the app needs, constructed once and injected (no service globals — §19.1). */
export interface Services {
  paths: AppPaths;
  log: Logger;
  settings: SettingsStore;
  bus: CommandBus;
  live: LiveStateStore;
  songs: JsonFileRepository<Song>;
  services: JsonFileRepository<ServicePlan>;
  themes: JsonFileRepository<Theme>;
  mediaPlaylists: JsonFileRepository<MediaPlaylist>;
  media: JsonFileRepository<MediaItem>;
  mediaLibrary: MediaLibrary;
  bibles: BibleStore;
  hymnSongs: Song[];
  hymnals: InstalledHymnal[];
}

export type WindowKind = 'control' | 'output' | 'stage';

export type ByteRange = { start: number; end: number } | 'invalid' | null;

export interface Sniffed {
  kind: MediaKind;
  mime: string;
  ext: string;
}

export interface JsonFileRepositoryOptions<T> {
  dir: string;
  /** e.g. ".song.json" */
  suffix: string;
  schema: z.ZodType<T>;
  schemaVersion: number;
  migrations?: Record<number, Migration>;
  /** Root used for the quarantine folder. */
  quarantineRoot: string;
  log: Logger;
  onQuarantine?: (fileName: string) => void;
}

export type ReadResult<T> =
  | { status: 'ok'; value: T; raw: unknown }
  | { status: 'missing' }
  | { status: 'invalid'; reason: string };

export type QueryHandlers = {
  [K in QueryName]: (args: never) => Promise<QueryResults[K]> | QueryResults[K];
};

/** One slide read out of a PowerPoint file: its title, body text and speaker notes. */
export interface ImportedSlide {
  title: string;
  body: string;
  notes: string;
}

export interface ImportedDeck {
  slides: ImportedSlide[];
  /** Slides that had pictures, which text import can't bring across. */
  slidesWithPictures: number;
}

export interface DisplayLike {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  size: { width: number; height: number };
  scaleFactor: number;
}

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

export interface WebTarget {
  win: BrowserWindow;
  /** Only the main output plays the page's sound (no doubled audio). */
  audio: boolean;
}

export interface InstalledHymnal {
  id: string;
  name: string;
  count: number;
  source: 'bundled' | 'installed';
}

export interface ZipLimits {
  maxFiles: number;
  maxTotalBytes: number;
  maxFileBytes: number;
  /** Max uncompressed/compressed ratio per entry (zip-bomb guard). */
  maxRatio: number;
  /** Allowed entry path pattern. */
  allowedPath?: RegExp;
  /**
   * Only inflate entries this accepts; others are skipped (not counted, not unpacked). Used to
   * read just the XML out of a slide deck full of pictures.
   */
  include?: (name: string) => boolean;
}

export interface InstallOptions {
  /** userData/bibles */
  root: string;
  source: BibleVersionInfo['source'];
  /** Expected module checksum from a signed catalog (downloads). */
  expectedSha256?: string;
}

export interface OutputWindow {
  outputId: string;
  role: Exclude<OutputRole, 'none'>;
  displayId: number | null; // null = window mode
  win: BrowserWindow;
  ready: boolean;
}

export interface WindowManagerDeps {
  log: Logger;
  getSettings: () => Settings;
  getLiveState: () => LiveState;
  logo: () => ScreenVisual;
  standby: () => Standby;
  onDisplaysChanged: () => void;
  onNewDisplay: (label: string) => void;
}

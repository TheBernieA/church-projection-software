import { z } from 'zod';
import {
  BookIdSchema,
  OutputRoleSchema,
  type BibleVersionInfo,
  type BookId,
  type LiveState,
  type MediaItem,
  type OutputRole,
  type Result,
  type ServicePlan,
  type Settings,
  type Song,
  type ScreenVisual,
  type Standby,
  type Theme,
} from '@lampstand/core';

/**
 * Every IPC channel is declared here (§17.2). Preloads expose one named function per entry —
 * never `ipcRenderer` or a generic `invoke(channel)`. Main validates every payload with these
 * schemas and checks which window type sent it.
 */

export const CommandEnvelopeSchema = z.object({
  type: z.string().min(1).max(80),
  payload: z.unknown(),
  source: z.enum(['ui', 'shortcut']).default('ui'),
});
export type CommandEnvelope = z.input<typeof CommandEnvelopeSchema>;

export interface SearchHit {
  kind: 'verse' | 'song' | 'hymn' | 'media' | 'reference' | 'command';
  id: string;
  title: string;
  subtitle?: string;
  score: number;
  /** For verse/reference hits. */
  ref?: {
    versionId: string;
    book: BookId;
    chapter: number;
    verse: number;
    endChapter?: number;
    endVerse?: number;
  };
}

export interface DisplayInfo {
  id: string;
  fingerprint: string;
  label: string;
  width: number;
  height: number;
  scaleFactor: number;
  isPrimary: boolean;
  /** True for the display the control window is on. */
  isControl: boolean;
  role: OutputRole;
}

export interface OutputInfo {
  outputId: string;
  role: OutputRole;
  label: string;
  width: number;
  height: number;
  audio: boolean;
  /** What the Logo mask shows, and what to show when nothing is live; re-sent on change. */
  logo: ScreenVisual;
  standby: Standby;
}

export interface ServiceSummary {
  id: string;
  name: string;
  date?: string;
  updatedAt: string;
  isTemplate: boolean;
  itemCount: number;
}

/** An installed Bible or hymnal package (§8.3, §9.2). */
export interface ModuleSummary {
  kind: 'bible' | 'hymnal';
  id: string;
  name: string;
  detail: string;
  source: 'bundled' | 'downloaded' | 'imported' | 'installed';
  removable: boolean;
}

export interface AppInfo {
  version: string;
  platform: string;
  electron: string;
}

/** Request schemas for control-window queries/actions. */
export const QuerySchemas = {
  'app.info': z.undefined(),
  'live.get': z.undefined(),
  'settings.get': z.undefined(),
  'songs.list': z.undefined(),
  'services.list': z.undefined(),
  'services.get': z.object({ id: z.string().max(64) }),
  'themes.list': z.undefined(),
  'media.list': z.undefined(),
  'bible.versions': z.undefined(),
  'bible.chapter': z.object({
    versionId: z.string().max(32),
    book: BookIdSchema,
    chapter: z.number().int().min(1).max(200),
  }),
  'bible.verseCounts': z.object({ versionId: z.string().max(32) }),
  'search.query': z.object({
    text: z.string().max(200),
    limit: z.number().int().min(1).max(100).default(30),
    versionId: z.string().max(32).optional(),
  }),
  'displays.list': z.undefined(),
  'history.state': z.undefined(),
  'media.import': z.object({ asBackground: z.boolean().default(false) }),
  'library.export': z.undefined(),
  'library.import': z.undefined(),
  'library.backupNow': z.undefined(),
  'audit.recent': z.undefined(),
  'modules.list': z.undefined(),
  'modules.install': z.undefined(),
  'slides.import': z.undefined(),
  /** Store generated image bytes (e.g. rendered PDF pages) as a library picture. */
  'media.importBytes': z.object({
    name: z.string().min(1).max(200),
    data: z.instanceof(Uint8Array).refine((d) => d.byteLength <= 30 * 1024 * 1024, 'too large'),
  }),
} as const;

export type QueryName = keyof typeof QuerySchemas;

export interface QueryResults {
  'app.info': AppInfo;
  'live.get': LiveState;
  'settings.get': Settings;
  'songs.list': Song[];
  'services.list': ServiceSummary[];
  'services.get': ServicePlan | null;
  'themes.list': Theme[];
  'media.list': MediaItem[];
  'bible.versions': BibleVersionInfo[];
  'bible.chapter': { verses: string[] };
  'bible.verseCounts': Partial<Record<BookId, number[]>>;
  'search.query': SearchHit[];
  'displays.list': DisplayInfo[];
  'history.state': { canUndo: boolean; canRedo: boolean };
  'media.import': { imported: number; rejected: number };
  'library.export': { done: boolean };
  'library.import': { done: boolean; imported: number };
  'library.backupNow': { done: boolean };
  'audit.recent': { at: string; type: string; source: string; ok: boolean }[];
  'modules.list': ModuleSummary[];
  'modules.install': { installed: ModuleSummary[]; failed: { file: string; message: string }[] };
  'slides.import': ImportedSlides;
  'media.importBytes': MediaItem | null;
}

/** What "Import slides" read: PowerPoint text, or a PDF to render page by page. */
export type ImportedSlides =
  | { kind: 'none' }
  | {
      kind: 'pptx';
      title: string;
      slides: { title: string; body: string; notes: string }[];
      slidesWithPictures: number;
    }
  | { kind: 'pdf'; title: string; data: Uint8Array };

export type QueryArgs<K extends QueryName> = z.input<(typeof QuerySchemas)[K]>;

export const QUERY_NAMES = Object.keys(QuerySchemas) as QueryName[];

export type RepoKind = 'songs' | 'services' | 'themes' | 'media' | 'bibles' | 'settings';

export interface Notice {
  level: 'info' | 'warning' | 'error';
  /** i18n key under `notice.*`. */
  key: string;
  params?: Record<string, string | number>;
}

/** Channel names. Prefixes make the window-type permission check simple in main. */
export const Channels = {
  command: 'ctl:command',
  undo: 'ctl:undo',
  redo: 'ctl:redo',
  query: (name: QueryName) => `ctl:q:${name}` as const,
  // Output/stage window handshake (read-only windows).
  outputReady: 'out:ready',
  // main → renderer events
  evLive: 'ev:live',
  evRepo: 'ev:repo',
  evDisplays: 'ev:displays',
  evHistory: 'ev:history',
  evNotice: 'ev:notice',
  evOutputInfo: 'ev:output-info',
} as const;

export type CommandResult = Result<unknown>;

export const DisplayAssignSchema = z.object({
  displayId: z.string().max(64),
  role: OutputRoleSchema,
});

/** API exposed to the control window by its preload. */
export interface ControlApi {
  command(cmd: CommandEnvelope): Promise<CommandResult>;
  undo(): Promise<CommandResult>;
  redo(): Promise<CommandResult>;
  query<K extends QueryName>(name: K, args?: QueryArgs<K>): Promise<Result<QueryResults[K]>>;
  onLiveState(cb: (s: LiveState) => void): () => void;
  onRepoChanged(cb: (kind: RepoKind) => void): () => void;
  onDisplaysChanged(cb: () => void): () => void;
  onHistoryChanged(cb: (h: { canUndo: boolean; canRedo: boolean }) => void): () => void;
  onNotice(cb: (n: Notice) => void): () => void;
  platform: string;
}

/** API exposed to output and stage windows: read-only (§17.2 — outputs may only subscribe). */
export interface OutputApi {
  onLiveState(cb: (s: LiveState) => void): () => void;
  onInfo(cb: (info: OutputInfo) => void): () => void;
  ready(): void;
}

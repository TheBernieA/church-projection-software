import type {
  BibleVersionInfo,
  BookId,
  LiveState,
  MediaItem,
  OutputRole,
  Result,
  ServicePlan,
  Settings,
  Song,
  ScreenVisual,
  Standby,
  Theme,
} from '@lampstand/core';
import type { QueryName } from '../channels';
import type { CommandEnvelope, QueryArgs } from '../schemas';

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

export type RepoKind = 'songs' | 'services' | 'themes' | 'media' | 'bibles' | 'settings';

export interface Notice {
  level: 'info' | 'warning' | 'error';
  /** i18n key under `notice.*`. */
  key: string;
  params?: Record<string, string | number>;
}

export type CommandResult = Result<unknown>;

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

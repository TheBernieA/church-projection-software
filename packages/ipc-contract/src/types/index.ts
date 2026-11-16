import type {
  BibleVersionInfo,
  BookId,
  LiveState,
  MediaItem,
  MediaPlaylist,
  OutputRole,
  Result,
  ServicePlan,
  Settings,
  Song,
  ScreenVisual,
  ScreenMask,
  StageLayout,
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
  /** Where the room's audio plays ('' = the default output). */
  audioSink: string;
  /** What the Logo mask shows, and what to show when nothing is live; re-sent on change. */
  logo: ScreenVisual;
  standby: Standby;
  /** The screen mask this output uses (Settings › Screens), or null for the full screen. */
  mask: ScreenMask | null;
  /** Stage screens: the layout they show (Stage workspace). */
  stageLayout: StageLayout;
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
  'mediaPlaylists.list': MediaPlaylist[];
  'bible.versions': BibleVersionInfo[];
  'bible.chapter': { verses: string[] };
  'bible.verseCounts': Partial<Record<BookId, number[]>>;
  'search.query': SearchHit[];
  'displays.list': DisplayInfo[];
  'history.state': { canUndo: boolean; canRedo: boolean };
  /** `ids`: the new media, in the order picked (to add them to an open media playlist). */
  'media.import': { imported: number; rejected: number; ids: string[] };
  'library.export': { done: boolean };
  'library.import': { done: boolean; imported: number };
  'library.backupNow': { done: boolean };
  'audit.recent': { at: string; type: string; source: string; ok: boolean }[];
  'modules.list': ModuleSummary[];
  'modules.install': { installed: ModuleSummary[]; failed: { file: string; message: string }[] };
  'slides.import': ImportedSlides;
  'media.importBytes': MediaItem | null;
  'devices.access': { status: DeviceAccess };
  'stream.status': StreamStatus;
  'stream.keys': Record<string, boolean>;
  'recording.chooseFolder': { folder: string | null };
  'recording.reveal': { done: boolean };
}

/** The OS's camera/microphone permission for the app ('granted' where the OS doesn't ask). */
export type DeviceAccess = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown';

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

export type RepoKind =
  'songs' | 'services' | 'themes' | 'media' | 'mediaPlaylists' | 'bibles' | 'settings';

export interface Notice {
  level: 'info' | 'warning' | 'error';
  /** i18n key under `notice.*`. */
  key: string;
  params?: Record<string, string | number>;
}

export type CommandResult = Result<unknown>;

/** API exposed to the control window by its preload. */
/** What an application-menu item asks the control window to do. */
export type MenuAction = 'undo' | 'redo';

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
  /** Edit › Undo / Redo chosen from the application menu. */
  onMenu(cb: (action: MenuAction) => void): () => void;
  /** Livestream / recording status changes. */
  onStream(cb: (s: StreamStatus) => void): () => void;
  platform: string;
}

/** How one stream destination is doing. */
export interface StreamDestinationStatus {
  id: string;
  name: string;
  state: 'connecting' | 'ok' | 'failed';
}

/** The livestream / recording, as the control window sees it (sent on every change). */
export interface StreamStatus {
  state: 'idle' | 'starting' | 'live' | 'stopping';
  streaming: boolean;
  recording: boolean;
  /** When it started (ISO), for the timer. */
  since: string | null;
  fps: number;
  kbps: number;
  /** Encoding speed: 1 = keeping up; below 0.95 the computer is struggling. */
  speed: number;
  /** Frames the encoder couldn't take in time. */
  dropped: number;
  destinations: StreamDestinationStatus[];
  /** The file being written, if recording. */
  recordingPath: string | null;
  /** The last problem, as an i18n key under `stream.errors.*`. */
  error: string | null;
  /** A small JPEG of the stream picture (data URL), while running. */
  preview: string | null;
  /** How many times the encoder has been restarted this session. */
  restarts: number;
  /** Whether an ffmpeg was found (no ffmpeg: no streaming). */
  available: boolean;
  /** The encoder in use (or that would be used). */
  encoder: string;
}

/** What the stream window draws and mixes (from Settings › Streaming). */
export interface StreamConfig {
  width: number;
  height: number;
  picture: {
    camera: string | null;
    words: 'full' | 'lowerThird' | 'none';
    background: 'program' | 'camera' | 'black';
  };
  sound: { room: boolean; roomGain: number; mics: { deviceId: string; gain: number }[] };
  logo: ScreenVisual;
  standby: Standby;
}

/** API exposed to the (offscreen) stream window: it draws and sends its sound. */
export interface StreamApi {
  onLiveState(cb: (s: LiveState) => void): () => void;
  onConfig(cb: (c: StreamConfig) => void): () => void;
  ready(): void;
  /** Interleaved stereo float32 PCM at 48 kHz. */
  sendAudio(pcm: Float32Array): void;
}

/** API exposed to output and stage windows: read-only (§17.2 — outputs may only subscribe). */
export interface OutputApi {
  onLiveState(cb: (s: LiveState) => void): () => void;
  onInfo(cb: (info: OutputInfo) => void): () => void;
  ready(): void;
}

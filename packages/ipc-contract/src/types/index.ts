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
  StreamProfile,
  Theme,
  VideoInputLayer,
} from '@lampstand/core';
import type { QueryName } from '../channels';
import type { CommandEnvelope, MeterReport, QueryArgs } from '../schemas';

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
  'ndi.status': NdiStatus;
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
  /** Mix levels from the room and the stream (about 15 a second each, while they run). */
  onMeters(cb: (m: MeterReport) => void): () => void;
  /**
   * This window watches the stream: preview frames at `fps` (0: none), and the stream picture
   * ready before going live when `ready`. Repeat every few seconds while watching.
   */
  streamWatch(fps: number, ready: boolean): void;
  /** GPU pipeline: the stream picture, full motion, while this window watches (close each). */
  onStreamFrame(cb: (frame: GpuFrame) => void): void;
  /** The stream picture as a small JPEG, while this window watches (`streamWatch`). */
  onStreamPreview(cb: (jpeg: Uint8Array) => void): () => void;
  /** The Live console window opened (true) or closed (false). */
  onLiveConsole(cb: (open: boolean) => void): () => void;
  /** NDI status changes (runtime found, receivers per feed). */
  onNdi(cb: (s: NdiStatus) => void): () => void;
  platform: string;
}

/** How one stream destination is doing. */
export interface StreamDestinationStatus {
  id: string;
  name: string;
  state: 'connecting' | 'ok' | 'failed';
  /** Why it stopped, in the encoder's words (stream key hidden). */
  reason?: string;
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
  /**
   * How far behind live the stream is as it leaves this computer, in ms (null until known).
   * What a viewer sees is this plus the streaming service's own delay.
   */
  delayMs: number | null;
  destinations: StreamDestinationStatus[];
  /** The file being written, if recording. */
  recordingPath: string | null;
  /** The last problem, as an i18n key under `stream.errors.*`. */
  error: string | null;
  /**
   * How frames reach the encoder: 'gpu' (shared GPU textures, the computer's hardware encoder
   * via WebCodecs; ffmpeg only packages them) or 'cpu' (frames copied to ffmpeg, which encodes).
   */
  pipeline: 'gpu' | 'cpu';
  /** The stream window is open (live, recording, or getting ready to go live). */
  ready: boolean;
  /** Size, rate and effort in use (or that the next start will use). */
  profile: StreamProfile;
  /** Frames Lampstand couldn't hand to the encoder in time (in `dropped` too). */
  droppedLocal: number;
  /** The computer can't keep up: suggest Light. */
  advice: 'lighter' | null;
  /** CPU and memory while running (every 2 s), with recent history for sparklines. */
  health: StreamHealth | null;
  /** The recording's size so far, in bytes. */
  recordingBytes: number;
  /** How many times the encoder has been restarted this session. */
  restarts: number;
  /** Whether an ffmpeg was found (no ffmpeg: no streaming). */
  available: boolean;
  /** The encoder in use (or that would be used). */
  encoder: string;
}

/** CPU (% of one core) and memory (MB) while streaming or recording. */
export interface StreamHealth {
  /** All of Lampstand, and the stream window on its own. */
  appCpu: number;
  appMemMB: number;
  windowCpu: number;
  /** The encoder (null where it can't be measured). */
  encoderCpu: number | null;
  encoderMemMB: number | null;
  /** The last 60 samples (2 minutes), oldest first. */
  history: { fps: number[]; kbps: number[]; speed: number[]; cpu: number[] };
}

/** What the stream window draws and mixes (from Settings › Streaming). */
export interface StreamConfig {
  width: number;
  height: number;
  picture: {
    camera: string | null;
    words: 'full' | 'lowerThird' | 'none';
    /** 'none': nothing behind the words (a transparent NDI key feed). */
    background: 'program' | 'camera' | 'black' | 'none';
  };
  /** The stream's own camera, with its saved settings (capture size capped at the stream's). */
  cameraLayer: VideoInputLayer | null;
  /** GPU pipeline: check the hardware encoder can do this (the page reports back to main). */
  probe: EncodeConfig | null;
  /** Make the sound mix (off while just getting ready: no microphones open). */
  mix: boolean;
  /** A see-through picture (alpha), for the NDI words feed. */
  transparent: boolean;
  /** Report the stream mix's levels (the livestream window only, not NDI feeds). */
  meters: boolean;
  logo: ScreenVisual;
  standby: Standby;
}

/**
 * A picture on the GPU, as the preloads hand it over: a WebCodecs `VideoFrame` (typed loosely
 * here so the main process, which has no DOM types, can share this file). Close it when done.
 */
export interface GpuFrame {
  readonly displayWidth: number;
  readonly displayHeight: number;
  close(): void;
}

/** Hardware encoding settings for the stream page (GPU pipeline). */
export interface EncodeConfig {
  width: number;
  height: number;
  fps: number;
  kbps: number;
}

/** What the stream page tells main about its hardware encoder. */
export type EncoderReport =
  | { type: 'caps'; width: number; height: number; fps: number; hardware: boolean }
  | {
      type: 'stats';
      encoded: number;
      dropped: number;
      /** How long the encoder took per frame over the last second, in ms (average). */
      encodeMs: number;
    }
  | { type: 'error'; message: string };

/** API exposed to the (offscreen) stream window: it draws and sends its sound. */
export interface StreamApi {
  /** GPU pipeline: each new stream picture, as a frame on the GPU (close it when done). */
  onFrame(cb: (frame: GpuFrame) => void): void;
  /** Start encoding with these settings, stop (null), or make the next frame a keyframe. */
  onEncode(cb: (cmd: EncodeConfig | { keyframe: true } | null) => void): () => void;
  /**
   * An encoded H.264 frame (AVCC), with when it was made (µs since encoding started) and, on
   * keyframes, the encoder's configuration record (avcC).
   */
  sendVideo(data: Uint8Array, key: boolean, timestampUs: number, config?: Uint8Array): void;
  reportEncoder(r: EncoderReport): void;
  onLiveState(cb: (s: LiveState) => void): () => void;
  onConfig(cb: (c: StreamConfig) => void): () => void;
  ready(): void;
  /** Interleaved stereo float32 PCM at 48 kHz. */
  sendAudio(pcm: Float32Array): void;
  sendMeters(m: MeterReport): void;
}

/** API exposed to output and stage windows: read-only (§17.2 — outputs may only subscribe). */
export interface OutputApi {
  onLiveState(cb: (s: LiveState) => void): () => void;
  onInfo(cb: (info: OutputInfo) => void): () => void;
  ready(): void;
  /** The main output's room mix levels (only the window that plays the room sends them). */
  sendMeters(m: MeterReport): void;
}

/** NDI, as the control window sees it. */
export interface NdiStatus {
  /** The NDI runtime was found and loaded (NDI Tools installed). */
  available: boolean;
  /** Its version, or why it couldn't load. */
  version: string | null;
  error: string | null;
  /** Receivers watching each feed (by feed id), while it runs. */
  connections: Record<string, number>;
}

import type {
  BibleVersionInfo,
  BlendPart,
  BookId,
  DeskProfile,
  EqTextResult,
  FitNote,
  KeyFeedMode,
  LiveState,
  MediaItem,
  MediaPlaylist,
  OscArg,
  OscMessage,
  OutputRole,
  Processing,
  ProcessingPreset,
  ResolvedKindThemes,
  ScreenAdjust,
  Result,
  ServicePlan,
  Settings,
  Song,
  StreamSettings,
  ScreenVisual,
  ScreenMask,
  StageLayout,
  Standby,
  StreamProfile,
  Theme,
  VideoInputLayer,
  ScreenWords,
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
  /** Its left edge in the desktop's arrangement (edge blending orders screens by it). */
  x: number;
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
  /** Themes this output uses instead of each slide's own, by kind of slide. */
  themes: ResolvedKindThemes;
  /** A key feed for a video mixer: words only, over this flat colour ('off': the full picture). */
  key: KeyFeedMode;
  /** How the picture is fitted to this screen: keystone, scale, flips, colour (null: as is). */
  adjust: ScreenAdjust | null;
  /** Edge blending: this screen's part of one wide picture (null: a picture of its own). */
  blend: BlendPart | null;
  /** How this screen draws the words, over each theme (audience screens; as is elsewhere). */
  words: ScreenWords;
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
/** An online Bible's state (Settings › Bibles & hymnals › Online Bibles). */
export interface OnlineBibleStatus {
  id: string;
  hasKey: boolean;
  /** Verses saved on this computer, and the most the provider's terms allow. */
  savedVerses: number;
  maxVerses: number;
  lastError?: string;
}

export interface ModuleSummary {
  kind: 'bible' | 'hymnal';
  id: string;
  name: string;
  detail: string;
  source: 'bundled' | 'downloaded' | 'imported' | 'installed' | 'online';
  removable: boolean;
  /** After an install: new, a replacement for an installed copy, or the same as installed. */
  change?: 'new' | 'updated' | 'unchanged';
}

export interface AppInfo {
  version: string;
  platform: string;
  electron: string;
}

/** The sound desk link, as Settings › Audio shows it. */
export interface DeskStatus {
  enabled: boolean;
  /** The profile in use (null: the one chosen doesn't exist any more). */
  profile: string | null;
  host: string;
  port: number;
  /** null: not checked (off, or no address yet). */
  answering: boolean | null;
  error: string | null;
}

/** What a picked file held: Lampstand presets, or a text EQ to turn into one. */
export type PresetImport =
  | { kind: 'none' }
  | { kind: 'presets'; file: string; presets: ProcessingPreset[] }
  | { kind: 'eqText'; file: string; eq: EqTextResult }
  | { kind: 'unreadable'; file: string };

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
  /** A version's own book names; empty for English (the built-in names are used). */
  'bible.bookNames': Partial<Record<BookId, string>>;
  'search.query': SearchHit[];
  'displays.list': DisplayInfo[];
  'history.state': { canUndo: boolean; canRedo: boolean };
  /** `ids`: the new media, in the order picked (to add them to an open media playlist). */
  'media.import': { imported: number; rejected: number; ids: string[] };
  'library.export': { done: boolean };
  'library.import': { done: boolean; imported: number };
  'library.backupNow': { done: boolean };
  'audit.recent': { at: string; type: string; source: string; ok: boolean }[];
  /** Notices from before the control window could show them (startup); each given once. */
  'notices.missed': Notice[];
  'modules.list': ModuleSummary[];
  'modules.install': { installed: ModuleSummary[]; failed: { file: string; message: string }[] };
  'slides.import': ImportedSlides;
  'songs.importFiles': { files: { name: string; text: string }[]; skipped: string[] };
  'onlineBible.status': OnlineBibleStatus[];
  'onlineBible.probe': { sample: string; copyright?: string; bookName?: string };
  'onlineBible.catalog': {
    id: string;
    name: string;
    abbreviation: string;
    language: string;
    direction: 'ltr' | 'rtl';
  }[];
  'media.importBytes': MediaItem | null;
  'devices.access': { status: DeviceAccess };
  'stream.status': StreamStatus;
  'ndi.status': NdiStatus;
  'desk.status': DeskStatus;
  'desk.read': { name: string | null; processing: Processing };
  'desk.write': { notes: FitNote[]; previous: Processing | null };
  'desk.channels': { channel: number; name: string | null }[];
  'desk.importProfile': { profile: DeskProfile | null; file: string | null };
  'presets.export': { done: boolean };
  'presets.import': PresetImport;
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
  onLiveState(cb: (s: LiveDelivery) => void): () => void;
  onRepoChanged(cb: (kind: RepoKind) => void): () => void;
  onDisplaysChanged(cb: () => void): () => void;
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
  /** Cameras was undocked into its own window (true) or docked back (false). */
  onCamerasWindow(cb: (open: boolean) => void): () => void;
  /** NDI status changes (runtime found, receivers per feed). */
  onNdi(cb: (s: NdiStatus) => void): () => void;
  /** OSC messages from a desk or app (when listening is on in Settings › Control surfaces). */
  onOsc(cb: (messages: OscMessage[]) => void): () => void;
  onOscStatus(cb: (s: OscStatus) => void): () => void;
  oscStatus(): Promise<OscStatus>;
  /** Send an OSC message to the desk (the address and port in Settings › Control surfaces). */
  oscSend(address: string, args: OscArg[]): void;
  platform: string;
}

/** The OSC listener. */
export interface OscStatus {
  listening: boolean;
  port: number;
  /** Why it isn't listening (the port is taken, for one). */
  error: string | null;
  /** This computer's network addresses, for setting up the desk. */
  addresses: string[];
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
  /**
   * The video bitrate the stream has lowered itself to, to fit the upload (kb/s); null while it
   * runs at the performance mode's bitrate.
   */
  adaptedKbps: number | null;
  /** Live, but the stream mix has had no sound for a while (nothing sent to it, or muted). */
  silent: boolean;
  /** Covered: the stream shows the cover picture (Settings › Streaming) instead of the show. */
  covered: boolean;
  /** This computer's ffmpeg can send SRT (direct links); null until asked. */
  srt: boolean | null;
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
  /** Suggest Light: the computer can't keep up (`lighter`), or the upload carries too little for
   *  this picture size (`upload`: a smaller picture looks sharper at the rate it carries). */
  advice: 'lighter' | 'upload' | null;
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
  /** All of Lampstand. */
  appCpu: number;
  appMemMB: number;
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
  /**
   * What the picture shows: the stream's settings, or (NDI feeds) the words alone over nothing
   * (`background: 'none'`) or where the theme put them (`wordsAlign: 'theme'`).
   */
  picture: Omit<StreamSettings['picture'], 'background' | 'wordsAlign'> & {
    background: StreamSettings['picture']['background'] | 'none';
    wordsAlign: StreamSettings['picture']['wordsAlign'] | 'theme';
  };

  /** Themes the stream uses instead of each slide's own, by kind of slide. */
  kindThemes: ResolvedKindThemes;
  /** Lower third: the theme to draw the words with (resolved from `picture.wordsTheme`). */
  wordsTheme: Theme | null;
  /** The stream's own camera, with its saved settings (capture size capped at the stream's). */
  cameraLayer: VideoInputLayer | null;
  /** A camera layout's second camera (likewise). */
  secondCameraLayer: VideoInputLayer | null;
  /** Mirroring the alternate output: its themes, by kind of slide. */
  alternateThemes: ResolvedKindThemes;
  /** Mirroring the stage display: its layout. */
  stageLayout: StageLayout;
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
  /** The stream is covered: this shows instead of everything (the sound carries on). */
  cover: ScreenVisual | null;
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
  /** Start encoding, change the bitrate on the fly, ask for a keyframe, or stop (null). */
  onEncode(
    cb: (cmd: EncodeConfig | { keyframe: true } | { bitrate: number } | null) => void,
  ): () => void;
  /**
   * An encoded H.264 frame (AVCC), with when it was made (µs since encoding started) and, on
   * keyframes, the encoder's configuration record (avcC).
   */
  sendVideo(data: Uint8Array, key: boolean, timestampUs: number, config?: Uint8Array): void;
  reportEncoder(r: EncoderReport): void;
  onLiveState(cb: (s: LiveDelivery) => void): () => void;
  onConfig(cb: (c: StreamConfig) => void): () => void;
  ready(): void;
  /** Interleaved stereo float32 PCM at 48 kHz. */
  sendAudio(pcm: Float32Array): void;
  sendMeters(m: MeterReport): void;
}

/**
 * The live state as sent to a window. `soundOnly`: only the sound (the mixer, the audio
 * track) changed since the last one, so a picture can stay as it is (a fader drag sends
 * many of these a second). `viewsOnly`: only the cameras' digital shots changed (following
 * someone sends ~15 a second): a window moves its camera pictures and redraws nothing else.
 */
export type LiveDelivery = LiveState & { soundOnly?: boolean; viewsOnly?: boolean };

/** API exposed to output and stage windows: read-only (§17.2 — outputs may only subscribe). */
export interface OutputApi {
  onLiveState(cb: (s: LiveDelivery) => void): () => void;
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

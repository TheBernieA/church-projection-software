import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { cpus, setPriority, totalmem, constants as osConstants } from 'node:os';
import { basename, join } from 'node:path';
import type { Writable } from 'node:stream';
import { app, BrowserWindow, ipcMain, nativeImage, type IpcMainEvent } from 'electron';
import {
  resolvePerformance,
  type ScreenVisual,
  streamSize,
  StreamSettingsSchema,
  type MachineInfo,
  type PerformanceMode,
  type Settings,
  type StreamProfile,
} from '@lampstand/core';
import {
  Channels,
  type EncodeConfig,
  type EncoderReport,
  type Notice,
  type StreamDestinationStatus,
  type StreamStatus,
} from '@lampstand/ipc-contract';
import { isTrustedFrameUrl } from '../ipc/router';
import type { SecretStore } from '../secrets/secretStore';
import { findFfmpeg, probeAacEncoder, probeEncoders, probeProtocols } from './ffmpeg';
import {
  buildArgs,
  destinationFailure,
  freeName,
  hasFallbackIngest,
  redactKeys,
  parseProgress,
  type Progress,
  pickEncoder,
  recordingName,
  type Encoder,
} from './ffmpegArgs';
import { AudioClock } from './audioClock';
import { resolveDestinations, type ResolvedDestinations } from './destinations';
import { sharedTexturesAvailable, TextureRelay, type Watcher } from './textureRelay';
import { SoundWatch } from './soundWatch';
import { Backlog } from './backlog';
import { BitrateController } from './bitrate';
import { FLV_HEADER, flvFrame, flvSequenceHeader } from './flv';
import { FramePump } from './framePump';
import { isStruggling, Ring, sampleProcess, type HealthSample } from './health';
import { pickBenchmarkMode, runBenchmark, type BenchmarkRun } from './benchmark';
import {
  bitmapOf,
  openPictureWindow,
  sendPictureConfig,
  streamPictureExtras,
  type PictureSources,
} from './pictureWindow';

interface StreamDeps extends PictureSources {
  secrets: SecretStore;
  updateSettings: (patch: Partial<Settings>) => void;
  onStatus: (s: StreamStatus) => void;
  notice: (n: Notice) => void;
}

/** The secret-store name of a destination's stream key. */
export const keyName = (destinationId: string): string => `stream-key:${destinationId}`;

/** Waits before each restart after the encoder stops on its own (then gives up). */
const BACKOFF_MS = [2_000, 5_000, 10_000, 20_000, 20_000, 20_000, 20_000, 20_000, 20_000, 20_000];
/** Status goes to the windows at most this often (state changes go at once). */
const STATUS_MS = 500;
const HEALTH_MS = 2_000;
/** A Live console says it's watching at least this often; silence means it went away. */
const WATCH_TTL_MS = 8_000;

/** Extra lines in the log (ffmpeg's own, GPU frame counts): LAMPSTAND_FFMPEG_DEBUG=1. */
const DEBUG = !!process.env.LAMPSTAND_FFMPEG_DEBUG;
/** An encoder that stops this soon after starting never really ran. */
const QUICK_EXIT_MS = 5_000;
/** How long ffmpeg gets to finish its files before it is killed. */
const STOP_TIMEOUT_MS = 6_000;
/** How long to wait to hear whether the hardware encoder can do a size. */
const CAPS_TIMEOUT_MS = 4_000;
/** ffmpeg's words for an output that couldn't be opened (a connection that didn't happen). */
const CONNECT_FAILED =
  /error opening output|could not open|could not write header|nothing was written|connection refused|input\/output error|handshake|tls|ssl|server error|end of file/i;

/** The profile before the settings are known: the defaults, as a middling computer would run. */
const DEFAULT_PROFILE: StreamProfile = resolvePerformance(
  { ...StreamSettingsSchema.parse({}), performance: 'balanced' },
  { cores: 4, memoryGB: 8, hardwareEncoder: false },
);

/** A profile's 16:9 picture size. */
const sizeOf = (p: Pick<StreamProfile, 'height'>): { width: number; height: number } =>
  streamSize(p.height);

/** A stopped stream's status (what ffmpeg can do, e.g. SRT, is kept: it doesn't change). */
const idle = (
  available: boolean,
  encoder: string,
  profile: StreamProfile,
): Omit<StreamStatus, 'srt'> => ({
  state: 'idle',
  streaming: false,
  recording: false,
  since: null,
  fps: 0,
  kbps: 0,
  speed: 0,
  dropped: 0,
  delayMs: null,
  adaptedKbps: null,
  silent: false,
  covered: false,
  destinations: [],
  recordingPath: null,
  recordingBytes: 0,
  error: null,
  ready: false,
  pipeline: 'cpu',
  profile,
  advice: null,
  health: null,
  restarts: 0,
  available,
  encoder,
});

/** Most video (in seconds) allowed to wait for ffmpeg before skipping ahead to stay live. */
const MAX_BACKLOG_S = 1.2;
/** After skipping ahead, the stream resumes once less than this is still waiting (seconds). */
const RESUME_BACKLOG_S = 0.3;
/** CPU pipeline: raw frames allowed to wait in the pipe to ffmpeg (each is a whole picture). */
const PIPE_FRAMES = 3;
/** Live and steady this long after a reconnect: the next drop starts the backoff afresh. */
const STEADY_MS = 60_000;

/**
 * Livestream and recording, done by Lampstand itself. A hidden (offscreen) stream window draws
 * the stream picture and mixes its sound. Frames go to ffmpeg on wall-clock time (the frame
 * pump: the last picture repeats when nothing changed, with no copies), sound arrives as PCM
 * (silence fills any gap, so ffmpeg never waits); ffmpeg encodes once and sends to every
 * destination and the recording file.
 *
 * Kept light for modest computers: one frame in memory; the preview JPEG is made only while a
 * Live console is watching; status goes out at most twice a second; the performance mode picks
 * the size, rate and encoder effort; the encoder runs at a higher priority than the app.
 */
export class StreamController {
  private status: StreamStatus;
  private want = { stream: false, record: false };
  private win: BrowserWindow | null = null;
  private winProfile: StreamProfile | null = null;
  private ff: ChildProcess | null = null;
  private audioOut: Writable | null = null;
  /** The latest stream picture (BGRA), the only frame kept. */
  private latest: Buffer | null = null;
  private black: Buffer | null = null;
  private pump: FramePump | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private previewTimer: ReturnType<typeof setInterval> | null = null;
  private watchTimer: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEmit = 0;
  private part = 1;
  private sessionStart: Date | null = null;
  private stopping = false;
  private spawnedAt = 0;
  private slaves: string[] = [];
  private brokenEncoders = new Set<string>();
  private lastStderr: string[] = [];
  private machine: MachineInfo = {
    cores: cpus().length,
    memoryGB: totalmem() / 1024 ** 3,
    hardwareEncoder: false,
  };
  private ffmpegDropped = 0;
  private samples: HealthSample[] = [];
  private lastSent = 0;
  private lastDropped = 0;
  private readonly history = {
    fps: new Ring(),
    kbps: new Ring(),
    speed: new Ring(),
    cpu: new Ring(),
  };
  private readonly watchers = new Map<number, Watcher>();
  /** The stream window shares its picture as GPU textures (the GPU pipeline is possible). */
  private winGpu = false;
  /** The pipeline of the encoder that's running. */
  private pipeline: 'gpu' | 'cpu' = 'cpu';
  /** What the hardware encoder can do, by size and rate (as the stream page found). */
  private readonly gpuCaps = new Map<string, boolean>();
  private capsWaiters: (() => void)[] = [];
  /** The hardware encoder failed this session: stay on the CPU pipeline. */
  private gpuBroken = false;
  /** GPU pipeline: the page's encoder counts, and chunks waiting for a keyframe. */
  private pageEncoded = 0;
  private pageDropped = 0;
  private waitForKey = false;
  /** While waiting for a keyframe: one has been asked of the encoder. */
  private keyAsked = false;
  /** GPU pipeline: the FLV stream to this ffmpeg has been opened, and its time zero. */
  private flvOpen = false;
  private flvBase = 0;
  private healthTicks = 0;
  /** Whether the stream mix has any sound (from its meter). */
  private readonly sound = new SoundWatch();
  private readonly backlog = new Backlog();
  /** Times video was skipped because a destination couldn't keep up (for the log and advice). */
  private congested = 0;
  private pcmSeen = 0;
  private videoSeen = false;
  /** Destinations using their fallback address this session (the first couldn't connect). */
  private readonly altIngest = new Set<string>();
  /** The stream page has loaded (it can take "start encoding"). */
  private pageReady = false;
  /** GPU encoding to start once the page is ready. */
  private pendingEncode: EncodeConfig | null = null;
  /** GPU pipeline: the page is encoding (sound is written only from then, on the same clock). */
  private encodeLive = false;
  private videoBytes = 0;
  /** When the bitrate was last worked out, and the video bytes sent by then. */
  private rateAt = 0;
  private rateBytes = 0;
  /** GPU pipeline: the hardware encoder's time per frame (ms), from the page. */
  private encodeMs = 0;
  /** This ffmpeg can send SRT (null until asked). */
  private videoChunks = 0;
  private audioTimer: ReturnType<typeof setInterval> | null = null;
  /** The stream's sound, kept to the clock (time zero: the first frame to the encoder). */
  private readonly audio = new AudioClock(() => this.audioOut);
  /** GPU pipeline: hands each picture to the stream page's encoder and the watching consoles. */
  private readonly relay: TextureRelay;
  /** GPU pipeline: lowers the bitrate when the upload can't keep up, raises it again after. */
  private readonly abr = new BitrateController(DEFAULT_PROFILE.videoKbps);
  /** Counts encoder starts, so one that was overtaken while it waited gives way. */
  private spawnSeq = 0;
  /** After a reconnect: clears the restart count once the stream has been steady a while. */
  private steadyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly d: StreamDeps) {
    this.status = { ...idle(!!findFfmpeg(), 'auto', DEFAULT_PROFILE), srt: null };
    this.relay = new TextureRelay({
      log: d.log,
      pageFrame: () =>
        this.winGpu && this.win && !this.win.isDestroyed() ? this.win.webContents.mainFrame : null,
      light: () => this.winProfile?.mode === 'light',
      debug: DEBUG,
    });
    ipcMain.on(Channels.streamReady, (e) => {
      if (!this.fromStreamWindow(e)) return;
      this.pageReady = true;
      this.sendConfig();
      e.sender.send(Channels.evLive, d.getLiveState());
      // Encoding was asked for before the page had loaded: start it now.
      if (this.pendingEncode) this.beginGpuEncode(this.pendingEncode);
    });
    ipcMain.on(Channels.streamAudio, (e, pcm: unknown) => {
      if (!this.fromStreamWindow(e)) return;
      this.pcmSeen += 1;
      if (!(pcm instanceof Float32Array)) return;
      this.writeAudio(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
    });
    ipcMain.on(
      Channels.streamVideo,
      (e, data: unknown, key: unknown, timestampUs: unknown, config: unknown) => {
        if (!this.fromStreamWindow(e) || !(data instanceof Uint8Array)) return;
        if (!this.videoSeen) {
          this.videoSeen = true;
          this.d.log.info('first encoded chunk', { bytes: data.byteLength });
        }
        this.writeVideo(
          data,
          key === true,
          typeof timestampUs === 'number' ? timestampUs / 1000 : 0,
          config instanceof Uint8Array ? config : null,
        );
      },
    );
    ipcMain.on(Channels.streamEncoder, (e, r: EncoderReport) => {
      if (!this.fromStreamWindow(e)) return;
      this.onEncoderReport(r);
    });
    void this.refreshEncoder();
  }

  /** The app is quitting: finish the recording (and end the stream) properly first. */
  async shutdown(): Promise<void> {
    if (this.status.state !== 'idle') await this.stop({ stream: true, record: true });
  }

  getStatus(): StreamStatus {
    return this.status;
  }

  private get encoding(): boolean {
    return this.want.stream || this.want.record;
  }

  /** The profile for the next start (or the one running). */
  private profile(): StreamProfile {
    return this.winProfile && this.encoding ? this.winProfile : this.freshProfile();
  }

  /** Start streaming and/or recording (adding to what is already running). */
  async start(opts: { stream?: boolean; record?: boolean }): Promise<void> {
    const s = this.d.getSettings().stream;
    const before = { ...this.want };
    if (opts.stream) {
      this.want.stream = true;
      if (s.recording.recordWhileStreaming) this.want.record = true;
    }
    if (opts.record) this.want.record = true;
    if (before.stream === this.want.stream && before.record === this.want.record) return;
    if (!before.stream && !before.record) {
      this.sessionStart = new Date();
      this.part = 1;
      this.altIngest.clear();
      this.samples = [];
      this.healthTicks = 0;
      this.congested = 0;
      this.pcmSeen = 0;
      this.audio.reset();
      this.abr.reset(this.freshProfile().videoKbps);
      for (const r of Object.values(this.history)) r.clear();
      this.status = { ...this.status, restarts: 0, error: null, advice: null };
      // A window that was getting ready under another mode starts again at the right size.
      if (this.win && this.winProfile?.height !== this.freshProfile().height) this.closeWindow();
      if (!this.win) this.openWindow();
      this.sendConfig(); // a window that was only getting ready now mixes the sound too
    }
    await this.restartEncoder(before.record && this.want.record);
  }

  /** Stop streaming and/or recording; with neither left, the encoder (and window) close. */
  async stop(opts: { stream?: boolean; record?: boolean }): Promise<void> {
    const wasStreaming = this.want.stream;
    const wasRecording = this.want.record;
    if (opts.stream) this.want.stream = false;
    if (opts.record) this.want.record = false;
    if (wasStreaming === this.want.stream && wasRecording === this.want.record) return;
    if (wasStreaming && !this.want.stream) this.d.notice({ level: 'info', key: 'streamEnded' });
    if (wasRecording && !this.want.record && this.status.recordingPath)
      this.d.notice({
        level: 'info',
        key: 'recordingSaved',
        params: { file: basename(this.status.recordingPath) },
      });
    if (!this.encoding) {
      // A start still on its way (looking up keys, making the folder) gives way.
      this.spawnSeq += 1;
      this.setStatus({ state: 'stopping' }, true);
      await this.stopEncoder();
      this.stopHealth();
      this.setStatus({ ...idle(this.status.available, this.status.encoder, this.profile()) }, true);
      this.syncWindow();
      // (Uncovered too: a cover ends with the stream.)
      this.sendConfig();
      return;
    }
    await this.restartEncoder(wasRecording && this.want.record);
  }

  /** The computer can't keep up: switch to Light and carry on (a ~2 s gap; recording continues). */
  async lighter(): Promise<void> {
    this.d.updateSettings({ stream: { ...this.d.getSettings().stream, performance: 'light' } });
    if (!this.encoding) return;
    this.setStatus({ advice: null }, true);
    this.abr.reset(this.freshProfile().videoKbps);
    await this.restartWithNewWindow();
  }

  /**
   * Start again in a fresh stream window (another size, or the other pipeline): a short gap,
   * and a recording carries on as a new part.
   */
  private async restartWithNewWindow(): Promise<void> {
    await this.stopEncoder();
    this.closeWindow();
    // Stopped meanwhile: no window to reopen.
    if (!this.encoding) return this.syncWindow();
    this.openWindow();
    if (this.want.record) this.part += 1;
    await this.spawnEncoder();
  }

  /**
   * "Check this computer": encode a test picture as Quality and Balanced would, and remember the
   * best this computer manages with room to spare (Auto then uses it). About 10 seconds.
   */
  async benchmark(): Promise<{ mode: PerformanceMode; encoder: string; runs: BenchmarkRun[] }> {
    const ffmpeg = findFfmpeg();
    if (!ffmpeg) throw new Error('noFfmpeg');
    if (this.encoding) throw new Error('busy');
    const encoder = await this.usableEncoder(ffmpeg);
    const runs: BenchmarkRun[] = [];
    for (const mode of ['quality', 'balanced'] as const) {
      const speed = await runBenchmark(ffmpeg, mode, encoder);
      runs.push({ mode, speed });
      // Quality kept up with room to spare: no need to try anything lighter.
      if (pickBenchmarkMode(runs) === mode) break;
    }
    const mode = pickBenchmarkMode(runs);
    this.d.log.info('benchmark', { encoder, runs, mode });
    this.d.updateSettings({
      stream: {
        ...this.d.getSettings().stream,
        benchmark: { at: new Date().toISOString(), mode, encoder },
      },
    });
    this.setStatus({ profile: this.profile() }, true);
    return { mode, encoder, runs };
  }

  /**
   * Cover the stream (something on screen mustn't go out on it): the stream and recording show
   * the cover picture instead, until uncovered. The sound carries on. Ends with the stream.
   */
  cover(on: boolean): void {
    if (this.status.covered === on) return;
    this.d.log.info(on ? 'stream covered' : 'stream uncovered');
    this.setStatus({ covered: on }, true);
    this.sendConfig();
  }

  /** The cover picture from Settings › Streaming: the logo card, or a picture or video. */
  private coverVisual(): ScreenVisual {
    const c = this.d.getSettings().stream.cover;
    return c.kind === 'logo' ? this.d.logo() : c;
  }

  /** Try a failed destination again (restarts the encoder; the recording continues). */
  async retryDestinations(): Promise<void> {
    if (!this.encoding) return;
    await this.restartEncoder(this.want.record);
  }

  /**
   * A Live console is watching: send it the stream picture at `fps` (0: none), and keep the
   * stream window open before going live when `ready` (so the picture can be checked, and going
   * live is instant). Repeated every few seconds while it's open; silence ends it.
   */
  watch(sender: number, fps: number, ready: boolean): void {
    const before = this.watchers.get(sender);
    const isNew = !before;
    if (fps <= 0 && !ready) {
      if (this.watchers.delete(sender)) this.watchersChanged();
      return;
    }
    this.watchers.set(sender, {
      fps,
      ready,
      until: Date.now() + WATCH_TTL_MS,
      lastFrame: before?.lastFrame ?? 0,
    });
    this.watchTimer ??= setInterval(() => this.expireWatchers(), 2_000);
    // The heartbeat repeats every few seconds: only a real change needs anything done.
    if (!before || before.fps !== fps || before.ready !== ready) this.watchersChanged();
    // A new console sees the picture at once, even when nothing on screen is moving.
    if (isNew && fps > 0) setTimeout(() => this.repaint(), 50);
  }

  private expireWatchers(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, w] of this.watchers)
      if (w.until < now) {
        this.watchers.delete(id);
        changed = true;
      }
    if (!this.watchers.size && this.watchTimer) {
      clearInterval(this.watchTimer);
      this.watchTimer = null;
    }
    if (changed) this.watchersChanged();
  }

  /** Who is watching changed: the window, the preview and the meters follow. */
  private watchersChanged(): void {
    this.syncWindow();
    this.syncPreview();
    this.sendConfig();
  }

  /** Settings changed: the stream window redraws; size and quality apply to the next start. */
  settingsChanged(): void {
    if (this.win) this.sendConfig();
    if (this.status.state === 'idle') {
      void this.refreshEncoder();
      // A different mode may change the size: a waiting window reopens at the new size.
      if (this.win && this.winProfile && this.winProfile.height !== this.profile().height) {
        this.closeWindow();
        this.syncWindow();
      }
    }
  }

  // ---------- The stream window ----------

  private fromStreamWindow(e: IpcMainEvent): boolean {
    return (
      !!this.win &&
      !this.win.isDestroyed() &&
      e.sender.id === this.win.webContents.id &&
      isTrustedFrameUrl(e.senderFrame?.url)
    );
  }

  /** Open the window while encoding, or while a console wants it ready; close it otherwise. */
  private syncWindow(): void {
    const readyWanted =
      this.profile().allowReady && [...this.watchers.values()].some((w) => w.ready);
    const wanted = this.encoding || readyWanted;
    if (wanted && !this.win) this.openWindow();
    if (!wanted && this.win) this.closeWindow();
    if (this.status.ready !== !!this.win) this.setStatus({ ready: !!this.win }, true);
  }

  /** The profile the settings ask for now (on this computer). */
  private freshProfile(): StreamProfile {
    return resolvePerformance(this.d.getSettings().stream, this.machine);
  }

  /** `cpu`: the hardware encoder can't take this stream: frames are copied for ffmpeg. */
  private openWindow(opts: { cpu?: boolean } = {}): void {
    // A new window always takes the profile as it is now (never a previous window's).
    const profile = this.freshProfile();
    this.winProfile = profile;
    const { width, height } = sizeOf(profile);
    // GPU pipeline when it can be: the picture stays on the GPU as shared textures.
    const gpu = !opts.cpu && this.gpuPossible(width, height, profile.fps);
    this.winGpu = gpu;
    const win = openPictureWindow({
      windows: this.d.windows,
      width,
      height,
      fps: profile.fps,
      offscreen: gpu ? { useSharedTexture: true } : { deviceScaleFactor: 1 },
      onPaint: (e, image) => {
        if (gpu) this.relay.onTexture(e.texture ?? null, this.watchers);
        // Only the raw picture is kept (one copy); the preview is made from it when wanted.
        else this.latest = bitmapOf(image, width, height);
      },
      onCrash: () => {
        if (this.win !== win) return;
        this.d.log.warn('stream window crashed; reopening');
        this.win = null;
        if (!win.isDestroyed()) win.destroy();
        // Live: start again in a fresh window (the encoder must restart with it: the old one is
        // waiting for a page that's gone). Otherwise just reopen it if it's wanted.
        if (this.encoding) void this.restartWithNewWindow();
        else this.syncWindow();
      },
    });
    // Problems inside the stream page (it has no window to show them) go to the log.
    win.webContents.on('console-message', (e) => {
      if (
        (e.level === 'warning' || e.level === 'error') &&
        !e.message.startsWith('Loading the font')
      )
        this.d.log.warn('stream page', { level: e.level, message: e.message.slice(0, 400) });
    });
    this.win = win;
    this.pageReady = false;
    this.black = gpu ? null : Buffer.alloc(width * height * 4);
    this.setStatus({ ready: true, profile, pipeline: gpu ? 'gpu' : 'cpu' }, true);
    this.syncPreview();
  }

  private closeWindow(): void {
    const win = this.win;
    this.win = null;
    this.winProfile = null;
    this.relay.release();
    this.latest = null;
    this.black = null;
    this.syncPreview();
    if (win && !win.isDestroyed()) win.destroy();
  }

  private sendConfig(): void {
    if (!this.win || this.win.isDestroyed()) return;
    const settings = this.d.getSettings();
    const profile = this.winProfile ?? this.profile();
    const size = sizeOf(profile);
    // Meters and the sound mix only while someone can hear or see them: live, or a console
    // watching (so its meters show the mics working before going live).
    const busy = this.encoding || this.watchers.size > 0;
    sendPictureConfig(this.win.webContents, this.d, size, {
      picture: settings.stream.picture,
      wordsTheme: this.d.wordsTheme(),
      kindThemes: this.d.kindThemes(),
      ...streamPictureExtras(settings, profile.height, this.d.alternateThemes()),
      transparent: false,
      meters: busy,
      mix: busy,
      probe: this.winGpu ? { ...size, fps: profile.fps, kbps: profile.videoKbps } : null,
      cover: this.status.covered ? this.coverVisual() : null,
    });
  }

  /** The preview JPEG, only while a console watches (at the fastest rate any asks for). */
  private syncPreview(): void {
    const fps = Math.min(
      8,
      this.profile().previewFps * 2,
      Math.max(0, ...[...this.watchers.values()].map((w) => w.fps)),
    );
    if (this.previewTimer) clearInterval(this.previewTimer);
    this.previewTimer = null;
    // GPU pipeline: consoles get the GPU frames themselves (onTexture), no JPEGs.
    if (!this.win || this.winGpu || fps <= 0) return;
    this.previewTimer = setInterval(() => this.sendPreview(), 1000 / fps);
  }

  private sendPreview(): void {
    const frame = this.latest;
    const p = this.winProfile;
    if (!frame || !p) return;
    const jpeg = nativeImage
      .createFromBitmap(frame, sizeOf(p))
      .resize({ width: 480, quality: 'good' })
      .toJPEG(62);
    this.d.windows.sendToControl(Channels.evStreamPreview, new Uint8Array(jpeg));
  }

  // ---------- The GPU pipeline ----------

  private static capsKey(width: number, height: number, fps: number): string {
    return `${width}x${height}@${fps}`;
  }

  /** Can the picture stay on the GPU for this size and rate? (Not known yet counts as yes.) */
  private gpuPossible(width: number, height: number, fps: number): boolean {
    if (!sharedTexturesAvailable() || this.gpuBroken) return false;
    if (process.env.LAMPSTAND_STREAM_PIPELINE === 'cpu') return false;
    if (this.d.getSettings().stream.quality.encoder !== 'auto') return false;
    return this.gpuCaps.get(StreamController.capsKey(width, height, fps)) !== false;
  }

  /** Ask the stream window for a fresh picture (it otherwise paints only on change). */
  private repaint(): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.invalidate();
  }

  private onEncoderReport(r: EncoderReport): void {
    if (r.type === 'caps') {
      const key = StreamController.capsKey(r.width, r.height, r.fps);
      this.gpuCaps.set(key, r.hardware);
      if (!r.hardware) this.d.log.info('no hardware encoding for this size', { key });
      for (const w of this.capsWaiters.splice(0)) w();
      // Can't do it in hardware: the waiting window comes back on the CPU pipeline.
      if (!r.hardware && this.winGpu && !this.ff) {
        this.closeWindow();
        this.syncWindow();
      }
    } else if (r.type === 'stats') {
      this.pageEncoded = r.encoded;
      this.pageDropped = r.dropped;
      this.encodeMs = r.encodeMs;
    } else {
      this.d.log.warn('hardware encoder failed; carrying on with the standard encoder', {
        message: r.message,
      });
      this.gpuBroken = true;
      if (this.pipeline === 'gpu' && this.encoding) {
        this.d.notice({ level: 'warning', key: 'streamGpuFallback' });
        void this.restartWithNewWindow(); // now on the CPU pipeline: ffmpeg encodes
      }
    }
  }

  /** Wait (briefly) to hear whether the hardware encoder can do this size. */
  private async gpuCapsFor(width: number, height: number, fps: number): Promise<boolean> {
    const key = StreamController.capsKey(width, height, fps);
    if (!this.gpuCaps.has(key))
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, CAPS_TIMEOUT_MS);
        this.capsWaiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    return this.gpuCaps.get(key) === true;
  }

  /**
   * An encoded frame from the stream page: on to ffmpeg as an FLV tag with the frame's real
   * time (ffmpeg only packages it). The stream opens with the FLV header and the encoder's
   * configuration, at a keyframe.
   */
  private writeVideo(data: Uint8Array, key: boolean, ms: number, config: Uint8Array | null): void {
    const stdin = this.ff?.stdin;
    if (this.pipeline !== 'gpu' || !stdin?.writable) return;
    // Every (re)start begins at a keyframe: it carries the picture size ffmpeg needs first.
    // After a skip, the next keyframe is taken only once what was waiting has gone (else the
    // delay it was skipping comes straight back); one is asked for as soon as it has.
    if (this.waitForKey) {
      const draining =
        this.flvOpen && this.backlog.seconds(stdin.writableLength) > RESUME_BACKLOG_S;
      if (draining) return;
      if (!key) {
        if (!this.keyAsked) {
          this.keyAsked = true;
          this.win?.webContents.send(Channels.evEncode, { keyframe: true });
          this.repaint();
        }
        return;
      }
    }
    if (!this.flvOpen) {
      if (!config) return; // a keyframe without its configuration: wait for the next
      stdin.write(Buffer.concat([FLV_HEADER, flvSequenceHeader(config)]));
      this.flvOpen = true;
      this.flvBase = ms; // this stream's time zero
    }
    this.waitForKey = false;
    if (!this.encodeLive) {
      // The first picture is out: picture and sound start together from here.
      this.encodeLive = true;
      this.audio.begin();
      this.sound.start(performance.now());
      this.startAudioClock();
    }
    // ffmpeg can't take video as fast as it's made (a slow or stalled upload): rather than let
    // the stream fall further and further behind live, skip ahead to the next keyframe once
    // about a second is waiting. The picture jumps; the delay doesn't grow.
    // Measured in seconds of video waiting (a still slide is tiny in bytes).
    if (this.backlog.seconds(stdin.writableLength) > MAX_BACKLOG_S) {
      // The frames already queued still count until ffmpeg takes them (not forgotten).
      this.waitForKey = true;
      this.keyAsked = false;
      this.congested += 1;
      return;
    }
    this.videoBytes += data.byteLength;
    this.videoChunks += 1;
    const tag = flvFrame(data, key, ms - this.flvBase);
    this.backlog.add(tag.length, ms);
    stdin.write(tag);
  }

  // ---------- The encoder ----------

  /** The encoder to use: the one asked for or the best this ffmpeg has, minus any that failed. */
  private async usableEncoder(ffmpeg: string): Promise<Encoder> {
    const working = (await probeEncoders(ffmpeg)).filter((e) => !this.brokenEncoders.has(e));
    return pickEncoder(working, this.d.getSettings().stream.quality.encoder);
  }

  private async refreshEncoder(): Promise<void> {
    const ffmpeg = findFfmpeg();
    const encoder = ffmpeg ? await this.usableEncoder(ffmpeg) : 'libx264';
    this.machine = { ...this.machine, hardwareEncoder: encoder !== 'libx264' };
    const srt = ffmpeg ? (await probeProtocols(ffmpeg)).includes('srt') : false;
    if (this.status.state === 'idle')
      this.setStatus({ available: !!ffmpeg, encoder, profile: this.profile(), srt });
    else this.setStatus({ srt });
  }

  /** (Re)start ffmpeg with what's wanted now; a recording carried over continues as a new part. */
  private async restartEncoder(continuingRecording: boolean): Promise<void> {
    await this.stopEncoder();
    if (continuingRecording) this.part += 1;
    await this.spawnEncoder();
  }

  /** Stopped, or started again by something else, while start `run` was waiting. */
  private overtaken(run: number): boolean {
    return !this.encoding || run !== this.spawnSeq;
  }

  /**
   * A new recording file: in the chosen folder, else (it can't be made, e.g. a drive that was
   * unplugged) the usual one; null when neither can be.
   */
  private async recordingPath(chosen: string | null): Promise<string | null> {
    const name = recordingName(this.sessionStart ?? new Date(), this.part);
    for (const folder of [...new Set([recordingsFolder(chosen), recordingsFolder(null)])]) {
      try {
        await mkdir(folder, { recursive: true });
        return freeName(join(folder, name));
      } catch (err) {
        this.d.log.warn('recording folder unavailable', { folder, error: String(err) });
      }
    }
    return null;
  }

  /** Where the stream goes now (nowhere when only recording). */
  private async destinations(ffmpeg: string): Promise<ResolvedDestinations> {
    if (!this.want.stream) return { urls: [], status: [] };
    return resolveDestinations({
      destinations: this.d.getSettings().stream.destinations,
      getKey: (id) => this.d.secrets.get(keyName(id)),
      protocols: await probeProtocols(ffmpeg),
      alt: this.altIngest,
      onNote: (event, info) =>
        event === 'badKey'
          ? this.d.log.warn('saved stream key looks wrong', info)
          : this.d.log.info('destination', info),
    });
  }

  private async spawnEncoder(): Promise<void> {
    const ffmpeg = findFfmpeg();
    if (!ffmpeg) {
      this.fail('noFfmpeg');
      return;
    }
    const s = this.d.getSettings().stream;
    const run = ++this.spawnSeq;
    const encoder = await this.usableEncoder(ffmpeg);
    const { urls, status: destinations } = await this.destinations(ffmpeg);
    if (run !== this.spawnSeq) return; // another start overtook this one
    const streamIds = destinations.filter((x) => x.state === 'connecting').map((x) => x.id);
    if (this.want.stream && urls.length === 0) {
      this.want.stream = false;
      this.setStatus({ destinations, error: 'noDestinations' });
      if (!this.want.record) {
        this.setStatus(
          { ...idle(this.status.available, encoder, this.profile()), error: 'noDestinations' },
          true,
        );
        this.syncWindow();
        return;
      }
    }
    const record = this.want.record ? await this.recordingPath(s.recording.folder) : null;
    if (this.overtaken(run)) return;
    if (this.want.record && !record) {
      // Nowhere to record (the folder can't be made): carry on streaming without it.
      this.want.record = false;
      this.d.notice({ level: 'error', key: 'recordingFolderFailed' });
      if (!this.want.stream) {
        this.fail('recordingFolderFailed');
        return;
      }
    }
    if (!this.win) this.openWindow();
    let profile = this.winProfile ?? this.profile();
    // GPU pipeline when the window shares textures, the settings still allow it (an encoder
    // chosen by hand means ffmpeg encodes) and the hardware encoder can do this size; otherwise
    // the window comes back on the CPU pipeline (frames copied to ffmpeg).
    const wanted = sizeOf(profile);
    const gpu =
      this.winGpu &&
      this.gpuPossible(wanted.width, wanted.height, profile.fps) &&
      (await this.gpuCapsFor(wanted.width, wanted.height, profile.fps));
    if (this.overtaken(run) || this.ff) return;
    if (this.winGpu && !gpu) {
      this.closeWindow();
      this.openWindow({ cpu: true });
      profile = this.winProfile ?? this.profile();
    }
    const { width, height } = sizeOf(profile);
    this.pipeline = gpu ? 'gpu' : 'cpu';
    const args = buildArgs({
      input: gpu ? 'flv' : 'raw',
      width,
      height,
      fps: profile.fps,
      videoKbps: profile.videoKbps,
      audioKbps: profile.audioKbps,
      audioEncoder: await probeAacEncoder(ffmpeg),
      x264Preset: profile.x264Preset,
      encoder,
      streams: urls,
      record,
    });
    this.slaves = [...streamIds, ...(record ? ['record'] : [])];
    this.ffmpegDropped = 0;
    this.lastStderr = [];
    this.stopping = false;
    this.spawnedAt = Date.now();
    const ff = spawn(ffmpeg, args, {
      stdio: ['pipe', 'ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.ff = ff;
    // The encoder comes first: a busy app, browser or projector never starves it.
    try {
      if (ff.pid) setPriority(ff.pid, osConstants.priority.PRIORITY_ABOVE_NORMAL);
    } catch {
      /* not allowed here: it runs at normal priority */
    }
    this.audioOut = (ff.stdio[3] as Writable | null) ?? null;
    ff.stdin?.on('error', () => undefined);
    this.audioOut?.on('error', () => undefined);
    let buf = '';
    ff.stderr?.on('data', (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split(/\r|\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) this.onLog(line);
    });
    ff.on('exit', (code) => this.onExit(ff, encoder, code));
    // ffmpeg couldn't be started at all (not executable, blocked): handled like it stopping.
    ff.on('error', (err) => {
      this.d.log.error('encoder could not run', { error: String(err) });
      this.onExit(ff, encoder, null);
    });
    this.d.log.info('encoder started', {
      pipeline: this.pipeline,
      encoder,
      mode: profile.mode,
      destinations: urls.length,
      recording: !!record,
      size: `${width}x${height}@${profile.fps}`,
    });
    this.setStatus(
      {
        state: 'starting',
        streaming: this.want.stream,
        recording: !!record,
        since: this.status.since ?? new Date().toISOString(),
        destinations,
        recordingPath: record,
        recordingBytes: 0,
        encoder: gpu ? 'webcodecs' : encoder,
        pipeline: this.pipeline,
        profile,
        error: this.status.error === 'noDestinations' ? 'noDestinations' : null,
      },
      true,
    );
    if (this.want.stream && urls.length) this.d.notice({ level: 'info', key: 'streamStarting' });
    this.sendConfig();
    this.videoSeen = false;
    if (gpu) {
      // The stream page encodes on the GPU from now (its clock and the sound's start together).
      this.pageEncoded = 0;
      this.pageDropped = 0;
      this.lastSent = 0;
      this.lastDropped = 0;
      this.waitForKey = true;
      this.keyAsked = true; // a fresh encoder starts with one
      this.flvOpen = false;
      this.backlog.reset();
      this.videoBytes = 0;
      this.rateAt = 0;
      this.rateBytes = 0;
      this.videoChunks = 0;
      const cfg = { width, height, fps: profile.fps, kbps: this.abr.current };
      if (this.pageReady) this.beginGpuEncode(cfg);
      else this.pendingEncode = cfg; // sent when the page has loaded
    } else {
      // The frame pump starts now, and the sound with it.
      this.encodeLive = true;
      this.audio.begin();
      this.sound.start(performance.now());
      this.startPump(profile.fps);
    }
    this.startHealth();
  }

  /**
   * GPU pipeline: tell the stream page to start encoding, and start the sound's clock at the
   * same moment, so picture and sound share time zero.
   */
  private beginGpuEncode(cfg: EncodeConfig): void {
    this.pendingEncode = null;
    if (!this.ff || !this.win || this.win.isDestroyed()) return;
    this.win.webContents.send(Channels.evEncode, cfg);
    // The sound's clock starts with the first encoded frame (see writeVideo).
    this.encodeLive = false;
  }

  /** GPU pipeline: no frame pump in main, but the sound still follows the clock. */
  private startAudioClock(): void {
    if (this.audioTimer) clearInterval(this.audioTimer);
    this.audioTimer = setInterval(() => this.audio.topUp(), 20);
  }

  /** Frames on wall-clock time, and sound topped up to the same clock (silence fills gaps). */
  private startPump(fps: number): void {
    this.pump?.stop();
    this.lastSent = 0;
    this.lastDropped = 0;
    this.pump = new FramePump(fps, {
      write: () => {
        const stdin = this.ff?.stdin;
        if (!stdin?.writable) return false;
        // More than a few frames waiting: hold this one (it's written once there's room, so
        // the picture stays with the sound), rather than let delay and memory grow.
        if (stdin.writableLength > (this.black?.length ?? 0) * PIPE_FRAMES) return false;
        stdin.write(this.latest ?? this.black ?? Buffer.alloc(0));
        return true;
      },
      afterTick: () => this.audio.topUp(),
    });
    this.pump.begin();
  }

  /**
   * Keep the stream within what the upload carries (GPU pipeline: the hardware encoder changes
   * its bitrate on the fly). A backlog that built up anyway is thrown away by reconnecting.
   */
  private adaptBitrate(delayMs: number, sentKbps: number, at: number): void {
    if (this.pipeline !== 'gpu' || !this.want.stream || this.status.state !== 'live') return;
    if (process.env.LAMPSTAND_ABR === '0') return; // measurements: the stream as it was without it
    const action = this.abr.next({ delayMs, sentKbps, at });
    this.adviseOnUpload(at);
    if (!action) return;
    if (action.kind === 'reconnect') {
      this.d.log.warn('stream fell behind; reconnecting to catch up', {
        delayMs,
        kbps: this.abr.current,
      });
      this.abr.reconnected(at);
      void this.restartEncoder(this.want.record);
      return;
    }
    this.d.log.info('bitrate', {
      targetKbps: action.kbps,
      reason: action.reason,
      delayMs,
      sentKbps,
    });
    this.win?.webContents.send(Channels.evEncode, { bitrate: action.kbps });
    const full = this.winProfile?.videoKbps ?? action.kbps;
    this.setStatus({ adaptedKbps: action.kbps < full ? action.kbps : null }, true);
  }

  /** The upload has held the bitrate far under the target: Light would look sharper. */
  private adviseOnUpload(at: number): void {
    const starved = this.abr.starved(at) && this.profile().mode !== 'light';
    if (starved && !this.status.advice) {
      this.d.log.warn('upload too slow for this picture size', { kbps: this.abr.current });
      this.setStatus({ advice: 'upload' }, true);
    } else if (!starved && this.status.advice === 'upload') this.setStatus({ advice: null }, true);
  }

  /** Sound from the stream page's mix, on to ffmpeg. */
  private writeAudio(chunk: Buffer): void {
    // GPU pipeline: nothing until the page is encoding (else the sound would start early).
    if (this.pipeline === 'gpu' && !this.encodeLive) return;
    this.audio.write(chunk);
  }

  /** Frames this computer couldn't get to ffmpeg in time (too slow, or a slow upload). */
  private localDropped(): number {
    return (this.pump?.dropped ?? this.pageDropped) + this.congested;
  }

  // ---------- Health ----------

  /** The stream mix's level just now (from the stream window's meter). */
  hearStream(peak: number): void {
    this.sound.hear(peak, performance.now());
  }

  /** Live with no sound for a while: say so (once in the log, and on the console). */
  private checkSilence(): boolean {
    const silent = this.encodeLive && this.sound.silent(performance.now());
    if (silent && !this.status.silent) {
      const channels = this.d.getLiveState().mixer.channels.filter((c) => c.stream);
      this.d.log.warn('stream has no sound', {
        streamChannels: channels.map((c) => c.kind),
        streamMuted: this.d.getLiveState().mixer.stream.mute,
      });
    }
    return silent;
  }

  private startHealth(): void {
    this.stopHealth();
    this.healthTimer = setInterval(() => void this.sampleHealth(), HEALTH_MS);
  }

  private stopHealth(): void {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = null;
  }

  /** A line every 10 s while running, so a problem stream can be understood afterwards. */
  private logHealth(): void {
    this.healthTicks += 1;
    if (this.healthTicks % 5 === 0)
      this.d.log.info('stream health', {
        pipeline: this.pipeline,
        fps: this.status.fps,
        speed: this.status.speed,
        kbps: this.status.kbps,
        delayMs: this.status.delayMs,
        encoded: this.pageEncoded,
        dropped: this.localDropped(),
        ...this.audio.report(),
        backlogS: Math.round(this.backlog.seconds(this.ff?.stdin?.writableLength ?? 0) * 100) / 100,
        congested: this.congested,
        pcmSeen: this.pcmSeen,
        audioPeakDb: this.sound.takePeakDb(),
      });
    if (!DEBUG) return;
    this.d.log.info('gpu frames', {
      ...this.relay.stats,
      pageEncoded: this.pageEncoded,
      pageDropped: this.pageDropped,
      videoBytes: this.videoBytes,
      videoChunks: this.videoChunks,
      waitForKey: this.waitForKey,
    });
    this.d.log.info('audio', {
      writable: this.audioOut?.writable,
      waiting: this.audioOut?.writableLength,
    });
  }

  private async sampleHealth(): Promise<void> {
    this.logHealth();
    const ff = this.ff;
    if (!ff) return;
    // Frames handed to the encoder, and dropped, since last time: counted by main's frame pump
    // (CPU pipeline) or by the stream page's hardware encoder (GPU pipeline).
    const pump = this.pump;
    const sentTotal = pump ? pump.framesSent : this.pageEncoded + this.pageDropped;
    const droppedTotal = this.localDropped();
    this.samples = [
      ...this.samples.slice(-15),
      {
        speed: this.status.speed,
        sent: sentTotal - this.lastSent,
        dropped: droppedTotal - this.lastDropped,
      },
    ];
    this.lastSent = sentTotal;
    this.lastDropped = droppedTotal;

    const metrics = app.getAppMetrics();
    const appCpu = metrics.reduce((a, m) => a + m.cpu.percentCPUUsage, 0);
    const appMemMB = Math.round(metrics.reduce((a, m) => a + m.memory.workingSetSize, 0) / 1024);
    const enc = ff.pid ? await sampleProcess(ff.pid) : null;
    const recordingBytes = this.status.recordingPath
      ? await stat(this.status.recordingPath).then(
          (s) => s.size,
          () => this.status.recordingBytes,
        )
      : 0;

    // It stopped (or restarted) while the numbers were being read: they belong to nothing now.
    if (this.ff !== ff) return;
    this.history.fps.push(this.status.fps);
    this.history.kbps.push(this.status.kbps);
    this.history.speed.push(this.status.speed);
    this.history.cpu.push(Math.round(appCpu + (enc?.cpu ?? 0)));
    // Falling behind while the bitrate is lowered is the upload, not this computer (that advice
    // is the upload one).
    const struggling =
      isStruggling(this.samples) && this.profile().mode !== 'light' && !this.status.adaptedKbps;
    if (struggling && !this.status.advice)
      this.d.log.warn('stream struggling', { speed: this.status.speed, dropped: droppedTotal });
    this.setStatus({
      silent: this.checkSilence(),
      dropped: droppedTotal + this.ffmpegDropped,
      recordingBytes,
      advice: struggling && !this.status.advice ? 'lighter' : this.status.advice,
      health: {
        appCpu: Math.round(appCpu),
        appMemMB,
        encoderCpu: enc ? Math.round(enc.cpu) : null,
        encoderMemMB: enc?.memMB ?? null,
        history: {
          fps: [...this.history.fps.values],
          kbps: [...this.history.kbps.values],
          speed: [...this.history.speed.values],
          cpu: [...this.history.cpu.values],
        },
      },
    });
  }

  /** A line from ffmpeg: a progress reading, or something to remember (and maybe act on). */
  private onLog(line: string): void {
    if (!line.trim()) return;
    if (DEBUG) this.d.log.info('ffmpeg', { line: redactKeys(line) });
    const p = parseProgress(line);
    if (p) return this.onProgress(p);
    const before = this.lastStderr;
    this.lastStderr = [...this.lastStderr.slice(-30), redactKeys(line)];
    // tee: "Slave muxer #N failed: …" (that destination is dropped; the rest carry on).
    const slave = /Slave muxer #(\d+) failed/i.exec(line);
    if (slave) this.onDestinationFailed(Number(slave[1]), line, before);
  }

  /** ffmpeg's progress (every second): live yet?, the readings, and the bitrate to aim for. */
  private onProgress(p: Progress): void {
    const destinations =
      p.time > 1
        ? this.markDestinations('ok', undefined, (x) => x.state === 'connecting')
        : this.status.destinations;
    const first = this.status.state === 'starting' && p.time > 1;
    this.ffmpegDropped = p.dropped;
    // How far behind live the stream leaves here: time since the first frame, less the
    // stream time ffmpeg has sent on (it grows when a destination can't keep up), plus what
    // comes before ffmpeg: a frame's wait for its turn and the encoder's time.
    const delayMs =
      this.audio.started && p.time > 1
        ? Math.max(0, Math.round(this.audio.elapsedMs() - p.time * 1000)) +
          (this.pipeline === 'gpu' ? Math.round(1000 / (p.fps || 30)) + this.encodeMs : 0)
        : null;
    // ffmpeg gives no bitrate when it sends to several places at once: count our own bytes.
    const at = performance.now();
    const videoKbps = this.rateAt
      ? Math.round(((this.videoBytes - this.rateBytes) * 8) / (at - this.rateAt))
      : 0;
    const kbps =
      p.kbps > 0
        ? p.kbps
        : this.pipeline === 'gpu' && this.rateAt
          ? videoKbps + (this.winProfile?.audioKbps ?? 0)
          : this.status.kbps;
    this.rateAt = at;
    this.rateBytes = this.videoBytes;
    if (delayMs !== null) this.adaptBitrate(delayMs, videoKbps, at);
    this.setStatus(
      {
        state: p.time > 1 ? 'live' : this.status.state,
        fps: p.fps,
        kbps,
        delayMs,
        speed: p.speed,
        dropped: this.localDropped() + p.dropped,
        destinations,
      },
      first,
    );
    if (first && this.want.stream && destinations.some((x) => x.state === 'ok'))
      this.d.notice({ level: 'info', key: 'streamLive' });
    // Back and steady for a minute: a later drop starts the backoff afresh.
    if (first && this.status.restarts > 0) {
      if (this.steadyTimer) clearTimeout(this.steadyTimer);
      const ff = this.ff;
      this.steadyTimer = setTimeout(() => {
        this.steadyTimer = null;
        if (this.ff === ff && this.status.state === 'live') this.setStatus({ restarts: 0 });
      }, STEADY_MS);
    }
  }

  /** One of the tee's outputs failed: mark that destination (the rest carry on). */
  private onDestinationFailed(slave: number, line: string, before: string[]): void {
    const id = this.slaves[slave];
    const reason = destinationFailure(line, before.slice(-8));
    this.d.log.warn('stream destination failed', { id, reason, context: before.slice(-6) });
    this.setStatus(
      {
        destinations: this.markDestinations('failed', reason, (x) => x.id === id),
        error: 'destinationFailed',
      },
      true,
    );
    if (id && id !== 'record') this.d.notice({ level: 'warning', key: 'streamDestinationFailed' });
  }

  private onExit(ff: ChildProcess, encoder: string, code: number | null): void {
    if (this.ff !== ff) return;
    this.ff = null;
    this.audioOut = null;
    this.stopFeeding();
    if (this.stopping) return;
    // Stopped on its own while wanted: restart (a hardware encoder that fails at once is
    // dropped for libx264), with backoff, a limited number of times.
    const quick = Date.now() - this.spawnedAt < QUICK_EXIT_MS;
    this.d.log.warn('encoder stopped', { code, tail: this.lastStderr.slice(-20) });
    if (quick && encoder !== 'libx264' && this.lastStderr.some((l) => l.includes(encoder))) {
      this.brokenEncoders.add(encoder);
      void this.spawnEncoder();
      return;
    }
    // It stopped at once because a destination couldn't connect (with no recording, nothing
    // else keeps it going): try that destination's other address once, then say why and stop,
    // instead of reconnecting forever.
    if (quick && this.want.stream && !this.want.record && this.connectFailed()) {
      if (this.tryFallbackIngest()) return;
      const reason = destinationFailure(this.lastStderr.at(-1) ?? '', this.lastStderr.slice(-12));
      this.setStatus({ destinations: this.markDestinations('failed', reason) });
      this.fail('destinationFailed');
      return;
    }
    const n = this.status.restarts;
    const wait = BACKOFF_MS[n];
    if (wait === undefined) {
      this.fail('encoderStopped');
      return;
    }
    this.setStatus(
      {
        state: 'starting',
        restarts: n + 1,
        error: 'reconnecting',
        destinations: this.markDestinations('connecting'),
      },
      true,
    );
    this.d.notice({ level: 'warning', key: 'streamReconnecting' });
    this.retry = setTimeout(() => {
      this.retry = null;
      if (this.encoding) {
        if (this.want.record) this.part += 1;
        void this.spawnEncoder();
      }
    }, wait);
  }

  /** ffmpeg's last lines say an output couldn't be opened (a connection that didn't happen). */
  private connectFailed(): boolean {
    return this.lastStderr.some((l) => CONNECT_FAILED.test(l));
  }

  /** Switch destinations that have a second address to it, and start again (once each). */
  private tryFallbackIngest(): boolean {
    const dests = this.d.getSettings().stream.destinations.filter((d) => d.enabled);
    const switching = dests.filter((d) => hasFallbackIngest(d.kind) && !this.altIngest.has(d.id));
    if (!switching.length) return false;
    for (const d of switching) this.altIngest.add(d.id);
    this.d.log.warn('destination could not connect; trying its other address', {
      ids: switching.map((d) => d.id),
    });
    void this.spawnEncoder();
    return true;
  }

  /**
   * Stop sending pictures and sound to ffmpeg: the frame pump and sound clock stop, and the
   * stream page stops encoding (the next start is a fresh stream from a keyframe).
   */
  private stopFeeding(): void {
    this.pump?.stop();
    this.pump = null;
    if (this.audioTimer) clearInterval(this.audioTimer);
    this.audioTimer = null;
    this.pendingEncode = null;
    this.encodeLive = false;
    if (this.pipeline === 'gpu' && this.win && !this.win.isDestroyed())
      this.win.webContents.send(Channels.evEncode, null);
  }

  /** The destinations, with those `which` picks moved to a state (and given a reason). */
  private markDestinations(
    state: StreamDestinationStatus['state'],
    reason?: string,
    which: (d: StreamDestinationStatus) => boolean = () => true,
  ): StreamDestinationStatus[] {
    return this.status.destinations.map((x) =>
      which(x) ? { ...x, state, ...(reason ? { reason } : {}) } : x,
    );
  }

  private async stopEncoder(): Promise<void> {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    if (this.steadyTimer) clearTimeout(this.steadyTimer);
    this.steadyTimer = null;
    this.stopFeeding();
    const ff = this.ff;
    if (!ff) return;
    this.stopping = true;
    await new Promise<void>((resolve) => {
      const kill = setTimeout(() => {
        ff.kill('SIGKILL');
        resolve();
      }, STOP_TIMEOUT_MS);
      ff.once('exit', () => {
        clearTimeout(kill);
        resolve();
      });
      // Closing both inputs lets ffmpeg finish the files cleanly.
      ff.stdin?.end();
      (ff.stdio[3] as Writable | null)?.end();
    });
    this.ff = null;
    this.audioOut = null;
  }

  private fail(error: string): void {
    this.want = { stream: false, record: false };
    this.spawnSeq += 1;
    this.stopFeeding();
    this.stopHealth();
    // Destinations that failed keep their reason, so the console can say why.
    const failed = this.status.destinations.filter((d) => d.state === 'failed');
    this.setStatus(
      {
        ...idle(this.status.available, this.status.encoder, this.profile()),
        error,
        destinations: failed,
      },
      true,
    );
    this.syncWindow();
    this.d.notice({ level: 'error', key: 'streamFailed' });
  }

  /**
   * Update the status; the windows hear about it at most twice a second (state changes, and
   * anything `now`, at once).
   */
  private setStatus(patch: Partial<StreamStatus>, now = false): void {
    const stateChanged = patch.state !== undefined && patch.state !== this.status.state;
    this.status = { ...this.status, ...patch };
    const since = Date.now() - this.lastEmit;
    if (now || stateChanged || since >= STATUS_MS) {
      if (this.statusTimer) clearTimeout(this.statusTimer);
      this.statusTimer = null;
      this.lastEmit = Date.now();
      this.d.onStatus(this.status);
    } else
      this.statusTimer ??= setTimeout(() => {
        this.statusTimer = null;
        this.lastEmit = Date.now();
        this.d.onStatus(this.status);
      }, STATUS_MS - since);
  }
}

/** Where recordings go: the chosen folder, else Movies (macOS) / Videos (Windows) › Lampstand. */
export function recordingsFolder(chosen: string | null): string {
  return process.env.LAMPSTAND_RECORDINGS ?? chosen ?? join(app.getPath('videos'), 'Lampstand');
}

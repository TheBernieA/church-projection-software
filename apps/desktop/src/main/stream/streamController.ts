import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { cpus, setPriority, totalmem, constants as osConstants } from 'node:os';
import { basename, join } from 'node:path';
import type { Writable } from 'node:stream';
import {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage,
  sharedTexture,
  webContents,
  type IpcMainEvent,
} from 'electron';
import {
  resolvePerformance,
  type LiveState,
  type MachineInfo,
  type PerformanceMode,
  type ResolvedKindThemes,
  type ScreenVisual,
  type Settings,
  type Standby,
  type StreamProfile,
  type Theme,
  type VideoInputLayer,
} from '@lampstand/core';
import {
  Channels,
  type EncodeConfig,
  type EncoderReport,
  type Notice,
  type StreamConfig,
  type StreamDestinationStatus,
  type StreamStatus,
} from '@lampstand/ipc-contract';
import { isTrustedFrameUrl } from '../ipc/router';
import { rendererUrl } from '../security/protocols';
import { secureWebPreferences } from '../security/hardening';
import type { SecretStore } from '../secrets/secretStore';
import type { WindowManager } from '../windows/windowManager';
import { type Logger } from '../types';
import { findFfmpeg, probeEncoders, probeProtocols } from './ffmpeg';
import {
  buildArgs,
  destinationFailure,
  destinationUrl,
  freeName,
  redactKeys,
  isDirectUrl,
  isStreamUrl,
  parseProgress,
  pickEncoder,
  plausibleKey,
  protocolOf,
  recordingName,
  type Encoder,
} from './ffmpegArgs';
import { Backlog } from './backlog';
import { FLV_HEADER, flvFrame, flvSequenceHeader } from './flv';
import { FramePump } from './framePump';
import { isStruggling, Ring, sampleProcess, type HealthSample } from './health';
import { pickBenchmarkMode, runBenchmark, type BenchmarkRun } from './benchmark';

export interface StreamDeps {
  log: Logger;
  windows: WindowManager;
  secrets: SecretStore;
  getSettings: () => Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  getLiveState: () => LiveState;
  logo: () => ScreenVisual;
  standby: () => Standby;
  /** The theme chosen for the stream's lower third (resolved from its id), or null. */
  wordsTheme: () => Theme | null;
  /** Themes the stream uses instead of each slide's own, by kind of slide. */
  kindThemes: () => ResolvedKindThemes;
  onStatus: (s: StreamStatus) => void;
  notice: (n: Notice) => void;
}

/** The secret-store name of a destination's stream key. */
export const keyName = (destinationId: string): string => `stream-key:${destinationId}`;

const SAMPLE_RATE = 48_000;
const BYTES_PER_SECOND = SAMPLE_RATE * 2 * 4; // stereo float32
/** Waits before each restart after the encoder stops on its own (then gives up). */
const BACKOFF_MS = [2_000, 5_000, 10_000, 20_000, 20_000, 20_000, 20_000, 20_000, 20_000, 20_000];
/** Status goes to the windows at most this often (state changes go at once). */
const STATUS_MS = 500;
const HEALTH_MS = 2_000;
/** A Live console says it's watching at least this often; silence means it went away. */
const WATCH_TTL_MS = 8_000;

const DEFAULT_PROFILE: StreamProfile = resolvePerformance(
  {
    destinations: [],
    quality: { height: 720, fps: 30, videoKbps: 3500, audioKbps: 160, encoder: 'auto' },
    picture: {
      camera: null,
      words: 'lowerThird',
      background: 'program',
      wordsAuto: true,
      wordsSize: 60,
      wordsAlign: 'theme',
      wordsTheme: null,
    },
    sound: { room: true, roomGain: 1, mics: [] },
    performance: 'balanced',
    benchmark: null,
    recording: { folder: null, recordWhileStreaming: true },
  },
  { cores: 4, memoryGB: 8, hardwareEncoder: false },
);

const idle = (available: boolean, encoder: string, profile: StreamProfile): StreamStatus => ({
  state: 'idle',
  streaming: false,
  recording: false,
  since: null,
  fps: 0,
  kbps: 0,
  speed: 0,
  dropped: 0,
  delayMs: null,
  srt: null,
  droppedLocal: 0,
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

/**
 * The stream's own camera as a screen layer, with its saved settings; its capture size is never
 * larger than the stream (a 4K webcam is asked for 720p on a 720p stream: far less to decode).
 */
export function streamCameraLayer(s: Settings, height: number): VideoInputLayer | null {
  const id = s.stream.picture.camera;
  if (!id) return null;
  const c = s.cameras[id];
  const cap = height >= 1080 ? '1080' : '720';
  const wanted = c?.resolution ?? 'auto';
  const resolution = wanted === 'auto' || Number(wanted) > Number(cap) ? cap : wanted;
  return {
    deviceId: id,
    label: c?.name || 'Camera',
    fit: c?.fit ?? 'cover',
    mirror: c?.mirror ?? false,
    resolution,
  };
}

interface Watcher {
  fps: number;
  ready: boolean;
  until: number;
  /** When it was last sent a GPU frame (to keep to its rate). */
  lastFrame: number;
}

/** Most video (in seconds) allowed to wait for ffmpeg before skipping ahead to stay live. */
const MAX_BACKLOG_S = 1.2;

/** The stream page's encoder, as a GPU frame receiver (window ids are positive). */
const ENCODER_TARGET = -1;

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
  private audioBytes = 0;
  private encodeStart = 0;
  private part = 1;
  private sessionStart: Date | null = null;
  private stopping = false;
  private spawnedAt = 0;
  private slaves: string[] = [];
  private brokenEncoders = new Set<string>();
  private lastStderr: string[] = [];
  private quitting = false;
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
  /** Receivers with a GPU frame on its way (each takes one at a time). */
  private readonly pending = new Set<number>();
  /** GPU pipeline: the page's encoder counts, and chunks waiting for a keyframe. */
  private pageEncoded = 0;
  private pageDropped = 0;
  private lastPageEncoded = 0;
  private lastPageDropped = 0;
  private waitForKey = false;
  /** GPU pipeline: the FLV stream to this ffmpeg has been opened, and its time zero. */
  private flvOpen = false;
  private flvBase = 0;
  /** Sound dropped because it had run ahead of the clock (bytes), for the log. */
  private audioDropped = 0;
  private audioPadded = 0;
  private healthTicks = 0;
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
  private srt: boolean | null = null;
  private videoChunks = 0;
  private audioTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly d: StreamDeps) {
    this.status = idle(!!findFfmpeg(), 'auto', DEFAULT_PROFILE);
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
    // Finish the recording properly before the app quits.
    app.on('before-quit', (e) => {
      if (this.quitting || this.status.state === 'idle') return;
      e.preventDefault();
      this.quitting = true;
      void this.stop({ stream: true, record: true }).finally(() => app.quit());
    });
    void this.refreshEncoder();
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
      this.setStatus({ state: 'stopping' }, true);
      await this.stopEncoder();
      this.stopHealth();
      this.setStatus({ ...idle(this.status.available, this.status.encoder, this.profile()) }, true);
      this.syncWindow();
      return;
    }
    await this.restartEncoder(wasRecording && this.want.record);
  }

  /** The computer can't keep up: switch to Light and carry on (a ~2 s gap; recording continues). */
  async lighter(): Promise<void> {
    this.d.updateSettings({ stream: { ...this.d.getSettings().stream, performance: 'light' } });
    if (!this.encoding) return;
    await this.stopEncoder();
    this.closeWindow();
    this.openWindow();
    if (this.want.record) this.part += 1;
    this.setStatus({ advice: null }, true);
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
    const s = this.d.getSettings().stream;
    const encoder = pickEncoder(
      (await probeEncoders(ffmpeg)).filter((e) => !this.brokenEncoders.has(e)),
      s.quality.encoder,
    );
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
    const isNew = !this.watchers.has(sender);
    if (fps <= 0 && !ready) this.watchers.delete(sender);
    else
      this.watchers.set(sender, {
        fps,
        ready,
        until: Date.now() + WATCH_TTL_MS,
        lastFrame: this.watchers.get(sender)?.lastFrame ?? 0,
      });
    this.watchTimer ??= setInterval(() => this.expireWatchers(), 2_000);
    this.syncWindow();
    this.syncPreview();
    this.sendConfig();
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
    if (changed) {
      this.syncWindow();
      this.syncPreview();
      this.sendConfig();
    }
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

  private openWindow(): void {
    // A new window always takes the profile as it is now (never a previous window's).
    const profile = this.freshProfile();
    this.winProfile = profile;
    const height = profile.height;
    const width = Math.round((height * 16) / 9);
    // GPU pipeline when it can be: the picture stays on the GPU as shared textures.
    const gpu = this.gpuPossible(width, height, profile.fps);
    this.winGpu = gpu;
    const win = new BrowserWindow({
      show: false,
      width,
      height,
      useContentSize: true,
      frame: false,
      paintWhenInitiallyHidden: true,
      backgroundColor: '#000000',
      webPreferences: secureWebPreferences('stream', {
        offscreen: gpu ? { useSharedTexture: true } : { deviceScaleFactor: 1 },
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
      }),
    });
    win.webContents.setFrameRate(profile.fps);
    this.d.windows.attachFollower(win, 'stream');
    win.webContents.on('paint', (e, _dirty, image) => {
      if (gpu) {
        this.onTexture(e.texture ?? null);
        return;
      }
      const sz = image.getSize();
      // Only the raw picture is kept (one copy); the preview is made from it when wanted.
      this.latest = (
        sz.width === width && sz.height === height ? image : image.resize({ width, height })
      ).toBitmap();
    });
    // Problems inside the stream page (it has no window to show them) go to the log.
    win.webContents.on('console-message', (e) => {
      if (
        (e.level === 'warning' || e.level === 'error') &&
        !e.message.startsWith('Loading the font')
      )
        this.d.log.warn('stream page', { level: e.level, message: e.message.slice(0, 400) });
    });
    win.webContents.on('render-process-gone', () => {
      this.d.log.warn('stream window crashed; reopening');
      if (this.win === win) {
        this.win = null;
        this.openWindow();
      }
    });
    this.win = win;
    this.pageReady = false;
    this.black = gpu ? null : Buffer.alloc(width * height * 4);
    void win.loadURL(rendererUrl('stream'));
    this.setStatus({ ready: true, profile, pipeline: gpu ? 'gpu' : 'cpu' }, true);
    this.syncPreview();
  }

  private closeWindow(): void {
    const win = this.win;
    this.win = null;
    this.winProfile = null;
    this.held?.done();
    this.held = null;
    this.latest = null;
    this.black = null;
    this.syncPreview();
    if (win && !win.isDestroyed()) win.destroy();
  }

  private sendConfig(): void {
    if (!this.win || this.win.isDestroyed()) return;
    const settings = this.d.getSettings();
    const s = settings.stream;
    const profile = this.winProfile ?? this.profile();
    const config: StreamConfig = {
      width: Math.round((profile.height * 16) / 9),
      height: profile.height,
      picture: s.picture,
      wordsTheme: this.d.wordsTheme(),
      kindThemes: this.d.kindThemes(),
      cameraLayer: streamCameraLayer(settings, profile.height),
      transparent: false,
      // Meters only while someone can see them (a console, or the mixer while live).
      meters: this.encoding || this.watchers.size > 0,
      // No microphones open until it goes live.
      mix: this.encoding,
      probe: this.winGpu
        ? {
            width: Math.round((profile.height * 16) / 9),
            height: profile.height,
            fps: profile.fps,
            kbps: profile.videoKbps,
          }
        : null,
      logo: this.d.logo(),
      standby: this.d.standby(),
    };
    this.win.webContents.send(Channels.evStreamConfig, config);
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
    const width = Math.round((p.height * 16) / 9);
    const jpeg = nativeImage
      .createFromBitmap(frame, { width, height: p.height })
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!sharedTexture || this.gpuBroken) return false;
    if (process.env.LAMPSTAND_STREAM_PIPELINE === 'cpu') return false;
    if (this.d.getSettings().stream.quality.encoder !== 'auto') return false;
    return this.gpuCaps.get(StreamController.capsKey(width, height, fps)) !== false;
  }

  /**
   * A new stream picture, as a GPU texture: hand it to the stream page's encoder (while
   * encoding on the GPU) and to each watching Live console (at the rate it asked for), then let
   * it go. Nothing is copied to the CPU.
   */
  /** GPU frame hand-off counts (for the debug log). */
  private readonly texStats = { paints: 0, sent: 0, done: 0, failed: 0, toEncoder: 0 };

  private onTexture(tex: Electron.OffscreenSharedTexture | null): void {
    if (!tex) return;
    this.texStats.paints += 1;
    const now = Date.now();
    const lightCap = this.winProfile?.mode === 'light' ? 15 : 30;
    // Watching consoles take one frame at a time at their own rate: a slow one only skips its
    // own frames, and never holds up the encoder or keeps textures alive.
    const targets: { id: number; frame: Electron.WebFrameMain }[] = [];
    for (const [id, w] of this.watchers) {
      const fps = Math.min(w.fps, lightCap);
      if (fps <= 0 || this.pending.has(id) || now - w.lastFrame < 1000 / fps - 4) continue;
      const wc = webContents.fromId(id);
      if (!wc || wc.isDestroyed()) continue;
      w.lastFrame = now;
      targets.push({ id, frame: wc.mainFrame });
    }
    // The stream page always gets the picture (even before going live): the window paints only
    // on change, so its encoder must already hold the latest one when encoding starts.
    const toPage = this.winGpu && !!this.win && !this.win.isDestroyed();
    if (!targets.length && !toPage) {
      tex.release();
      return;
    }
    let imported: Electron.SharedTextureImported;
    try {
      imported = sharedTexture.importSharedTexture({
        textureInfo: tex.textureInfo,
        allReferencesReleased: () => tex.release(),
      });
    } catch (err) {
      tex.release();
      this.d.log.warn('gpu texture import failed', { err: String(err) });
      return;
    }
    let refs = targets.length + (toPage ? 1 : 0);
    const done = (): void => {
      if (--refs === 0) imported.release();
    };
    for (const t of targets) this.sendTexture(t.id, t.frame, imported, done);
    if (toPage) {
      if (!this.pending.has(ENCODER_TARGET)) this.sendToPage({ imported, done });
      else {
        // Busy: keep only the newest picture, and send it as soon as the last one arrives.
        this.held?.done();
        this.held = { imported, done };
      }
    }
  }

  /** The newest picture waiting for the stream page (one at most). */
  private held: { imported: Electron.SharedTextureImported; done: () => void } | null = null;

  private sendToPage(p: { imported: Electron.SharedTextureImported; done: () => void }): void {
    const frame = this.win && !this.win.isDestroyed() ? this.win.webContents.mainFrame : null;
    if (!frame) return p.done();
    this.texStats.toEncoder += 1;
    this.sendTexture(ENCODER_TARGET, frame, p.imported, () => {
      p.done();
      const next = this.held;
      this.held = null;
      if (next) this.sendToPage(next);
    });
  }

  private sendTexture(
    id: number,
    frame: Electron.WebFrameMain,
    imported: Electron.SharedTextureImported,
    done: () => void,
  ): void {
    this.pending.add(id);
    this.texStats.sent += 1;
    void sharedTexture
      .sendSharedTexture({ frame, importedSharedTexture: imported })
      .then(
        () => void (this.texStats.done += 1),
        (err: unknown) => {
          this.texStats.failed += 1;
          if (process.env.LAMPSTAND_FFMPEG_DEBUG)
            this.d.log.info('gpu send failed', { err: String(err), to: id });
        },
      )
      .finally(() => {
        this.pending.delete(id);
        done();
      });
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
        void this.restartOnCpu();
      }
    }
  }

  /** The GPU encoder failed mid-stream: carry on with ffmpeg encoding (a short gap). */
  private async restartOnCpu(): Promise<void> {
    await this.stopEncoder();
    this.closeWindow();
    this.openWindow();
    if (this.want.record) this.part += 1;
    await this.spawnEncoder();
  }

  /** Wait (briefly) to hear whether the hardware encoder can do this size. */
  private async gpuCapsFor(width: number, height: number, fps: number): Promise<boolean> {
    const key = StreamController.capsKey(width, height, fps);
    if (!this.gpuCaps.has(key))
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 4_000);
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
    if (this.waitForKey && !key) return;
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
      this.encodeStart = performance.now();
      this.audioBytes = 0;
      this.startAudioClock();
    }
    // ffmpeg can't take video as fast as it's made (a slow or stalled upload): rather than let
    // the stream fall further and further behind live, skip ahead to the next keyframe once
    // about a second is waiting. The picture jumps; the delay doesn't grow.
    // Measured in seconds of video waiting (a still slide is tiny in bytes).
    if (this.backlog.seconds(stdin.writableLength) > MAX_BACKLOG_S) {
      this.waitForKey = true;
      this.pageDropped += 1;
      this.congested += 1;
      this.backlog.reset();
      this.win?.webContents.send(Channels.evEncode, { keyframe: true });
      this.repaint();
      return;
    }
    this.videoBytes += data.byteLength;
    this.videoChunks += 1;
    const tag = flvFrame(data, key, ms - this.flvBase);
    this.backlog.add(tag.length, ms);
    stdin.write(tag);
  }

  // ---------- The encoder ----------

  private async refreshEncoder(): Promise<void> {
    const ffmpeg = findFfmpeg();
    const list = ffmpeg ? await probeEncoders(ffmpeg) : [];
    const want = this.d.getSettings().stream.quality.encoder;
    const encoder = ffmpeg
      ? pickEncoder(
          list.filter((e) => !this.brokenEncoders.has(e)),
          want,
        )
      : 'libx264';
    this.machine = { ...this.machine, hardwareEncoder: encoder !== 'libx264' };
    this.srt = ffmpeg ? (await probeProtocols(ffmpeg)).includes('srt') : false;
    if (this.status.state === 'idle')
      this.setStatus({ available: !!ffmpeg, encoder, profile: this.profile(), srt: this.srt });
    else this.setStatus({ srt: this.srt });
  }

  /** (Re)start ffmpeg with what's wanted now; a recording carried over continues as a new part. */
  private async restartEncoder(continuingRecording: boolean): Promise<void> {
    await this.stopEncoder();
    if (continuingRecording) this.part += 1;
    await this.spawnEncoder();
  }

  private async destinations(): Promise<{ urls: string[]; status: StreamDestinationStatus[] }> {
    const urls: string[] = [];
    const status: StreamDestinationStatus[] = [];
    if (!this.want.stream) return { urls, status };
    const ffmpeg = findFfmpeg();
    const protocols = ffmpeg ? await probeProtocols(ffmpeg) : [];
    for (const dest of this.d.getSettings().stream.destinations.filter((x) => x.enabled)) {
      if (dest.kind === 'direct') {
        // A direct link (SRT or UDP) to a receiver: no key, no service in between.
        const address = dest.url.trim();
        const reason = !isDirectUrl(address)
          ? 'The address should look like srt://192.168.1.50:9000 or udp://192.168.1.50:9000.'
          : !protocols.includes(protocolOf(address))
            ? 'The ffmpeg on this computer was built without SRT. Use a udp:// address, or install an ffmpeg that has SRT.'
            : null;
        if (reason) {
          status.push({ id: dest.id, name: dest.name, state: 'failed', reason });
          continue;
        }
        this.d.log.info('destination', { id: dest.id, kind: dest.kind });
        urls.push(destinationUrl(dest.kind, address, null));
        status.push({ id: dest.id, name: dest.name, state: 'connecting' });
        continue;
      }
      const key = await this.d.secrets.get(keyName(dest.id));
      const needsKey = dest.kind !== 'custom';
      const url = destinationUrl(dest.kind, dest.url, key, this.altIngest.has(dest.id));
      if ((needsKey && !key) || !isStreamUrl(url)) {
        status.push({ id: dest.id, name: dest.name, state: 'failed' });
        continue;
      }
      // A saved key that can't be right (e.g. the "Stream URL" was pasted as the key): say so
      // now, rather than let the service hang up on it.
      if (key && !plausibleKey(dest.kind, key)) {
        this.d.log.warn('saved stream key looks wrong', { id: dest.id, length: key.length });
        status.push({
          id: dest.id,
          name: dest.name,
          state: 'failed',
          reason: 'The saved stream key doesn’t look right for this service. Paste the key again.',
        });
        continue;
      }
      this.d.log.info('destination', { id: dest.id, kind: dest.kind, keyLength: key?.length ?? 0 });
      urls.push(url);
      status.push({ id: dest.id, name: dest.name, state: 'connecting' });
    }
    return { urls, status };
  }

  private async spawnEncoder(): Promise<void> {
    const ffmpeg = findFfmpeg();
    if (!ffmpeg) {
      this.fail('noFfmpeg');
      return;
    }
    const s = this.d.getSettings().stream;
    const encoder: Encoder = pickEncoder(
      (await probeEncoders(ffmpeg)).filter((e) => !this.brokenEncoders.has(e)),
      s.quality.encoder,
    );
    const { urls, status: destinations } = await this.destinations();
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
    let record: string | null = null;
    if (this.want.record) {
      const folder = recordingsFolder(s.recording.folder);
      await mkdir(folder, { recursive: true });
      record = freeName(join(folder, recordingName(this.sessionStart ?? new Date(), this.part)));
    }
    if (!this.win) this.openWindow();
    let profile = this.winProfile ?? this.profile();
    let height = profile.height;
    let width = Math.round((height * 16) / 9);
    // GPU pipeline when the window shares textures and the hardware encoder can do this size;
    // otherwise the window comes back on the CPU pipeline (frames copied to ffmpeg).
    let gpu = this.winGpu && (await this.gpuCapsFor(width, height, profile.fps));
    if (!this.encoding) return; // stopped while we waited
    if (this.winGpu && !gpu) {
      this.closeWindow();
      this.openWindow();
      gpu = false;
      profile = this.winProfile ?? this.profile();
      height = profile.height;
      width = Math.round((height * 16) / 9);
    }
    this.pipeline = gpu ? 'gpu' : 'cpu';
    const args = buildArgs({
      input: gpu ? 'flv' : 'raw',
      width,
      height,
      fps: profile.fps,
      videoKbps: profile.videoKbps,
      audioKbps: profile.audioKbps,
      x264Preset: profile.x264Preset,
      encoder,
      streams: urls,
      record,
    });
    this.slaves = [...streamIds, ...(record ? ['record'] : [])];
    this.audioBytes = 0;
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
    this.encodeStart = performance.now();
    if (gpu) {
      // The stream page encodes on the GPU from now (its clock and the sound's start together).
      this.pageEncoded = 0;
      this.pageDropped = 0;
      this.lastPageEncoded = 0;
      this.lastPageDropped = 0;
      this.waitForKey = true;
      this.flvOpen = false;
      this.backlog.reset();
      this.videoBytes = 0;
      this.rateAt = 0;
      this.rateBytes = 0;
      this.videoChunks = 0;
      const cfg = { width, height, fps: profile.fps, kbps: profile.videoKbps };
      if (this.pageReady) this.beginGpuEncode(cfg);
      else this.pendingEncode = cfg; // sent when the page has loaded
    } else this.startPump(profile.fps);
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
    this.audioTimer = setInterval(() => this.topUpAudio(), 20);
  }

  /** Silence fills any gap, so the sound keeps to the clock and ffmpeg never waits for it. */
  private topUpAudio(): void {
    const due = ((performance.now() - this.encodeStart) / 1000) * BYTES_PER_SECOND;
    const behind = due - this.audioBytes;
    // A busy moment in the stream page delays a batch of sound: wait up to 150 ms for it
    // before filling with silence (filling sooner turns every small delay into a click).
    if (behind > BYTES_PER_SECOND * 0.15) {
      const bytes = Math.floor(behind / 8) * 8;
      if (this.writeAudio(Buffer.alloc(bytes), true)) this.audioPadded += bytes;
    }
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
        // Backed up by more than ~half a second: drop rather than let memory grow.
        if (stdin.writableLength > (this.black?.length ?? 0) * Math.max(2, fps / 2)) return false;
        stdin.write(this.latest ?? this.black ?? Buffer.alloc(0));
        return true;
      },
      afterTick: () => this.topUpAudio(),
    });
    this.pump.begin();
  }

  private writeAudio(chunk: Buffer, silence = false): boolean {
    // GPU pipeline: nothing until the page is encoding (else the sound would start early).
    if (this.pipeline === 'gpu' && !this.encodeLive) return false;
    // The sound is timed by counting samples, so it must match the clock both ways: silence
    // fills a gap, and sound that arrives after its gap was filled (a late batch) is dropped,
    // or every hiccup would push the sound later for the rest of the stream.
    if (!silence && this.encodeStart) {
      const due = ((performance.now() - this.encodeStart) / 1000) * BYTES_PER_SECOND;
      if (this.audioBytes - due > BYTES_PER_SECOND * 0.15) {
        this.audioDropped += chunk.length;
        return false;
      }
    }
    const out = this.audioOut;
    // Up to half a second may wait for ffmpeg (it opens the sound a moment after the picture:
    // dropping those first batches would leave the sound short for the whole stream, and ffmpeg
    // holding every video frame back until the sound catches up).
    if (!out?.writable || out.writableLength > BYTES_PER_SECOND / 2) return false;
    out.write(chunk);
    this.audioBytes += chunk.length;
    return true;
  }

  // ---------- Health ----------

  private startHealth(): void {
    this.stopHealth();
    this.healthTimer = setInterval(() => void this.sampleHealth(), HEALTH_MS);
  }

  private stopHealth(): void {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = null;
  }

  private async sampleHealth(): Promise<void> {
    // A line every 10 s while running, so a problem stream can be understood afterwards.
    this.healthTicks += 1;
    if (this.healthTicks % 5 === 0)
      this.d.log.info('stream health', {
        pipeline: this.pipeline,
        fps: this.status.fps,
        speed: this.status.speed,
        kbps: this.status.kbps,
        delayMs: this.status.delayMs,
        encoded: this.pageEncoded,
        dropped: this.pump?.dropped ?? this.pageDropped,
        audioLeadMs: Math.round(
          ((this.audioBytes - ((performance.now() - this.encodeStart) / 1000) * BYTES_PER_SECOND) /
            BYTES_PER_SECOND) *
            1000,
        ),
        audioPaddedMs: Math.round((this.audioPadded / BYTES_PER_SECOND) * 1000),
        audioDroppedMs: Math.round((this.audioDropped / BYTES_PER_SECOND) * 1000),
        backlogS: Math.round(this.backlog.seconds(this.ff?.stdin?.writableLength ?? 0) * 100) / 100,
        congested: this.congested,
        pcmSeen: this.pcmSeen,
      });
    if (process.env.LAMPSTAND_FFMPEG_DEBUG)
      this.d.log.info('gpu frames', {
        ...this.texStats,
        pageEncoded: this.pageEncoded,
        pageDropped: this.pageDropped,
        videoBytes: this.videoBytes,
        videoChunks: this.videoChunks,
        waitForKey: this.waitForKey,
      });
    if (process.env.LAMPSTAND_FFMPEG_DEBUG)
      this.d.log.info('audio', {
        bytes: this.audioBytes,
        writable: this.audioOut?.writable,
        needDrain: this.audioOut?.writableNeedDrain,
        pending: this.audioOut?.writableLength,
      });
    if (!this.ff) return;
    // Frames handed to the encoder, and dropped, since last time: counted by main's frame pump
    // (CPU pipeline) or by the stream page's hardware encoder (GPU pipeline).
    const pump = this.pump;
    const sentTotal = pump ? pump.framesSent : this.pageEncoded + this.pageDropped;
    const droppedTotal = pump ? pump.dropped : this.pageDropped;
    const sent = sentTotal - (pump ? this.lastSent : this.lastPageEncoded);
    const dropped = droppedTotal - (pump ? this.lastDropped : this.lastPageDropped);
    if (pump) {
      this.lastSent = sentTotal;
      this.lastDropped = droppedTotal;
    } else {
      this.lastPageEncoded = sentTotal;
      this.lastPageDropped = droppedTotal;
    }
    this.samples = [...this.samples.slice(-15), { speed: this.status.speed, sent, dropped }];

    const metrics = app.getAppMetrics();
    const winPid = this.win && !this.win.isDestroyed() ? this.win.webContents.getOSProcessId() : 0;
    const appCpu = metrics.reduce((a, m) => a + m.cpu.percentCPUUsage, 0);
    const appMemMB = Math.round(metrics.reduce((a, m) => a + m.memory.workingSetSize, 0) / 1024);
    const windowCpu = metrics.find((m) => m.pid === winPid)?.cpu.percentCPUUsage ?? 0;
    const enc = this.ff.pid ? await sampleProcess(this.ff.pid) : null;
    const recordingBytes = this.status.recordingPath
      ? await stat(this.status.recordingPath).then(
          (s) => s.size,
          () => this.status.recordingBytes,
        )
      : 0;

    this.history.fps.push(this.status.fps);
    this.history.kbps.push(this.status.kbps);
    this.history.speed.push(this.status.speed);
    this.history.cpu.push(Math.round(appCpu + (enc?.cpu ?? 0)));
    const struggling = isStruggling(this.samples) && this.profile().mode !== 'light';
    if (struggling && !this.status.advice)
      this.d.log.warn('stream struggling', { speed: this.status.speed, dropped: droppedTotal });
    this.setStatus({
      droppedLocal: droppedTotal,
      dropped: droppedTotal + this.ffmpegDropped,
      recordingBytes,
      advice: struggling ? 'lighter' : this.status.advice,
      health: {
        appCpu: Math.round(appCpu),
        appMemMB,
        windowCpu: Math.round(windowCpu),
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

  private onLog(line: string): void {
    if (!line.trim()) return;
    if (process.env.LAMPSTAND_FFMPEG_DEBUG) this.d.log.info('ffmpeg', { line: redactKeys(line) });
    const p = parseProgress(line);
    if (p) {
      const destinations = this.status.destinations.map((x) =>
        x.state === 'connecting' && p.time > 1 ? { ...x, state: 'ok' as const } : x,
      );
      const first = this.status.state === 'starting' && p.time > 1;
      this.ffmpegDropped = p.dropped;
      // How far behind live the stream leaves here: time since the first frame, less the
      // stream time ffmpeg has sent on (it grows when a destination can't keep up), plus what
      // comes before ffmpeg: a frame's wait for its turn and the encoder's time.
      const delayMs =
        this.encodeStart && p.time > 1
          ? Math.max(0, Math.round(performance.now() - this.encodeStart - p.time * 1000)) +
            (this.pipeline === 'gpu' ? Math.round(1000 / (p.fps || 30)) + this.encodeMs : 0)
          : null;
      // ffmpeg gives no bitrate when it sends to several places at once: count our own bytes.
      const at = performance.now();
      const kbps =
        p.kbps > 0
          ? p.kbps
          : this.pipeline === 'gpu' && this.rateAt
            ? Math.round(((this.videoBytes - this.rateBytes) * 8) / (at - this.rateAt)) +
              this.d.getSettings().stream.quality.audioKbps
            : this.status.kbps;
      this.rateAt = at;
      this.rateBytes = this.videoBytes;
      this.setStatus(
        {
          state: p.time > 1 ? 'live' : this.status.state,
          fps: p.fps,
          kbps,
          delayMs,
          speed: p.speed,
          dropped: (this.pump?.dropped ?? this.pageDropped) + p.dropped,
          destinations,
        },
        first,
      );
      if (first && this.want.stream && destinations.some((x) => x.state === 'ok'))
        this.d.notice({ level: 'info', key: 'streamLive' });
      return;
    }
    const before = this.lastStderr;
    this.lastStderr = [...this.lastStderr.slice(-30), redactKeys(line)];
    // tee: "Slave muxer #N failed: …" (that destination is dropped; the rest carry on).
    const slave = /Slave muxer #(\d+) failed/i.exec(line);
    if (slave) {
      const id = this.slaves[Number(slave[1])];
      const reason = destinationFailure(line, before.slice(-8));
      this.d.log.warn('stream destination failed', {
        id,
        reason,
        context: before.slice(-6),
      });
      this.setStatus(
        {
          destinations: this.status.destinations.map((x) =>
            x.id === id ? { ...x, state: 'failed' as const, reason } : x,
          ),
          error: 'destinationFailed',
        },
        true,
      );
      if (id && id !== 'record')
        this.d.notice({ level: 'warning', key: 'streamDestinationFailed' });
    }
  }

  private onExit(ff: ChildProcess, encoder: string, code: number | null): void {
    if (this.ff !== ff) return;
    this.ff = null;
    this.audioOut = null;
    this.pump?.stop();
    // The page stops encoding too: the next start is a fresh stream from a keyframe.
    if (this.audioTimer) clearInterval(this.audioTimer);
    this.audioTimer = null;
    this.pendingEncode = null;
    this.encodeLive = false;
    if (this.pipeline === 'gpu' && this.win && !this.win.isDestroyed())
      this.win.webContents.send(Channels.evEncode, null);
    if (this.stopping) return;
    // Stopped on its own while wanted: restart (a hardware encoder that fails at once is
    // dropped for libx264), with backoff, a limited number of times.
    const quick = Date.now() - this.spawnedAt < 5_000;
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
      this.setStatus({
        destinations: this.status.destinations.map((x) => ({
          ...x,
          state: 'failed' as const,
          reason: reason || x.reason,
        })),
      });
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
        destinations: this.status.destinations.map((x) => ({
          ...x,
          state: 'connecting' as const,
        })),
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
    return this.lastStderr.some((l) =>
      /error opening output|could not open|could not write header|nothing was written|connection refused|input\/output error|handshake|tls|ssl|server error|end of file/i.test(
        l,
      ),
    );
  }

  /** Switch destinations that have a second address to it, and start again (once each). */
  private tryFallbackIngest(): boolean {
    const dests = this.d.getSettings().stream.destinations.filter((d) => d.enabled);
    const switching = dests.filter((d) => d.kind === 'youtube' && !this.altIngest.has(d.id));
    if (!switching.length) return false;
    for (const d of switching) this.altIngest.add(d.id);
    this.d.log.warn('destination could not connect; trying its other address', {
      ids: switching.map((d) => d.id),
    });
    void this.spawnEncoder();
    return true;
  }

  private async stopEncoder(): Promise<void> {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.pump?.stop();
    this.pump = null;
    if (this.audioTimer) clearInterval(this.audioTimer);
    this.audioTimer = null;
    this.pendingEncode = null;
    this.encodeLive = false;
    if (this.pipeline === 'gpu' && this.win && !this.win.isDestroyed())
      this.win.webContents.send(Channels.evEncode, null);
    const ff = this.ff;
    if (!ff) return;
    this.stopping = true;
    await new Promise<void>((resolve) => {
      const kill = setTimeout(() => {
        ff.kill('SIGKILL');
        resolve();
      }, 6_000);
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
    this.pump?.stop();
    this.pump = null;
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
    this.status = { ...this.status, ...patch, srt: this.srt };
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

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { cpus, setPriority, totalmem, constants as osConstants } from 'node:os';
import { basename, join } from 'node:path';
import type { Writable } from 'node:stream';
import { app, BrowserWindow, ipcMain, nativeImage, type IpcMainEvent } from 'electron';
import {
  resolvePerformance,
  type LiveState,
  type MachineInfo,
  type PerformanceMode,
  type ScreenVisual,
  type Settings,
  type Standby,
  type StreamProfile,
  type VideoInputLayer,
} from '@lampstand/core';
import {
  Channels,
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
import { findFfmpeg, probeEncoders } from './ffmpeg';
import {
  buildArgs,
  destinationUrl,
  freeName,
  isStreamUrl,
  parseProgress,
  pickEncoder,
  recordingName,
  type Encoder,
} from './ffmpegArgs';
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
    picture: { camera: null, words: 'lowerThird', background: 'program' },
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
  droppedLocal: 0,
  destinations: [],
  recordingPath: null,
  recordingBytes: 0,
  error: null,
  ready: false,
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
}

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

  constructor(private readonly d: StreamDeps) {
    this.status = idle(!!findFfmpeg(), 'auto', DEFAULT_PROFILE);
    ipcMain.on(Channels.streamReady, (e) => {
      if (!this.fromStreamWindow(e)) return;
      this.sendConfig();
      e.sender.send(Channels.evLive, d.getLiveState());
    });
    ipcMain.on(Channels.streamAudio, (e, pcm: unknown) => {
      if (!this.fromStreamWindow(e) || !(pcm instanceof Float32Array)) return;
      this.writeAudio(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
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
    if (fps <= 0 && !ready) this.watchers.delete(sender);
    else this.watchers.set(sender, { fps, ready, until: Date.now() + WATCH_TTL_MS });
    this.watchTimer ??= setInterval(() => this.expireWatchers(), 2_000);
    this.syncWindow();
    this.syncPreview();
    this.sendConfig();
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
    const win = new BrowserWindow({
      show: false,
      width,
      height,
      useContentSize: true,
      frame: false,
      paintWhenInitiallyHidden: true,
      backgroundColor: '#000000',
      webPreferences: secureWebPreferences('stream', {
        offscreen: { deviceScaleFactor: 1 },
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
      }),
    });
    win.webContents.setFrameRate(profile.fps);
    this.d.windows.attachFollower(win, 'stream');
    win.webContents.on('paint', (_e, _dirty, image) => {
      const sz = image.getSize();
      // Only the raw picture is kept (one copy); the preview is made from it when wanted.
      this.latest = (
        sz.width === width && sz.height === height ? image : image.resize({ width, height })
      ).toBitmap();
    });
    win.webContents.on('render-process-gone', () => {
      this.d.log.warn('stream window crashed; reopening');
      if (this.win === win) {
        this.win = null;
        this.openWindow();
      }
    });
    this.win = win;
    this.black = Buffer.alloc(width * height * 4);
    void win.loadURL(rendererUrl('stream'));
    this.setStatus({ ready: true, profile }, true);
    this.syncPreview();
  }

  private closeWindow(): void {
    const win = this.win;
    this.win = null;
    this.winProfile = null;
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
      cameraLayer: streamCameraLayer(settings, profile.height),
      transparent: false,
      // Meters only while someone can see them (a console, or the mixer while live).
      meters: this.encoding || this.watchers.size > 0,
      // No microphones open until it goes live.
      mix: this.encoding,
      logo: this.d.logo(),
      standby: this.d.standby(),
    };
    this.win.webContents.send(Channels.evStreamConfig, config);
  }

  /** The preview JPEG, only while a console watches (at the fastest rate any asks for). */
  private syncPreview(): void {
    const fps = Math.min(
      this.profile().previewFps,
      Math.max(0, ...[...this.watchers.values()].map((w) => w.fps)),
    );
    if (this.previewTimer) clearInterval(this.previewTimer);
    this.previewTimer = null;
    if (!this.win || fps <= 0) return;
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
    if (this.status.state === 'idle')
      this.setStatus({ available: !!ffmpeg, encoder, profile: this.profile() });
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
    for (const dest of this.d.getSettings().stream.destinations.filter((x) => x.enabled)) {
      const key = await this.d.secrets.get(keyName(dest.id));
      const needsKey = dest.kind !== 'custom';
      const url = destinationUrl(dest.kind, dest.url, key);
      if ((needsKey && !key) || !isStreamUrl(url)) {
        status.push({ id: dest.id, name: dest.name, state: 'failed' });
        continue;
      }
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
    const profile = this.winProfile ?? this.profile();
    const height = profile.height;
    const width = Math.round((height * 16) / 9);
    const args = buildArgs({
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
        encoder,
        profile,
        error: this.status.error === 'noDestinations' ? 'noDestinations' : null,
      },
      true,
    );
    if (this.want.stream && urls.length) this.d.notice({ level: 'info', key: 'streamStarting' });
    this.sendConfig();
    this.startPump(profile.fps);
    this.startHealth();
  }

  /** Frames on wall-clock time, and sound topped up to the same clock (silence fills gaps). */
  private startPump(fps: number): void {
    this.pump?.stop();
    this.encodeStart = performance.now();
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
      afterTick: () => {
        const due = ((performance.now() - this.encodeStart) / 1000) * BYTES_PER_SECOND;
        const behind = due - this.audioBytes;
        if (behind > BYTES_PER_SECOND * 0.08)
          this.writeAudio(Buffer.alloc(Math.floor(behind / 8) * 8));
      },
    });
    this.pump.begin();
  }

  private writeAudio(chunk: Buffer): void {
    const out = this.audioOut;
    if (!out?.writable || out.writableNeedDrain) return;
    out.write(chunk);
    this.audioBytes += chunk.length;
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
    const pump = this.pump;
    if (!pump) return;
    const sent = pump.framesSent - this.lastSent;
    const dropped = pump.dropped - this.lastDropped;
    this.lastSent = pump.framesSent;
    this.lastDropped = pump.dropped;
    this.samples = [...this.samples.slice(-15), { speed: this.status.speed, sent, dropped }];

    const metrics = app.getAppMetrics();
    const winPid = this.win && !this.win.isDestroyed() ? this.win.webContents.getOSProcessId() : 0;
    const appCpu = metrics.reduce((a, m) => a + m.cpu.percentCPUUsage, 0);
    const appMemMB = Math.round(metrics.reduce((a, m) => a + m.memory.workingSetSize, 0) / 1024);
    const windowCpu = metrics.find((m) => m.pid === winPid)?.cpu.percentCPUUsage ?? 0;
    const enc = this.ff?.pid ? await sampleProcess(this.ff.pid) : null;
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
      this.d.log.warn('stream struggling', { speed: this.status.speed, dropped: pump.dropped });
    this.setStatus({
      droppedLocal: pump.dropped,
      dropped: pump.dropped + this.ffmpegDropped,
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
    const p = parseProgress(line);
    if (p) {
      const destinations = this.status.destinations.map((x) =>
        x.state === 'connecting' && p.time > 1 ? { ...x, state: 'ok' as const } : x,
      );
      const first = this.status.state === 'starting' && p.time > 1;
      this.ffmpegDropped = p.dropped;
      this.setStatus(
        {
          state: p.time > 1 ? 'live' : this.status.state,
          fps: p.fps,
          kbps: p.kbps,
          speed: p.speed,
          dropped: (this.pump?.dropped ?? 0) + p.dropped,
          destinations,
        },
        first,
      );
      if (first && this.want.stream && destinations.some((x) => x.state === 'ok'))
        this.d.notice({ level: 'info', key: 'streamLive' });
      return;
    }
    this.lastStderr = [...this.lastStderr.slice(-30), line];
    // tee: "Slave muxer #N failed: …" (that destination is dropped; the rest carry on).
    const slave = /Slave muxer #(\d+) failed/i.exec(line);
    if (slave) {
      const id = this.slaves[Number(slave[1])];
      this.d.log.warn('stream destination failed', { id });
      this.setStatus(
        {
          destinations: this.status.destinations.map((x) =>
            x.id === id ? { ...x, state: 'failed' as const } : x,
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
    if (this.stopping) return;
    // Stopped on its own while wanted: restart (a hardware encoder that fails at once is
    // dropped for libx264), with backoff, a limited number of times.
    const quick = Date.now() - this.spawnedAt < 5_000;
    this.d.log.warn('encoder stopped', { code, tail: this.lastStderr.slice(-4).join(' | ') });
    if (quick && encoder !== 'libx264' && this.lastStderr.some((l) => l.includes(encoder))) {
      this.brokenEncoders.add(encoder);
      void this.spawnEncoder();
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

  private async stopEncoder(): Promise<void> {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.pump?.stop();
    this.pump = null;
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
    this.setStatus(
      { ...idle(this.status.available, this.status.encoder, this.profile()), error },
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

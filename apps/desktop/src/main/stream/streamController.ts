import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Writable } from 'node:stream';
import { app, BrowserWindow, ipcMain, type IpcMainEvent, type NativeImage } from 'electron';
import type { LiveState, ScreenVisual, Settings, Standby } from '@lampstand/core';
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
  isStreamUrl,
  parseProgress,
  pickEncoder,
  recordingName,
  type Encoder,
} from './ffmpegArgs';

export interface StreamDeps {
  log: Logger;
  windows: WindowManager;
  secrets: SecretStore;
  getSettings: () => Settings;
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

const idle = (available: boolean, encoder: string): StreamStatus => ({
  state: 'idle',
  streaming: false,
  recording: false,
  since: null,
  fps: 0,
  kbps: 0,
  speed: 0,
  dropped: 0,
  destinations: [],
  recordingPath: null,
  error: null,
  preview: null,
  restarts: 0,
  available,
  encoder,
});

/**
 * Livestream and recording, done by Lampstand itself. A hidden (offscreen) stream window draws
 * the stream picture and mixes its sound; frames go to ffmpeg at a steady rate (the last one
 * repeats when nothing changed), sound arrives as PCM (silence fills any gap, so ffmpeg never
 * waits on it); ffmpeg encodes once and sends to every destination and the recording file.
 */
export class StreamController {
  private status: StreamStatus;
  private want = { stream: false, record: false };
  private win: BrowserWindow | null = null;
  private ff: ChildProcess | null = null;
  private audioOut: Writable | null = null;
  private latest: Buffer | null = null;
  private latestImage: NativeImage | null = null;
  private black: Buffer | null = null;
  private pump: ReturnType<typeof setInterval> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private size = { width: 1280, height: 720, fps: 30 };
  private audioBytes = 0;
  private encodeStart = 0;
  private dropped = 0;
  private part = 1;
  private sessionStart: Date | null = null;
  private stopping = false;
  private spawnedAt = 0;
  private slaves: string[] = [];
  private brokenEncoders = new Set<string>();
  private lastStderr: string[] = [];
  private quitting = false;

  constructor(private readonly d: StreamDeps) {
    this.status = idle(!!findFfmpeg(), 'auto');
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
    if (!this.win) {
      this.sessionStart = new Date();
      this.part = 1;
      this.status = { ...this.status, restarts: 0, error: null };
      this.openWindow();
    }
    await this.restartEncoder(before.record && this.want.record);
  }

  /** Stop streaming and/or recording; with neither left, everything closes. */
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
    if (!this.want.stream && !this.want.record) {
      this.setStatus({ state: 'stopping' });
      await this.stopEncoder();
      this.closeWindow();
      this.setStatus({ ...idle(this.status.available, this.status.encoder) });
      return;
    }
    await this.restartEncoder(wasRecording && this.want.record);
  }

  /** Settings changed: the stream window redraws (size and quality apply to the next start). */
  settingsChanged(): void {
    if (this.win) this.sendConfig();
    if (this.status.state === 'idle') void this.refreshEncoder();
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

  private openWindow(): void {
    const q = this.d.getSettings().stream.quality;
    const height = q.height;
    this.size = { width: Math.round((height * 16) / 9), height, fps: q.fps };
    const win = new BrowserWindow({
      show: false,
      width: this.size.width,
      height: this.size.height,
      useContentSize: true,
      frame: false,
      paintWhenInitiallyHidden: true,
      backgroundColor: '#000000',
      webPreferences: secureWebPreferences('stream', {
        offscreen: true,
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
      }),
    });
    win.webContents.setFrameRate(this.size.fps);
    this.d.windows.attachFollower(win, 'stream');
    win.webContents.on('paint', (_e, _dirty, image) => {
      const { width, height } = this.size;
      const sz = image.getSize();
      const img =
        sz.width === width && sz.height === height ? image : image.resize({ width, height });
      this.latestImage = img;
      this.latest = img.toBitmap();
    });
    win.webContents.on('render-process-gone', () => {
      this.d.log.warn('stream window crashed; reopening');
      if (this.win === win) {
        this.win = null;
        this.openWindow();
      }
    });
    this.win = win;
    void win.loadURL(rendererUrl('stream'));
  }

  private closeWindow(): void {
    const win = this.win;
    this.win = null;
    this.latest = null;
    this.latestImage = null;
    if (win && !win.isDestroyed()) win.destroy();
  }

  private sendConfig(): void {
    if (!this.win || this.win.isDestroyed()) return;
    const s = this.d.getSettings().stream;
    const config: StreamConfig = {
      width: this.size.width,
      height: this.size.height,
      picture: s.picture,
      logo: this.d.logo(),
      standby: this.d.standby(),
    };
    this.win.webContents.send(Channels.evStreamConfig, config);
  }

  // ---------- The encoder ----------

  private async refreshEncoder(): Promise<void> {
    const ffmpeg = findFfmpeg();
    const want = this.d.getSettings().stream.quality.encoder;
    const encoder = ffmpeg
      ? pickEncoder(
          (await probeEncoders(ffmpeg)).filter((e) => !this.brokenEncoders.has(e)),
          want,
        )
      : 'libx264';
    if (this.status.state === 'idle') this.setStatus({ available: !!ffmpeg, encoder });
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
        this.closeWindow();
        this.setStatus({ ...idle(this.status.available, encoder), error: 'noDestinations' });
        return;
      }
    }
    let record: string | null = null;
    if (this.want.record) {
      const folder = recordingsFolder(s.recording.folder);
      await mkdir(folder, { recursive: true });
      record = join(folder, recordingName(this.sessionStart ?? new Date(), this.part));
    }
    const { width, height, fps } = this.size;
    const args = buildArgs({
      width,
      height,
      fps,
      videoKbps: s.quality.videoKbps,
      audioKbps: s.quality.audioKbps,
      encoder,
      streams: urls,
      record,
    });
    this.slaves = [...streamIds, ...(record ? ['record'] : [])];
    this.black = Buffer.alloc(width * height * 4);
    this.audioBytes = 0;
    this.dropped = 0;
    this.lastStderr = [];
    this.stopping = false;
    this.spawnedAt = Date.now();
    this.encodeStart = Date.now();
    const ff = spawn(ffmpeg, args, {
      stdio: ['pipe', 'ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.ff = ff;
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
      destinations: urls.length,
      recording: !!record,
      size: `${width}x${height}@${fps}`,
    });
    this.setStatus({
      state: 'starting',
      streaming: this.want.stream,
      recording: !!record,
      since: this.status.since ?? new Date().toISOString(),
      destinations,
      recordingPath: record,
      encoder,
      error: this.status.error === 'noDestinations' ? 'noDestinations' : null,
    });
    if (this.want.stream && urls.length) this.d.notice({ level: 'info', key: 'streamStarting' });
    this.startPump();
  }

  /** Frames at a steady rate; silence fills any gap in the sound so ffmpeg never waits on it. */
  private startPump(): void {
    if (this.pump) clearInterval(this.pump);
    const { fps } = this.size;
    this.pump = setInterval(() => {
      const ff = this.ff;
      if (!ff?.stdin?.writable) return;
      if (ff.stdin.writableNeedDrain) this.dropped += 1;
      else ff.stdin.write(this.latest ?? this.black ?? Buffer.alloc(0));
      // Sound must keep pace with the clock: top up with silence when the mix falls behind.
      const due = ((Date.now() - this.encodeStart) / 1000) * BYTES_PER_SECOND;
      const behind = due - this.audioBytes;
      if (behind > BYTES_PER_SECOND * 0.2) {
        const bytes = Math.floor(behind / 8) * 8;
        this.writeAudio(Buffer.alloc(bytes));
      }
    }, 1000 / fps);
    if (!this.ticker)
      this.ticker = setInterval(() => {
        const preview = this.latestImage
          ? `data:image/jpeg;base64,${this.latestImage.resize({ width: 320 }).toJPEG(70).toString('base64')}`
          : null;
        this.setStatus({ preview });
      }, 1000);
  }

  private writeAudio(chunk: Buffer): void {
    const out = this.audioOut;
    if (!out?.writable || out.writableNeedDrain) return;
    out.write(chunk);
    this.audioBytes += chunk.length;
  }

  private onLog(line: string): void {
    if (!line.trim()) return;
    const p = parseProgress(line);
    if (p) {
      const destinations = this.status.destinations.map((x) =>
        x.state === 'connecting' && p.time > 1 ? { ...x, state: 'ok' as const } : x,
      );
      const first = this.status.state === 'starting' && p.time > 1;
      this.setStatus({
        state: p.time > 1 ? 'live' : this.status.state,
        fps: p.fps,
        kbps: p.kbps,
        speed: p.speed,
        dropped: this.dropped + p.dropped,
        destinations,
      });
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
      this.setStatus({
        destinations: this.status.destinations.map((x) =>
          x.id === id ? { ...x, state: 'failed' as const } : x,
        ),
        error: 'destinationFailed',
      });
      if (id && id !== 'record')
        this.d.notice({ level: 'warning', key: 'streamDestinationFailed' });
    }
  }

  private onExit(ff: ChildProcess, encoder: string, code: number | null): void {
    if (this.ff !== ff) return;
    this.ff = null;
    this.audioOut = null;
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
    this.setStatus({
      state: 'starting',
      restarts: n + 1,
      error: 'reconnecting',
      destinations: this.status.destinations.map((x) => ({ ...x, state: 'connecting' as const })),
    });
    this.d.notice({ level: 'warning', key: 'streamReconnecting' });
    this.retry = setTimeout(() => {
      this.retry = null;
      if (this.want.stream || this.want.record) {
        if (this.want.record) this.part += 1;
        void this.spawnEncoder();
      }
    }, wait);
  }

  private async stopEncoder(): Promise<void> {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    if (this.pump) clearInterval(this.pump);
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
    if (this.pump) clearInterval(this.pump);
    if (this.ticker) clearInterval(this.ticker);
    this.pump = null;
    this.ticker = null;
    this.closeWindow();
    this.setStatus({ ...idle(this.status.available, this.status.encoder), error });
    this.d.notice({ level: 'error', key: 'streamFailed' });
  }

  private setStatus(patch: Partial<StreamStatus>): void {
    this.status = { ...this.status, ...patch };
    if (this.status.state === 'idle' && this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    this.d.onStatus(this.status);
  }
}

/** Where recordings go: the chosen folder, else Movies (macOS) / Videos (Windows) › Lampstand. */
export function recordingsFolder(chosen: string | null): string {
  return process.env.LAMPSTAND_RECORDINGS ?? chosen ?? join(app.getPath('videos'), 'Lampstand');
}

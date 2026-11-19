import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { BrowserWindow, ipcMain, type IpcMainEvent } from 'electron';
import { resolveStageLayout, streamSize } from '@lampstand/core';
import type {
  LiveState,
  NdiFeed,
  ResolvedKindThemes,
  ScreenVisual,
  Settings,
  Standby,
  Theme,
} from '@lampstand/core';
import { Channels, type NdiStatus, type StreamConfig } from '@lampstand/ipc-contract';
import { isTrustedFrameUrl } from '../ipc/router';
import { rendererUrl } from '../security/protocols';
import { secureWebPreferences } from '../security/hardening';
import type { WindowManager } from '../windows/windowManager';
import { type Logger } from '../types';
import { findNdiRuntime } from './ndiRuntime';
import { streamPictureExtras } from '../stream/streamController';
import type { NdiWorkerIn, NdiWorkerOut } from './ndiWorker';

export interface NdiDeps {
  log: Logger;
  windows: WindowManager;
  getSettings: () => Settings;
  getLiveState: () => LiveState;
  logo: () => ScreenVisual;
  standby: () => Standby;
  wordsTheme: () => Theme | null;
  kindThemes: () => ResolvedKindThemes;
  alternateThemes: () => ResolvedKindThemes;
  onStatus: (s: NdiStatus) => void;
}

interface Feed {
  feed: NdiFeed;
  win: BrowserWindow;
  width: number;
  height: number;
  lastSent: number;
  latest: Buffer | null;
  keepAlive: ReturnType<typeof setInterval>;
}

/** What a feed's window draws. */
/** The words as the theme draws them: full screen, nothing resized or moved. */
const FULL = {
  camera: null,
  layout: 'sideBySide',
  secondCamera: null,
  mirror: 'own',
  words: 'full',
  wordsAuto: false,
  wordsSize: 100,
  wordsAlign: 'theme',
  wordsTheme: null,
} as const;

function pictureOf(feed: NdiFeed, s: Settings): Pick<StreamConfig, 'picture' | 'transparent'> {
  switch (feed.content) {
    case 'program':
      return {
        picture: { ...FULL, background: 'program' },
        transparent: false,
      };
    case 'words':
      return { picture: { ...FULL, background: 'none' }, transparent: true };
    case 'stream':
      return { picture: s.stream.picture, transparent: false };
  }
}

/** A feed is rebuilt (new window, new sender) when any of these change. */
const feedKey = (f: NdiFeed): string => JSON.stringify([f.name, f.height, f.fps, f.content]);

/**
 * NDI output: each enabled feed in Settings › NDI is an offscreen window drawing its picture
 * (the same page as the livestream), whose frames and sound go to an NDI sender. The sending
 * runs in a worker thread with the NDI runtime from NDI Tools (loaded with koffi); without the
 * runtime, NDI is simply off and Settings says how to get it.
 */
export class NdiController {
  private status: NdiStatus = { available: false, version: null, error: null, connections: {} };
  private readonly runtime: string | null;
  private worker: Worker | null = null;
  private ready = false;
  private readonly feeds = new Map<string, Feed>();
  private readonly keys = new Map<string, string>();

  constructor(private readonly d: NdiDeps) {
    this.runtime = findNdiRuntime();
    this.status = {
      ...this.status,
      available: !!this.runtime,
      error: this.runtime ? null : 'noRuntime',
    };
    ipcMain.on(Channels.streamReady, (e) => {
      const f = this.feedOf(e);
      if (!f) return;
      this.sendConfig(f);
      e.sender.send(Channels.evLive, d.getLiveState());
    });
    ipcMain.on(Channels.streamAudio, (e, pcm: unknown) => {
      const f = this.feedOf(e);
      if (!f || !f.feed.sound || !(pcm instanceof Float32Array)) return;
      this.post({ type: 'audio', id: f.feed.id, pcm });
    });
  }

  getStatus(): NdiStatus {
    return this.status;
  }

  private setStatus(patch: Partial<NdiStatus>): void {
    this.status = { ...this.status, ...patch };
    this.d.onStatus(this.status);
  }

  private feedOf(e: IpcMainEvent): Feed | null {
    if (!isTrustedFrameUrl(e.senderFrame?.url)) return null;
    for (const f of this.feeds.values()) if (f.win.webContents.id === e.sender.id) return f;
    return null;
  }

  private post(m: NdiWorkerIn, transfer: ArrayBuffer[] = []): void {
    if (this.ready) this.worker?.postMessage(m, transfer);
  }

  /** Settings changed: open, rebuild or close feeds, and refresh what each draws. */
  settingsChanged(): void {
    const wanted = this.runtime ? this.d.getSettings().ndi.feeds.filter((f) => f.enabled) : [];
    if (wanted.length && !this.worker) this.startWorker();
    for (const [id, f] of this.feeds) {
      const want = wanted.find((w) => w.id === id);
      if (!want || this.keys.get(id) !== feedKey(want)) this.closeFeed(id);
      else {
        f.feed = want;
        this.sendConfig(f);
      }
    }
    if (this.ready) for (const w of wanted) if (!this.feeds.has(w.id)) this.openFeed(w);
    if (!wanted.length && this.worker) this.stopWorker();
  }

  private startWorker(): void {
    if (!this.runtime) return;
    const worker = new Worker(join(__dirname, 'ndiWorker.js'), {
      workerData: { lib: this.runtime },
    });
    worker.on('message', (m: NdiWorkerOut) => {
      if (m.type === 'ready') {
        this.ready = true;
        this.d.log.info('ndi ready', { version: m.version });
        this.setStatus({ version: m.version, error: null });
        this.settingsChanged();
      } else if (m.type === 'failed') {
        this.d.log.warn('ndi failed to load', { message: m.message });
        this.setStatus({ available: false, error: 'loadFailed', version: m.message });
      } else {
        const same = JSON.stringify(m.counts) === JSON.stringify(this.status.connections);
        if (!same) this.setStatus({ connections: m.counts });
      }
    });
    worker.on('error', (err) => {
      this.d.log.warn('ndi worker error', { err: String(err) });
      this.setStatus({ error: 'loadFailed' });
    });
    this.worker = worker;
  }

  private stopWorker(): void {
    void this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.setStatus({ connections: {} });
  }

  private openFeed(feed: NdiFeed): void {
    const height = feed.height;
    const { width } = streamSize(height);
    const transparent = feed.content === 'words';
    const win = new BrowserWindow({
      show: false,
      width,
      height,
      useContentSize: true,
      frame: false,
      transparent,
      paintWhenInitiallyHidden: true,
      backgroundColor: transparent ? '#00000000' : '#000000',
      webPreferences: secureWebPreferences('stream', {
        offscreen: true,
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
      }),
    });
    win.webContents.setFrameRate(feed.fps);
    this.d.windows.attachFollower(win, 'stream');
    const f: Feed = {
      feed,
      win,
      width,
      height,
      lastSent: 0,
      latest: null,
      // A still picture still goes out now and then, so receivers never think it's gone.
      keepAlive: setInterval(() => {
        if (Date.now() - f.lastSent > 900) this.sendFrame(f);
      }, 1000),
    };
    win.webContents.on('paint', (_e, _dirty, image) => {
      const sz = image.getSize();
      const img =
        sz.width === width && sz.height === height ? image : image.resize({ width, height });
      f.latest = img.toBitmap();
      this.sendFrame(f);
    });
    win.webContents.on('render-process-gone', () => {
      this.d.log.warn('ndi feed window crashed; reopening', { feed: feed.name });
      this.closeFeed(feed.id);
      this.settingsChanged();
    });
    this.feeds.set(feed.id, f);
    this.keys.set(feed.id, feedKey(feed));
    this.post({ type: 'open', id: feed.id, name: feed.name });
    void win.loadURL(rendererUrl('stream'));
  }

  private sendFrame(f: Feed): void {
    const buf = f.latest;
    if (!buf) return;
    f.lastSent = Date.now();
    // A copy the worker owns (moved, not copied again, to its thread).
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    this.post(
      { type: 'video', id: f.feed.id, width: f.width, height: f.height, fps: f.feed.fps, data },
      [data],
    );
  }

  private closeFeed(id: string): void {
    const f = this.feeds.get(id);
    if (!f) return;
    clearInterval(f.keepAlive);
    if (!f.win.isDestroyed()) f.win.destroy();
    this.feeds.delete(id);
    this.keys.delete(id);
    this.post({ type: 'close', id });
  }

  private sendConfig(f: Feed): void {
    if (f.win.isDestroyed()) return;
    const config: StreamConfig = {
      width: f.width,
      height: f.height,
      ...pictureOf(f.feed, this.d.getSettings()),
      wordsTheme: f.feed.content === 'stream' ? this.d.wordsTheme() : null,
      kindThemes: f.feed.content === 'stream' ? this.d.kindThemes() : {},
      ...(f.feed.content === 'stream'
        ? streamPictureExtras(this.d.getSettings(), f.height, this.d.alternateThemes())
        : {
            cameraLayer: null,
            secondCameraLayer: null,
            alternateThemes: {},
            stageLayout: resolveStageLayout([], null),
          }),
      meters: false,
      probe: null,
      mix: f.feed.sound,
      logo: this.d.logo(),
      standby: this.d.standby(),
    };
    f.win.webContents.send(Channels.evStreamConfig, config);
  }

  /** Close every feed (the app is quitting). */
  shutdown(): void {
    for (const id of [...this.feeds.keys()]) this.closeFeed(id);
    this.stopWorker();
  }
}

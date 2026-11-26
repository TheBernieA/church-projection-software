import {
  app,
  BrowserWindow,
  powerSaveBlocker,
  screen,
  type Display,
  type WebContents,
} from 'electron';
import type { BlendPart, LiveState, OutputRole, ScreenAdjust, ScreenMask } from '@lampstand/core';
import {
  blendOrder,
  lookLayersFor,
  maskForRole,
  resolveStageLayout,
  screenAdjustFor,
} from '@lampstand/core';
import {
  Channels,
  type DisplayInfo,
  type LiveDelivery,
  type OutputInfo,
} from '@lampstand/ipc-contract';
import { rendererUrl } from '../security/protocols';
import { secureWebPreferences } from '../security/hardening';
import { fingerprint, resolveRoles } from './displays';
import { WebViews } from './webView';
import { type Logger, type OutputWindow, type WindowKind, type WindowManagerDeps } from '../types';

/** Creates/positions windows on displays, handles hot-plug and output crash recovery (§7.3). */
export class WindowManager {
  control: BrowserWindow | null = null;
  /** When each output was last respawned after a crash (the last minute's). */
  private readonly respawns = new Map<string, number[]>();
  private outputs = new Map<string, OutputWindow>();
  private kinds = new Map<number, WindowKind>();
  /** Other windows that follow the live state (the offscreen stream window). */
  private followers = new Set<BrowserWindow>();
  private blockerId: number | null = null;
  private quitting = false;
  private knownDisplayIds = new Set<number>();
  private readonly webViews: WebViews;

  constructor(private readonly d: WindowManagerDeps) {
    this.webViews = new WebViews(d.log.child('web'));
  }

  /** Which window type a WebContents belongs to — used by the IPC router's permission check. */
  kindOf(wc: WebContents): WindowKind | null {
    return this.kinds.get(wc.id) ?? null;
  }

  createControlWindow(): BrowserWindow {
    const primary = screen.getPrimaryDisplay();
    const win = new BrowserWindow({
      width: Math.min(1600, primary.workAreaSize.width),
      height: Math.min(1000, primary.workAreaSize.height),
      minWidth: 1100,
      minHeight: 680,
      show: false,
      title: 'Lampstand',
      backgroundColor: '#171A24',
      webPreferences: secureWebPreferences('control', { spellcheck: true }),
    });
    this.control = win;
    this.kinds.set(win.webContents.id, 'control');
    win.once('ready-to-show', () => win.show());
    win.webContents.on('render-process-gone', (_e, details) => {
      // Outputs live in their own processes and keep showing the last frame.
      this.d.log.error('control renderer gone; reloading', { reason: details.reason });
      if (!win.isDestroyed()) win.reload();
    });
    reloadOnFailedLoad(win, 'control', this.d.log);
    win.on('close', (e) => {
      if (this.quitting) return;
      // Closing the control window quits the app (outputs can't be operated without it).
      e.preventDefault();
      this.quitting = true;
      for (const o of this.outputs.values()) if (!o.win.isDestroyed()) o.win.destroy();
      for (const p of this.panels.values()) if (!p.isDestroyed()) p.destroy();
      win.destroy();
    });
    win.on('closed', () => {
      this.control = null;
      // Offscreen picture windows (the stream, NDI feeds) would keep the app running headless.
      app.quit();
    });
    void win.loadURL(rendererUrl('control'));
    return win;
  }

  start(): void {
    for (const d of screen.getAllDisplays()) this.knownDisplayIds.add(d.id);
    const onChange = (): void => {
      this.reconcile();
      this.d.onDisplaysChanged();
    };
    screen.on('display-added', (_e, d) => {
      const fp = fingerprint(d);
      if (!this.d.getSettings().displays.some((s) => s.fingerprint === fp))
        this.d.onNewDisplay(d.label || 'Display');
      onChange();
    });
    screen.on('display-removed', onChange);
    screen.on('display-metrics-changed', onChange);
    this.reconcile();
  }

  setQuitting(): void {
    this.quitting = true;
  }

  listDisplays(): DisplayInfo[] {
    const displays = screen.getAllDisplays();
    const roles = resolveRoles(displays, this.d.getSettings().displays);
    const controlId =
      this.control && !this.control.isDestroyed()
        ? screen.getDisplayMatching(this.control.getBounds()).id
        : screen.getPrimaryDisplay().id;
    const primaryId = screen.getPrimaryDisplay().id;
    return displays.map((d, i) => ({
      id: String(d.id),
      fingerprint: fingerprint(d),
      label: d.label || `Display ${i + 1}`,
      width: Math.round(d.size.width * d.scaleFactor),
      height: Math.round(d.size.height * d.scaleFactor),
      scaleFactor: d.scaleFactor,
      isPrimary: d.id === primaryId,
      isControl: d.id === controlId,
      x: d.bounds.x,
      role: roles.get(d.id) ?? 'none',
    }));
  }

  findDisplay(id: string): Display | undefined {
    return screen.getAllDisplays().find((d) => String(d.id) === id);
  }

  /** Bring windows in line with display roles + window mode. Called on any change. */
  reconcile(): void {
    const s = this.d.getSettings();
    const desired = new Map<
      string,
      { role: Exclude<OutputRole, 'none'>; display: Display | null }
    >();
    if (s.windowMode) {
      desired.set('window-main', { role: 'main', display: null });
      desired.set('window-stage', { role: 'stage', display: null });
      // Rehearsing edge blending: more windows stand in for the other projectors.
      if (s.edgeBlend.enabled)
        for (let i = 1; i < s.edgeBlend.windows; i++)
          desired.set(`${BLEND_WINDOW}${i}`, { role: 'main', display: null });
    } else {
      const displays = screen.getAllDisplays();
      const roles = resolveRoles(displays, s.displays);
      for (const d of displays) {
        const role = roles.get(d.id);
        if (role && role !== 'none') desired.set(`display-${d.id}`, { role, display: d });
      }
    }
    let changed = false;
    for (const [id, o] of this.outputs) {
      const want = desired.get(id);
      if (!want || want.role !== o.role) {
        this.outputs.delete(id);
        this.kinds.delete(o.win.webContents.id);
        if (!o.win.isDestroyed()) o.win.destroy();
        changed = true;
      } else if (want.display) this.place(o.win, want.display);
    }
    for (const [id, want] of desired)
      if (!this.outputs.has(id)) {
        this.createOutput(id, want.role, want.display);
        changed = true;
      }
    // Outputs that stay learn their new place in an edge blend (a screen joined or left it, or
    // the displays were re-arranged).
    if (changed || s.edgeBlend.enabled) this.refreshOutputInfo();
    this.updatePowerBlocker();
  }

  private place(win: BrowserWindow, d: Display): void {
    const b = d.bounds;
    const cur = win.getBounds();
    if (cur.x === b.x && cur.y === b.y && cur.width === b.width && cur.height === b.height) return;
    if (process.platform === 'darwin') win.setSimpleFullScreen(false);
    win.setBounds(b);
    if (process.platform === 'darwin') win.setSimpleFullScreen(true);
  }

  private createOutput(
    outputId: string,
    role: Exclude<OutputRole, 'none'>,
    display: Display | null,
  ): void {
    const isWindow = display === null;
    const b = display?.bounds;
    const win = new BrowserWindow({
      x: b?.x,
      y: b?.y,
      width: b?.width ?? 960,
      height: b?.height ?? 540,
      frame: isWindow,
      show: false,
      title: role === 'stage' ? 'Lampstand — Stage' : 'Lampstand — Output',
      backgroundColor: '#000000',
      autoHideMenuBar: true,
      skipTaskbar: !isWindow,
      enableLargerThanScreen: true,
      hasShadow: isWindow,
      webPreferences: secureWebPreferences('output', { backgroundThrottling: false }),
    });
    win.setMenu(null);
    if (isWindow) {
      // Rehearsal/window mode: float above the (usually maximised) control window, tucked into
      // the bottom-right corner so it never covers the operator's controls. Edge-blending
      // stand-ins sit in a row to the left of the main one, as the projectors would.
      win.setAlwaysOnTop(true, 'floating');
      const wa = screen.getPrimaryDisplay().workArea;
      const w = 560;
      const h = 315;
      const slot = blendSlot(outputId);
      const offset = role === 'stage' ? h + 24 : 0;
      win.setBounds({
        x: wa.x + wa.width - w - 16 - slot * (w + 8),
        y: wa.y + wa.height - h - 16 - offset,
        width: w,
        height: h,
      });
      win.setAspectRatio(16 / 9);
    }
    const entry: OutputWindow = {
      outputId,
      role,
      displayId: display?.id ?? null,
      win,
      ready: false,
    };
    this.outputs.set(outputId, entry);
    this.kinds.set(win.webContents.id, role === 'stage' ? 'stage' : 'output');
    win.once('ready-to-show', () => {
      if (display) {
        win.setBounds(display.bounds);
        if (process.platform === 'darwin') win.setSimpleFullScreen(true);
        else win.setFullScreen(true);
      }
      win.showInactive();
      this.control?.focus();
    });
    const respawn = (reason: string): void => {
      if (this.quitting || this.outputs.get(outputId) !== entry) return;
      this.d.log.error('output window lost; respawning', { outputId, reason });
      this.outputs.delete(outputId);
      this.kinds.delete(win.webContents.id);
      if (!win.isDestroyed()) win.destroy();
      // Respawn quickly; the new window restores state on its ready handshake (§3.2, budget <1s).
      // One that keeps failing (a GPU or driver fault) waits longer each time, up to 10 s,
      // instead of spinning up and crashing in a tight loop.
      const now = Date.now();
      const recent = (this.respawns.get(outputId) ?? []).filter((t) => now - t < 60_000);
      recent.push(now);
      this.respawns.set(outputId, recent);
      setTimeout(() => this.reconcile(), Math.min(100 * 2 ** (recent.length - 1), 10_000));
    };
    win.webContents.on('render-process-gone', (_e, d) => respawn(d.reason));
    reloadOnFailedLoad(win, outputId, this.d.log);
    win.on('unresponsive', () => respawn('unresponsive'));
    const contentsId = win.webContents.id;
    win.on('closed', () => {
      this.kinds.delete(contentsId);
      if (this.outputs.get(outputId) === entry) {
        this.outputs.delete(outputId);
        this.updatePowerBlocker();
        // A blended screen closed: the others close up the picture.
        if (this.d.getSettings().edgeBlend.enabled) this.refreshOutputInfo();
      }
    });
    void win.loadURL(
      rendererUrl(role === 'stage' ? 'stage' : 'output', `id=${encodeURIComponent(outputId)}`),
    );
  }

  /**
   * Camera and microphone (video and audio inputs): only Lampstand's own control and output
   * windows, never the stage display or a web page (those have their own deny-all session).
   */
  mayUseMedia(wc: WebContents | null): boolean {
    const kind = wc ? this.kinds.get(wc.id) : undefined;
    return kind === 'control' || kind === 'output' || kind === 'stream';
  }

  /** A window that isn't an output but follows the live state (the stream window). */
  attachFollower(win: BrowserWindow, kind: WindowKind): void {
    const id = win.webContents.id;
    this.kinds.set(id, kind);
    this.followers.add(win);
    win.on('closed', () => {
      this.kinds.delete(id);
      this.followers.delete(win);
    });
  }

  /** Output handshake: send its info and the current state. */
  outputReady(wc: WebContents): void {
    for (const o of this.outputs.values()) {
      if (o.win.webContents.id !== wc.id) continue;
      o.ready = true;
      wc.send(Channels.evOutputInfo, this.outputInfo(o));
      wc.send(Channels.evLive, this.d.getLiveState());
      this.syncWeb(this.d.getLiveState()); // a page already on screen covers new outputs too
    }
  }

  /**
   * Edge blending: the audience outputs taking part, each with its place in the wide picture
   * (left to right as ordered in Settings › Screens, else as the displays are arranged).
   */
  private blendParts(): Map<string, BlendPart> {
    const s = this.d.getSettings();
    const parts = new Map<string, BlendPart>();
    if (!s.edgeBlend.enabled) return parts;
    const displays = screen.getAllDisplays();
    const mains = [...this.outputs.values()]
      .filter((o) => o.role === 'main')
      .map((o) => {
        const d = displays.find((x) => x.id === o.displayId);
        // Rehearsal windows stand in a row with the main one on the right (stand-ins to its left).
        return d
          ? { o, fingerprint: fingerprint(d), x: d.bounds.x }
          : { o, fingerprint: o.outputId, x: -blendSlot(o.outputId) };
      });
    const ordered = blendOrder(mains, s.edgeBlend.order).map((m) => m.o);
    if (ordered.length < 2) return parts;
    ordered.forEach((o, index) =>
      parts.set(o.outputId, {
        index,
        count: ordered.length,
        overlap: s.edgeBlend.overlap / 100,
        gamma: s.edgeBlend.gamma,
      }),
    );
    return parts;
  }

  /** A screen's fitting and colour (by its display, or the rehearsal window's id). */
  private adjustFor(o: OutputWindow, d: Display | undefined): ScreenAdjust | null {
    return (
      screenAdjustFor(this.d.getSettings().screenAdjust, d ? fingerprint(d) : o.outputId)?.adjust ??
      null
    );
  }

  private outputInfo(o: OutputWindow): OutputInfo {
    const d =
      o.displayId !== null ? screen.getAllDisplays().find((x) => x.id === o.displayId) : undefined;
    const blend = this.blendParts().get(o.outputId) ?? null;
    return {
      outputId: o.outputId,
      role: o.role,
      label: d?.label || (o.role === 'stage' ? 'Stage window' : 'Output window'),
      width: d ? Math.round(d.size.width * d.scaleFactor) : 1920,
      height: d ? Math.round(d.size.height * d.scaleFactor) : 1080,
      // One window plays the room's sound (the left-most projector when blending).
      audio: o.role === 'main' && (blend?.index ?? 0) === 0,
      adjust: this.adjustFor(o, d),
      blend,
      audioSink: this.d.getSettings().audio.roomOutput,
      logo: this.d.logo(),
      standby: this.d.standby(),
      mask: this.maskFor(o.role),
      // The alternate (secondary) output: its own themes, and the key feed for a video mixer.
      themes: o.role === 'secondary' ? this.d.alternateThemes() : {},
      key: o.role === 'secondary' ? this.d.getSettings().keyFeed.mode : 'off',
      // Words on the screens (size, alignment): the audience screens; the stage display keeps
      // its own.
      words:
        o.role === 'main' || o.role === 'secondary'
          ? { scale: this.d.getSettings().wordsScale, align: this.d.getSettings().wordsAlign }
          : { scale: 1, align: 'theme' },
      stageLayout: resolveStageLayout(
        this.d.getSettings().stageLayouts,
        this.d.getSettings().stageLayoutId,
      ),
    };
  }

  /** The screen mask for an output's role (the stage display is never masked). */
  private maskFor(role: OutputWindow['role']): ScreenMask | null {
    return maskForRole(this.d.getSettings(), role);
  }

  /** Re-send output info (e.g. the logo or off-air screen changed) to every ready output. */
  refreshOutputInfo(): void {
    for (const o of this.outputs.values())
      if (o.ready && !o.win.isDestroyed())
        o.win.webContents.send(Channels.evOutputInfo, this.outputInfo(o));
  }

  broadcastLive(state: LiveState, only: 'sound' | 'views' | null = null): void {
    const delivery: LiveDelivery =
      only === 'sound'
        ? { ...state, soundOnly: true }
        : only === 'views'
          ? { ...state, viewsOnly: true }
          : state;
    const soundOnly = only !== null;
    for (const o of this.outputs.values())
      if (o.ready && !o.win.isDestroyed()) o.win.webContents.send(Channels.evLive, delivery);
    this.sendToControl(Channels.evLive, delivery);
    for (const f of this.followers)
      if (!f.isDestroyed()) f.webContents.send(Channels.evLive, delivery);
    if (!soundOnly) this.syncWeb(state);
  }

  /** A live web page goes over the audience outputs (never the stage); masks take it down. */
  private syncWeb(state: LiveState): void {
    const p = state.program;
    const url = p.web && !p.masks.black && !p.masks.logo ? p.web.url : null;
    // A Look can leave the slide (and so the page) off a kind of screen.
    const shows = (role: OutputWindow['role']): boolean =>
      lookLayersFor(state.look, role)?.includes('content') ?? true;
    const targets = [...this.outputs.values()]
      .filter((o) => o.role !== 'stage' && shows(o.role))
      .map((o) => ({ win: o.win, audio: o.role === 'main' }));
    this.webViews.sync(targets, url);
  }

  /** To the control window, and the panel windows (Live console, multi-view) that are open. */
  sendToControl(channel: string, payload?: unknown): void {
    for (const w of [this.control, ...this.panels.values()])
      if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  }

  // ---------- Panels: parts of the control window in windows of their own ----------

  /** The Live console and the operator multi-view, when open in their own windows. */
  private panels = new Map<PanelKind, BrowserWindow>();

  /**
   * Open (or bring forward) a panel window, where it was last (it can live on another display).
   * It loads the control page with `?view=<kind>`, and follows the live state like the control
   * window does.
   */
  private openPanel(
    kind: PanelKind,
    bounds: Partial<Electron.Rectangle> | null,
    look: { title: string; width: number; height: number; minWidth: number; minHeight: number },
    on: { moved?: (b: Electron.Rectangle) => void; closed?: () => void } = {},
  ): void {
    const open = this.panels.get(kind);
    if (open && !open.isDestroyed()) {
      open.show();
      open.focus();
      return;
    }
    const { x, y } = bounds ?? {};
    const onScreen =
      x !== undefined &&
      y !== undefined &&
      screen.getAllDisplays().some((d) => {
        const a = d.workArea;
        return x >= a.x - 20 && y >= a.y - 20 && x < a.x + a.width && y < a.y + a.height;
      });
    const win = new BrowserWindow({
      width: bounds?.width ?? look.width,
      height: bounds?.height ?? look.height,
      ...(onScreen ? { x, y } : {}),
      minWidth: look.minWidth,
      minHeight: look.minHeight,
      show: false,
      title: look.title,
      backgroundColor: '#171A24',
      webPreferences: secureWebPreferences('control'),
    });
    this.panels.set(kind, win);
    const id = win.webContents.id;
    this.kinds.set(id, 'control');
    win.once('ready-to-show', () => win.show());
    reloadOnFailedLoad(win, kind, this.d.log);
    const save = (): void => {
      if (!win.isDestroyed()) on.moved?.(win.getBounds());
    };
    win.on('moved', save);
    win.on('resized', save);
    win.on('closed', () => {
      this.kinds.delete(id);
      if (this.panels.get(kind) === win) this.panels.delete(kind);
      on.closed?.();
    });
    void win.loadURL(rendererUrl('control', `view=${kind}`));
  }

  private closePanel(kind: PanelKind): void {
    this.panels.get(kind)?.close();
  }

  /**
   * The operator multi-view: every screen, the stream and each camera at once, in a window that
   * can go on its own monitor; `false` closes it.
   */
  openMultiview(open: boolean): void {
    if (!open) return this.closePanel('multiview');
    this.openPanel('multiview', null, {
      title: 'Lampstand Multi-view',
      width: 1280,
      height: 760,
      minWidth: 640,
      minHeight: 400,
    });
  }

  /**
   * Open (or bring forward) the Live console in its own window, where it was last (it can live
   * on another display); `false` closes it, docking the console back in the main window.
   */
  openLiveConsole(open: boolean, bounds: Partial<Electron.Rectangle> | null): void {
    if (!open) return this.closePanel('live');
    this.openPanel(
      'live',
      bounds,
      { title: 'Lampstand Live', width: 520, height: 860, minWidth: 380, minHeight: 520 },
      { moved: (b) => this.d.onLiveConsoleBounds(b), closed: () => this.d.onLiveConsoleClosed() },
    );
  }

  /** Keep displays awake while outputs are active (§18). */
  private updatePowerBlocker(): void {
    const active = this.outputs.size > 0;
    if (active && this.blockerId === null)
      this.blockerId = powerSaveBlocker.start('prevent-display-sleep');
    if (!active && this.blockerId !== null) {
      powerSaveBlocker.stop(this.blockerId);
      this.blockerId = null;
    }
  }
}

/** Parts of the control window that can open in windows of their own. */
type PanelKind = 'live' | 'multiview';

/** Edge-blending rehearsal windows' ids: `window-blend-1`, `window-blend-2`… */
const BLEND_WINDOW = 'window-blend-';

/** A rehearsal window's place in the row (0: the main one; stand-ins count from 1). */
function blendSlot(outputId: string): number {
  return outputId.startsWith(BLEND_WINDOW) ? Number(outputId.slice(BLEND_WINDOW.length)) : 0;
}

/**
 * If a window's page fails to load (rare, e.g. a transient protocol error at startup), log it and
 * retry with backoff instead of leaving an empty window. Navigation cancellations (-3) are ignored.
 */
function reloadOnFailedLoad(win: BrowserWindow, label: string, log: Logger): void {
  let attempts = 0;
  win.webContents.on('did-fail-load', (_e, code, description, _url, isMainFrame) => {
    if (!isMainFrame || code === -3 || win.isDestroyed()) return;
    attempts += 1;
    log.error('window failed to load; retrying', { window: label, code, description, attempts });
    if (attempts > 5) return;
    setTimeout(() => {
      if (!win.isDestroyed()) win.webContents.reload();
    }, 300 * attempts);
  });
  win.webContents.on('did-finish-load', () => {
    attempts = 0;
  });
}

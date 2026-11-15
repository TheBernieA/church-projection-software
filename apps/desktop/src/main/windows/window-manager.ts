import { BrowserWindow, powerSaveBlocker, screen, type Display, type WebContents } from 'electron';
import type { LiveState, OutputRole, ScreenVisual, Settings, Standby } from '@lampstand/core';
import { Channels, type DisplayInfo, type OutputInfo } from '@lampstand/ipc-contract';
import type { Logger } from '../app/logger';
import { rendererUrl } from '../security/protocols';
import { secureWebPreferences, type WindowKind } from '../security/hardening';
import { fingerprint, resolveRoles } from './displays';
import { WebViews } from './web-view';

interface OutputWindow {
  outputId: string;
  role: Exclude<OutputRole, 'none'>;
  displayId: number | null; // null = window mode
  win: BrowserWindow;
  ready: boolean;
}

export interface WindowManagerDeps {
  log: Logger;
  getSettings: () => Settings;
  getLiveState: () => LiveState;
  logo: () => ScreenVisual;
  standby: () => Standby;
  onDisplaysChanged: () => void;
  onNewDisplay: (label: string) => void;
}

/** Creates/positions windows on displays, handles hot-plug and output crash recovery (§7.3). */
export class WindowManager {
  control: BrowserWindow | null = null;
  private outputs = new Map<string, OutputWindow>();
  private kinds = new Map<number, WindowKind>();
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
      win.destroy();
    });
    win.on('closed', () => {
      this.control = null;
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
    } else {
      const displays = screen.getAllDisplays();
      const roles = resolveRoles(displays, s.displays);
      for (const d of displays) {
        const role = roles.get(d.id);
        if (role && role !== 'none') desired.set(`display-${d.id}`, { role, display: d });
      }
    }
    for (const [id, o] of this.outputs) {
      const want = desired.get(id);
      if (!want || want.role !== o.role) {
        this.outputs.delete(id);
        this.kinds.delete(o.win.webContents.id);
        if (!o.win.isDestroyed()) o.win.destroy();
      } else if (want.display) this.place(o.win, want.display);
    }
    for (const [id, want] of desired)
      if (!this.outputs.has(id)) this.createOutput(id, want.role, want.display);
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
      // the bottom-right corner so it never covers the operator's controls.
      win.setAlwaysOnTop(true, 'floating');
      const wa = screen.getPrimaryDisplay().workArea;
      const w = 560;
      const h = 315;
      const offset = role === 'stage' ? h + 24 : 0;
      win.setBounds({
        x: wa.x + wa.width - w - 16,
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
      setTimeout(() => this.reconcile(), 100);
    };
    win.webContents.on('render-process-gone', (_e, d) => respawn(d.reason));
    reloadOnFailedLoad(win, outputId, this.d.log);
    win.on('unresponsive', () => respawn('unresponsive'));
    win.on('closed', () => {
      if (this.outputs.get(outputId) === entry) {
        this.outputs.delete(outputId);
        this.updatePowerBlocker();
      }
    });
    void win.loadURL(
      rendererUrl(role === 'stage' ? 'stage' : 'output', `id=${encodeURIComponent(outputId)}`),
    );
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

  private outputInfo(o: OutputWindow): OutputInfo {
    const d =
      o.displayId !== null ? screen.getAllDisplays().find((x) => x.id === o.displayId) : undefined;
    return {
      outputId: o.outputId,
      role: o.role,
      label: d?.label || (o.role === 'stage' ? 'Stage window' : 'Output window'),
      width: d ? Math.round(d.size.width * d.scaleFactor) : 1920,
      height: d ? Math.round(d.size.height * d.scaleFactor) : 1080,
      audio: o.role === 'main',
      logo: this.d.logo(),
      standby: this.d.standby(),
    };
  }

  /** Re-send output info (e.g. the logo or off-air screen changed) to every ready output. */
  refreshOutputInfo(): void {
    for (const o of this.outputs.values())
      if (o.ready && !o.win.isDestroyed())
        o.win.webContents.send(Channels.evOutputInfo, this.outputInfo(o));
  }

  broadcastLive(state: LiveState): void {
    for (const o of this.outputs.values())
      if (o.ready && !o.win.isDestroyed()) o.win.webContents.send(Channels.evLive, state);
    this.control?.webContents.send(Channels.evLive, state);
    this.syncWeb(state);
  }

  /** A live web page goes over the audience outputs (never the stage); masks take it down. */
  private syncWeb(state: LiveState): void {
    const p = state.program;
    const url = p.web && !p.masks.black && !p.masks.logo ? p.web.url : null;
    const targets = [...this.outputs.values()]
      .filter((o) => o.role !== 'stage')
      .map((o) => ({ win: o.win, audio: o.role === 'main' }));
    this.webViews.sync(targets, url);
  }

  /** How many output windows are showing a web page right now. */
  webViewCount(): number {
    return this.webViews.count();
  }

  sendToControl(channel: string, payload?: unknown): void {
    if (this.control && !this.control.isDestroyed())
      this.control.webContents.send(channel, payload);
  }

  outputIds(): string[] {
    return [...this.outputs.keys()];
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

  destroyAll(): void {
    this.quitting = true;
    for (const o of this.outputs.values()) if (!o.win.isDestroyed()) o.win.destroy();
    this.outputs.clear();
  }
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

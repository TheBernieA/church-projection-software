import { session, WebContentsView, type BrowserWindow, type WebPreferences } from 'electron';
import { isSafeExternalUrl } from '../security/hardening';
import { type Logger, type WebTarget } from '../types';
import { WEB_PARTITION } from '../constants';

/**
 * How a web page is allowed to run: sandboxed, isolated, no preload (so no access to the app or
 * its IPC), no Node, no plugins, no devtools, its own throwaway session.
 */
export function webViewPreferences(): WebPreferences {
  return {
    partition: WEB_PARTITION,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    webviewTag: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    navigateOnDragDrop: false,
    spellcheck: false,
    devTools: false,
    backgroundThrottling: false,
  };
}

let sessionHardened = false;
/** The web session may not ask for anything: no camera, mic, location, notifications, downloads. */
function hardenSession(): void {
  if (sessionHardened) return;
  const ses = session.fromPartition(WEB_PARTITION);
  ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  ses.setDevicePermissionHandler(() => false);
  ses.on('will-download', (e) => e.preventDefault());
  sessionHardened = true;
}

interface Shown {
  view: WebContentsView;
  url: string;
  fit: () => void;
  closed: () => void;
}

/**
 * Web pages on the audience outputs: a separate `WebContentsView` laid over each output window,
 * sized to it. The output's own renderer never loads outside content. Views are removed as soon
 * as the page leaves the screen, or while Black screen / Logo cover it.
 */
export class WebViews {
  private shown = new Map<BrowserWindow, Shown>();

  constructor(private readonly log: Logger) {}

  /** Show `url` over every target window, or take the pages down when `url` is null. */
  sync(targets: WebTarget[], url: string | null): void {
    const keep = new Set<BrowserWindow>();
    if (url && isSafeExternalUrl(url))
      for (const t of targets) {
        if (t.win.isDestroyed()) continue;
        keep.add(t.win);
        this.show(t, url);
      }
    for (const [win, s] of this.shown) if (!keep.has(win)) this.remove(win, s);
  }

  private show(t: WebTarget, url: string): void {
    let s = this.shown.get(t.win);
    if (!s) {
      hardenSession();
      const view = new WebContentsView({ webPreferences: webViewPreferences() });
      const wc = view.webContents;
      // Pop-ups never open (not even in the OS browser); redirects must stay on https.
      wc.setWindowOpenHandler(() => ({ action: 'deny' }));
      wc.on('will-redirect', (e, next) => {
        if (!isSafeExternalUrl(next)) e.preventDefault();
      });
      wc.setAudioMuted(!t.audio);
      view.setBackgroundColor('#000000');
      t.win.contentView.addChildView(view);
      const fit = (): void => {
        if (t.win.isDestroyed()) return;
        const [width = 0, height = 0] = t.win.getContentSize();
        view.setBounds({ x: 0, y: 0, width, height });
      };
      fit();
      t.win.on('resize', fit);
      const closed = (): void => {
        this.shown.delete(t.win);
        if (!wc.isDestroyed()) wc.close();
      };
      t.win.once('closed', closed);
      s = { view, url: '', fit, closed };
      this.shown.set(t.win, s);
    }
    if (s.url !== url) {
      s.url = url;
      s.view.webContents.loadURL(url).catch(() => this.log.warn('web page failed to load'));
    }
  }

  private remove(win: BrowserWindow, s: Shown): void {
    this.shown.delete(win);
    if (!win.isDestroyed()) {
      win.removeListener('resize', s.fit);
      win.removeListener('closed', s.closed);
      win.contentView.removeChildView(s.view);
    }
    if (!s.view.webContents.isDestroyed()) s.view.webContents.close();
  }
}

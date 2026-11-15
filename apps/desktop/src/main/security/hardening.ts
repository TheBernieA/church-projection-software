import {
  app,
  session,
  shell,
  type BrowserWindow,
  type WebContents,
  type WebPreferences,
} from 'electron';
import { join } from 'node:path';
import { devCsp } from './csp';
import { type Logger } from '../types';

/** Hardened webPreferences applied to EVERY window (§17.1). */
export function secureWebPreferences(
  preload: 'control' | 'output',
  extra: Partial<WebPreferences> = {},
): WebPreferences {
  return {
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    spellcheck: false,
    webviewTag: false,
    navigateOnDragDrop: false,
    preload: join(__dirname, `../preload/${preload}.js`),
    ...extra,
  };
}

/** Only https links may be opened externally, and only via the OS browser. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}

export function lockDownWebContents(wc: WebContents, log: Logger): void {
  wc.on('will-navigate', (e, url) => {
    const allowedDev = process.env.ELECTRON_RENDERER_URL;
    if (allowedDev && url.startsWith(allowedDev)) return; // Vite HMR full reloads in dev
    e.preventDefault();
    log.warn('blocked navigation');
  });
  wc.on('will-attach-webview', (e) => e.preventDefault());
  wc.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
}

/**
 * Permission policy: camera/mic only for the control window, and only once a feature that needs
 * it is enabled (Phase 2/3). Everything else is denied.
 */
export function installPermissionHandlers(
  isMediaAllowed: (wc: WebContents | null) => boolean,
): void {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, cb) => {
    cb(permission === 'media' && isMediaAllowed(wc));
  });
  ses.setPermissionCheckHandler((wc, permission) => permission === 'media' && isMediaAllowed(wc));
  ses.setDevicePermissionHandler(() => false);
}

/** In dev the renderer comes from the Vite server, so attach the (relaxed) dev CSP as a header (ADR 0003). */
export function installDevCsp(): void {
  const dev = process.env.ELECTRON_RENDERER_URL;
  if (!dev) return;
  const policy = devCsp(new URL(dev).origin);
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: [`${new URL(dev).origin}/*`] },
    (details, cb) => {
      cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [policy] } });
    },
  );
}

export function installGlobalGuards(log: Logger): void {
  app.on('web-contents-created', (_e, wc) => lockDownWebContents(wc, log));
}

export type { BrowserWindow };

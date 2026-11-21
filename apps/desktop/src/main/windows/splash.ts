import { app, BrowserWindow } from 'electron';
import { secureWebPreferences } from '../security/hardening';

const BACKGROUND = '#171A24';

/**
 * The splash's page: the mark, the name and a gentle "starting" bar. Plain HTML and CSS (no
 * script, no preload), loaded from a data: URL so it shows before anything else is ready.
 */
export function splashHtml(version: string): string {
  const v = version.replace(/[^\w.+-]/g, '');
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Lampstand</title>
<style>
  html,body{margin:0;height:100%;background:${BACKGROUND};color:#E8E6E1;overflow:hidden;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
    -webkit-user-select:none;user-select:none;cursor:default}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
    -webkit-app-region:drag;border-radius:12px;
    background:radial-gradient(circle at 50% 38%,rgba(240,167,58,.16),transparent 58%),${BACKGROUND}}
  svg{width:64px;height:64px;filter:drop-shadow(0 0 18px rgba(240,167,58,.45))}
  .flame{transform-origin:32px 22px;animation:flicker 2.4s ease-in-out infinite}
  h1{margin:0;font-size:26px;font-weight:600;letter-spacing:.02em}
  .bar{width:140px;height:3px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden}
  .bar i{display:block;width:40%;height:100%;border-radius:2px;background:#F0A73A;
    animation:slide 1.4s ease-in-out infinite}
  .ver{position:absolute;bottom:12px;font-size:11px;color:rgba(232,230,225,.4)}
  @keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
  @keyframes flicker{0%,100%{transform:scale(1)}50%{transform:scale(1.06,.96)}}
  @media (prefers-reduced-motion:reduce){.bar i,.flame{animation:none}}
</style></head>
<body>
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <path class="flame" fill="#F0A73A" d="M32 6c5 7 9 11 9 17a9 9 0 0 1-18 0c0-6 4-10 9-17z"/>
    <path fill="#FBD38D" d="M32 16c2.5 3.5 4 5.5 4 8a4 4 0 0 1-8 0c0-2.5 1.5-4.5 4-8z"/>
    <rect x="29" y="33" width="6" height="18" rx="1.5" fill="#C9C4B8"/>
    <rect x="20" y="31" width="24" height="4" rx="2" fill="#E8E6E1"/>
    <path fill="#E8E6E1" d="M18 58c0-4 6-7 14-7s14 3 14 7z"/>
  </svg>
  <h1>Lampstand</h1>
  <div class="bar"><i></i></div>
  ${v ? `<div class="ver">Version ${v}</div>` : ''}
</body></html>`;
}

/**
 * A small window shown while the app starts (settings, library, Bibles and hymnals load before
 * the main window can open). It closes once the main window is on screen.
 */
export function showSplash(): { closeWhenShown: (main: BrowserWindow) => void; close: () => void } {
  const win = new BrowserWindow({
    width: 380,
    height: 260,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    center: true,
    title: 'Lampstand',
    backgroundColor: BACKGROUND,
    roundedCorners: true,
    webPreferences: secureWebPreferences(null, { javascript: false }),
  });
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });
  void win
    .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml(app.getVersion()))}`)
    .catch(() => undefined);

  const close = (): void => {
    if (!win.isDestroyed()) win.destroy();
  };
  return {
    close,
    // Closed only after the main window shows: with no window open, the app would quit.
    closeWhenShown: (main) => {
      if (main.isVisible()) return close();
      main.once('show', close);
      main.once('closed', close);
    },
  };
}

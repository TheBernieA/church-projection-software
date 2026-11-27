import { app, BrowserWindow, screen } from 'electron';
import { secureWebPreferences } from '../security/hardening';

/** The splash's size, and the app's own background (no flash between them). */
const WIDTH = 480;
const HEIGHT = 300;
const BACKGROUND = '#0D0F15';

/** Lampstand's app icon (build/icon.svg), cropped to its tile. */
const ICON = `<svg viewBox="100 100 824 824" aria-hidden="true">
  <rect x="100" y="100" width="824" height="824" rx="186" fill="#161922"/>
  <rect x="100.5" y="100.5" width="823" height="823" rx="185.5" fill="none" stroke="#FFFFFF" stroke-opacity="0.08"/>
  <path d="M512 248 C 574 318 594 372 594 414 A 82 82 0 0 1 430 414 C 430 372 450 318 512 248 Z" fill="#F0A73A"/>
  <path d="M372 522 H 652 A 140 92 0 0 1 372 522 Z" fill="#F4F1EA"/>
  <rect x="494" y="600" width="36" height="146" fill="#F4F1EA"/>
  <rect x="412" y="738" width="200" height="40" rx="20" fill="#F4F1EA"/>
</svg>`;

/**
 * The splash's page: the app icon, the name and what it is, exactly in the middle; "Starting"
 * and the version along the bottom, over a quiet progress line. Flat colours, no glow, glass or
 * gradients. Plain HTML and CSS (no script, no preload), loaded from a data: URL so it shows
 * before anything else is ready.
 */
export function splashHtml(version: string): string {
  const v = version.replace(/[^\w.+-]/g, '');
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Lampstand</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;overflow:hidden;background:${BACKGROUND};color:#F4F1EA;
    font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI Variable Display','Segoe UI',system-ui,sans-serif;
    -webkit-font-smoothing:antialiased;-webkit-user-select:none;user-select:none;cursor:default}
  body{-webkit-app-region:drag;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
  /* Centred on the window itself: nothing else (the footer, the line) takes part in the layout. */
  main{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
    animation:in .32s ease-out both}
  svg{display:block;width:72px;height:72px}
  h1{margin:20px 0 0;font-size:24px;line-height:1;font-weight:600;letter-spacing:-.015em}
  p{margin:8px 0 0;font-size:12.5px;color:rgba(244,241,234,.5)}
  footer{position:fixed;left:20px;right:20px;bottom:16px;display:flex;justify-content:space-between;
    font-size:11px;color:rgba(244,241,234,.34);font-variant-numeric:tabular-nums}
  .bar{position:fixed;left:0;right:0;bottom:0;height:2px;overflow:hidden}
  .bar i{position:absolute;top:0;bottom:0;width:28%;background:#F0A73A;
    animation:slide 1.6s cubic-bezier(.45,0,.25,1) infinite}
  @keyframes in{from{opacity:0}to{opacity:1}}
  @keyframes slide{from{transform:translateX(-100%)}to{transform:translateX(360%)}}
  @media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style></head>
<body>
  <main>${ICON}<h1>Lampstand</h1><p>Worship presentation</p></main>
  <footer><span>Starting…</span><span>${v ? `Version ${v}` : ''}</span></footer>
  <div class="bar"><i></i></div>
</body></html>`;
}

/**
 * Where the splash goes: the middle of the screen the pointer is on (where the person is
 * looking), placed explicitly rather than with `center: true`, which leaves the screen and the
 * spot to the system.
 */
function middleOfActiveScreen(): { x: number; y: number } {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  return {
    x: Math.round(area.x + (area.width - WIDTH) / 2),
    y: Math.round(area.y + (area.height - HEIGHT) / 2),
  };
}

/**
 * A small window shown while the app starts (settings, library, Bibles and hymnals load before
 * the main window can open). It closes once the main window is on screen.
 */
export function showSplash(): { closeWhenShown: (main: BrowserWindow) => void; close: () => void } {
  const win = new BrowserWindow({
    ...middleOfActiveScreen(),
    width: WIDTH,
    height: HEIGHT,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
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

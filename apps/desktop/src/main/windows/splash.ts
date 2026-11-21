import { app, BrowserWindow } from 'electron';
import { secureWebPreferences } from '../security/hardening';

const BACKGROUND = '#0D0F15';

/**
 * The splash's page: the mark on a glass tile, the name, and a hairline "starting" glint.
 * Plain HTML and CSS (no script, no preload), loaded from a data: URL so it shows before
 * anything else is ready.
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
  body{position:relative;-webkit-app-region:drag;
    background:
      radial-gradient(120% 80% at 50% -10%,rgba(240,167,58,.20),transparent 55%),
      radial-gradient(60% 60% at 85% 110%,rgba(120,90,220,.12),transparent 60%),
      radial-gradient(50% 50% at 10% 100%,rgba(240,120,58,.08),transparent 60%),
      ${BACKGROUND}}
  /* A hairline edge, lit from above. */
  body::before{content:'';position:absolute;inset:0;pointer-events:none;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.08),inset 0 0 0 1px rgba(255,255,255,.04)}
  /* A slow breathing glow behind the mark. */
  .halo{position:absolute;left:50%;top:40%;width:260px;height:260px;margin:-130px 0 0 -130px;
    border-radius:50%;background:radial-gradient(circle,rgba(240,167,58,.28),transparent 62%);
    filter:blur(10px);animation:breathe 4s ease-in-out infinite}
  main{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
    justify-content:center;padding-bottom:18px}
  .tile{position:relative;width:84px;height:84px;border-radius:22px;display:grid;place-items:center;
    background:linear-gradient(160deg,rgba(255,255,255,.10),rgba(255,255,255,.02));
    box-shadow:inset 0 1px 0 rgba(255,255,255,.18),inset 0 0 0 1px rgba(255,255,255,.06),
      0 20px 40px -12px rgba(0,0,0,.7),0 0 40px -8px rgba(240,167,58,.35);
    animation:rise .9s cubic-bezier(.2,.8,.2,1) both}
  svg{width:54px;height:54px;overflow:visible}
  .flame{transform-origin:24px 17px;animation:flicker 3s ease-in-out infinite;
    filter:drop-shadow(0 0 6px rgba(255,190,90,.7))}
  h1{margin:26px 0 0;font-size:30px;font-weight:600;letter-spacing:-.02em;
    background:linear-gradient(180deg,#FFFFFF 20%,#CFC8BA);-webkit-background-clip:text;
    background-clip:text;color:transparent;animation:rise .9s .08s cubic-bezier(.2,.8,.2,1) both}
  .tag{margin-top:8px;font-size:10.5px;font-weight:500;letter-spacing:.32em;text-transform:uppercase;
    color:rgba(244,241,234,.42);animation:rise .9s .16s cubic-bezier(.2,.8,.2,1) both}
  .line{position:relative;margin-top:30px;width:168px;height:1px;overflow:hidden;
    background:rgba(255,255,255,.08);animation:rise .9s .24s cubic-bezier(.2,.8,.2,1) both}
  .line i{position:absolute;inset:0;width:45%;
    background:linear-gradient(90deg,transparent,#F0A73A 45%,#FFE2B0 50%,#F0A73A 55%,transparent);
    box-shadow:0 0 8px rgba(240,167,58,.8);animation:glint 1.8s cubic-bezier(.45,0,.2,1) infinite}
  footer{position:absolute;left:22px;right:22px;bottom:16px;display:flex;justify-content:space-between;
    font-size:10.5px;letter-spacing:.04em;color:rgba(244,241,234,.30);
    font-variant-numeric:tabular-nums;animation:fade 1.2s .4s both}
  @keyframes rise{from{opacity:0;transform:translateY(8px);filter:blur(4px)}to{opacity:1;transform:none;filter:none}}
  @keyframes fade{from{opacity:0}to{opacity:1}}
  @keyframes glint{0%{transform:translateX(-110%)}100%{transform:translateX(230%)}}
  @keyframes breathe{0%,100%{opacity:.7;transform:scale(.94)}50%{opacity:1;transform:scale(1.04)}}
  @keyframes flicker{0%,100%{transform:scale(1) rotate(0)}30%{transform:scale(1.04,.97) rotate(-1deg)}
    60%{transform:scale(.98,1.03) rotate(1deg)}}
  @media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style></head>
<body>
  <div class="halo"></div>
  <main>
    <div class="tile">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <linearGradient id="f" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#FFE6B8"/><stop offset=".55" stop-color="#F6B04A"/>
            <stop offset="1" stop-color="#E07B26"/>
          </linearGradient>
          <linearGradient id="m" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#A9A396"/>
          </linearGradient>
        </defs>
        <path class="flame" fill="url(#f)" d="M24 3.5c4.2 5.4 7 8.6 7 13.2a7 7 0 0 1-14 0c0-4.6 2.8-7.8 7-13.2z"/>
        <path fill="url(#m)" d="M14 25.5h20a1.5 1.5 0 0 1 0 3H26v11.5h5.5a1.5 1.5 0 0 1 0 3h-15a1.5 1.5 0 0 1 0-3H22V28.5h-8a1.5 1.5 0 0 1 0-3z"/>
      </svg>
    </div>
    <h1>Lampstand</h1>
    <div class="tag">Worship presentation</div>
    <div class="line"><i></i></div>
  </main>
  <footer><span>Starting up</span><span>${v ? `v${v}` : ''}</span></footer>
</body></html>`;
}

/**
 * A small window shown while the app starts (settings, library, Bibles and hymnals load before
 * the main window can open). It closes once the main window is on screen.
 */
export function showSplash(): { closeWhenShown: (main: BrowserWindow) => void; close: () => void } {
  const win = new BrowserWindow({
    width: 460,
    height: 300,
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

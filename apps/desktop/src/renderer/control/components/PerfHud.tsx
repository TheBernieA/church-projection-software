import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { q } from '../lib/api';
import { useStore } from '../lib/store';

/** Hidden performance HUD (Ctrl/⌘+Alt+P, §18). */
export function PerfHud() {
  const { t } = useTranslation();
  const open = useStore((s) => s.dialog === 'perf');
  const revision = useStore((s) => s.live?.revision ?? 0);
  const [fps, setFps] = useState(0);
  const [ipc, setIpc] = useState(0);
  useEffect(() => {
    if (!open) return;
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number): void => {
      frames++;
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const timer = setInterval(() => {
      const t0 = performance.now();
      void q('history.state').then(() => setIpc(Math.round((performance.now() - t0) * 10) / 10));
    }, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="tnum fixed right-3 top-12 z-50 rounded bg-black/85 px-3 py-2 font-mono text-ui-11 text-white">
      <div>
        {t('perf.fps')}: {fps}
      </div>
      <div>
        {t('perf.ipc')}: {ipc} ms
      </div>
      <div>
        {t('perf.revision')}: {revision}
      </div>
    </div>
  );
}

import { useEffect } from 'react';
import { LiveConsole } from './components/live/LiveConsole';
import { Toasts } from './components/Toasts';
import { useStore } from './lib/store';

/**
 * The Live console in its own window (`?view=live`): it can sit on another display while the
 * main window runs the service. Only the console: no show shortcuts here (Space never goes live).
 */
export function LiveWindow() {
  const uiTheme = useStore((s) => s.settings?.uiTheme ?? 'dark');
  const textScale = useStore((s) => s.settings?.textScale ?? 1);
  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme;
    document.documentElement.style.setProperty('--text-scale', String(textScale));
    document.title = 'Lampstand Live';
  }, [uiTheme, textScale]);
  return (
    <div className="h-full bg-[var(--surface-1)]">
      <LiveConsole mode="window" />
      <Toasts />
    </div>
  );
}

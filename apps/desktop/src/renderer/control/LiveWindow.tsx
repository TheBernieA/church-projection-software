import { LiveConsole } from './components/live/LiveConsole';
import { Toasts } from './components/Toasts';
import { useUiTheme } from './lib/hooks';
import { ConfirmHost } from './components/ConfirmHost';

/**
 * The Live console in its own window (`?view=live`): it can sit on another display while the
 * main window runs the service. Only the console: no show shortcuts here (Space never goes live).
 */
export function LiveWindow() {
  useUiTheme('Lampstand Live');
  return (
    <div className="h-full bg-[var(--surface-1)]">
      <LiveConsole mode="window" />
      <Toasts />
      <ConfirmHost />
    </div>
  );
}

import { Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cmd } from '../../lib/api';
import { useStore } from '../../lib/store';
import { ToolbarButton } from './ToolbarButton';

/**
 * The toolbar's Live button: opens the Live console beside the output (or brings its own window
 * forward when it's popped out). A pulsing red dot while streaming or recording.
 */
export function LiveButton() {
  const { t } = useTranslation();
  const s = useStore((x) => x.stream);
  const where = useStore((x) => x.liveConsole);
  const live = !!s && s.state !== 'idle';
  const toggle = (): void => {
    if (where === 'window') void cmd('liveConsole.open', { open: true });
    else useStore.setState({ liveConsole: where === 'docked' ? 'closed' : 'docked' });
  };
  return (
    <ToolbarButton
      icon={<Radio size={20} />}
      label={t('toolbar.live')}
      aria-label={
        s?.streaming ? t('live.onAir') : s?.recording ? t('live.recording') : t('live.open')
      }
      pressed={where !== 'closed'}
      onClick={toggle}
      badge={
        live ? (
          <span
            aria-hidden
            className="absolute -right-1.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-[var(--tally-program)] shadow-[0_0_6px_var(--tally-program)] ring-2 ring-[var(--toolbar)]"
          />
        ) : undefined
      }
      className={live ? '!text-[var(--tally-program)]' : ''}
    />
  );
}

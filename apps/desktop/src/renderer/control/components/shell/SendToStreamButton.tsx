import { Radio, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@lampstand/ui';
import { showsScreens, toggleTakeover, useTakeoverOn } from '../../lib/streamTakeover';
import { useStore } from '../../lib/store';

/**
 * On the live monitor while streaming or recording: Send to stream puts what the screens show
 * on the stream (when the stream shows something else, such as a camera); again, puts the
 * stream back as it was. Hidden when the stream already shows the screens.
 */
export function SendToStreamButton() {
  const { t } = useTranslation();
  const out = useStore((s) => !!s.stream && (s.stream.streaming || s.stream.recording));
  const pic = useStore((s) => s.settings?.stream.picture);
  const on = useTakeoverOn();
  if (!out || !pic || (!on && showsScreens(pic))) return null;
  const label = on ? t('monitor.takeoverOn') : t('monitor.takeover');
  return (
    <Button
      size="xs"
      variant="bare"
      aria-pressed={on}
      title={on ? t('monitor.takeoverOnHelp') : t('monitor.takeoverHelp')}
      icon={on ? <Undo2 size={13} /> : <Radio size={13} />}
      onClick={(e) => {
        toggleTakeover();
        e.currentTarget.blur();
      }}
      className={`!absolute left-1.5 top-1.5 inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.4)] outline-none backdrop-blur-sm focus-visible:shadow-[var(--focus-ring)] ${
        on
          ? '!bg-[var(--tally-program)] !text-white'
          : '!bg-black/65 !text-white hover:!bg-black/80'
      }`}
    >
      {label}
    </Button>
  );
}

import { Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@lampstand/ui';
import { setLiveBackgroundSound } from '../../lib/itemBackground';
import { useStore } from '../../lib/store';

/**
 * On the live monitor, while a video plays behind the words: its sound, on or off, one click.
 * (Background videos start silent; the same switch is in the background menu.)
 */
export function BackgroundSoundButton() {
  const { t } = useTranslation();
  const ref = useStore((s) => s.live?.program.background?.ref);
  if (ref?.kind !== 'video') return null;
  const on = !!ref.sound;
  const label = on ? t('itemBg.soundOn') : t('itemBg.soundOff');
  return (
    <IconButton
      size="xs"
      variant="bare"
      aria-label={label}
      aria-pressed={on}
      title={label}
      onClick={() => setLiveBackgroundSound(!on)}
      className={`!absolute bottom-1.5 right-1.5 !rounded-full backdrop-blur-sm ${
        on ? '!bg-[var(--accent)] !text-white' : '!bg-black/60 !text-white/80 hover:!text-white'
      }`}
    >
      {on ? <Volume2 size={14} /> : <VolumeX size={14} />}
    </IconButton>
  );
}

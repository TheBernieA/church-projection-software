import { useCallback } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDb, MAX_DB, MIN_DB } from '@lampstand/core';
import { Button, IconButton, Meter, Slider } from '@lampstand/ui';
import { onMeters, readMeter } from '../../lib/meters';
import { mixerCmd, mixerLive } from '../../lib/mixer';
import { useStore } from '../../lib/store';
import { Section } from './consoleParts';

/** The stream's sound: its meter and level, mute, which channels it hears, and the delay. */
export function SoundPanel() {
  const { t } = useTranslation();
  const mixer = useStore((s) => s.live?.mixer ?? null);
  const read = useCallback(() => readMeter('stream', null), []);
  if (!mixer) return null;
  const bus = mixer.stream;
  return (
    <Section
      title={t('console.sound')}
      action={
        <Button size="2xs" variant="ghost" onClick={() => useStore.setState({ mixerOpen: true })}>
          {t('toolbar.mixer')}
        </Button>
      }
    >
      <div className="flex items-center gap-2">
        <IconButton
          size="xs"
          aria-label={t('mixer.muteOf', { name: t('mixer.bus.stream') })}
          active={bus.mute}
          activeTone="live"
          onClick={() =>
            void mixerCmd({ action: 'bus', bus: 'stream', patch: { mute: !bus.mute } })
          }
        >
          {bus.mute ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </IconButton>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Meter
            read={read}
            subscribe={onMeters}
            label={t('mixer.meterOf', { name: t('mixer.bus.stream') })}
            orientation="horizontal"
            className="w-full"
          />
          <Slider
            aria-label={t('mixer.levelOf', { name: t('mixer.bus.stream') })}
            min={MIN_DB}
            max={MAX_DB}
            step={0.5}
            value={bus.gainDb}
            format={formatDb}
            onChange={(e) =>
              mixerLive({ action: 'bus', bus: 'stream', patch: { gainDb: Number(e.target.value) } })
            }
            className="w-full"
          />
        </div>
      </div>
      <div role="group" aria-label={t('console.channels')} className="flex flex-wrap gap-1.5">
        {mixer.channels.map((c) => (
          <Button
            key={c.id}
            size="2xs"
            variant={c.stream ? 'primary' : 'subtle'}
            aria-pressed={c.stream}
            aria-label={t('mixer.streamOf', { name: c.name })}
            onClick={() =>
              void mixerCmd({ action: 'channel', id: c.id, patch: { stream: !c.stream } })
            }
          >
            {c.name}
          </Button>
        ))}
      </div>
    </Section>
  );
}

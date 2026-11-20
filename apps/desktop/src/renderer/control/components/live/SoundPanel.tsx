import { useCallback, useMemo } from 'react';
import { Mic, Music, Video, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MixerChannel } from '@lampstand/core';
import { Button, IconButton, Meter, Switch, Typography } from '@lampstand/ui';
import { onMeters, readMeter } from '../../lib/meters';
import { mixerCmd } from '../../lib/mixer';
import { useStore } from '../../lib/store';
import { Section } from './consoleParts';

const KIND_ICON = { tracks: Music, video: Video, input: Mic } as const;

/** One channel as the stream hears it: its level in the stream mix, on or off the stream, mute. */
function ChannelRow({ c }: { c: MixerChannel }) {
  const { t } = useTranslation();
  const read = useCallback(() => readMeter('stream', c.id), [c.id]);
  const Icon = KIND_ICON[c.kind];
  const heard = c.stream && !c.mute;
  return (
    <div className="flex items-center gap-2.5">
      <Icon
        size={14}
        className={`shrink-0 ${heard ? 'text-[var(--tally-program)]' : 'text-[var(--text-3)]'}`}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Typography size={12} tone={heard ? 'primary' : 'muted'} truncate>
          {c.name}
        </Typography>
        <Meter
          read={read}
          subscribe={onMeters}
          label={t('mixer.meterOf', { name: c.name })}
          orientation="horizontal"
          className="w-full"
        />
      </div>
      <IconButton
        size="xs"
        aria-label={t('mixer.muteOf', { name: c.name })}
        active={c.mute}
        activeTone="live"
        onClick={() => void mixerCmd({ action: 'channel', id: c.id, patch: { mute: !c.mute } })}
      >
        <VolumeX size={13} />
      </IconButton>
      <Switch
        label={t('mixer.streamOf', { name: c.name })}
        checked={c.stream}
        onChange={(stream) => void mixerCmd({ action: 'channel', id: c.id, patch: { stream } })}
      />
    </div>
  );
}

/**
 * What else the stream hears: the music and video channels, each with its level in the stream mix
 * and a switch to send it or not. (Mics, and the stream's own level, sit under its picture.)
 */
export function SoundPanel() {
  const { t } = useTranslation();
  const all = useStore((s) => s.live?.mixer.channels ?? null);
  // Mics and the desk sit under the stream picture, at hand; here, the music and video.
  const channels = useMemo(() => all?.filter((c) => c.kind !== 'input') ?? null, [all]);
  if (!channels?.length) return null;
  return (
    <Section
      title={t('console.sound')}
      action={
        <Button size="2xs" variant="ghost" onClick={() => useStore.setState({ mixerOpen: true })}>
          {t('toolbar.mixer')}
        </Button>
      }
    >
      <div role="group" aria-label={t('console.channels')} className="flex flex-col gap-2.5">
        {channels.map((c) => (
          <ChannelRow key={c.id} c={c} />
        ))}
      </div>
      <Typography as="p" size={11} tone="muted" leading="snug">
        {t('console.soundHelp')}
      </Typography>
    </Section>
  );
}

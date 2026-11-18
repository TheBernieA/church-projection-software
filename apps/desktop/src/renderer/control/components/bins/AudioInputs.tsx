import { Mic, SlidersVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDb, MAX_DB, MIN_DB } from '@lampstand/core';
import { Button, Slider, Typography } from '@lampstand/ui';
import {
  useDeviceStream,
  useInputDevices,
  useLevelMeter,
  type InputDevice,
} from '../../lib/inputs';
import { mixerCmd, mixerLive } from '../../lib/mixer';
import { useStore } from '../../lib/store';

/** A live level meter for an audio input (green, then amber, then red near the top). */
export function LevelMeter({ device }: { device: InputDevice }) {
  const { t } = useTranslation();
  const { track, bar } = useLevelMeter(useDeviceStream('audioinput', device.deviceId));
  return (
    <div
      ref={track}
      role="meter"
      aria-label={t('inputs.level', { name: device.label })}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text-1)_12%,transparent)]"
    >
      <div
        ref={bar}
        className="h-full rounded-full bg-[linear-gradient(90deg,#3fb950,#3fb950_70%,#e3b341_85%,#f85149)] transition-[width] duration-75"
        style={{ width: '0%' }}
      />
    </div>
  );
}

/** Where an input goes: the room's speakers, the livestream (and recording), or both. */
const ROUTES = ['room', 'stream'] as const;

function InputRow({ device }: { device: InputDevice }) {
  const { t } = useTranslation();
  const channel = useStore(
    (s) => s.live?.mixer.channels.find((c) => c.deviceId === device.deviceId) ?? null,
  );
  const on = (route: (typeof ROUTES)[number]): boolean => !!channel?.[route] && !channel.mute;
  const live = on('room') || on('stream');
  const toggle = (route: (typeof ROUTES)[number]): void => {
    const next = !on(route);
    if (!channel) {
      // Not on the mixer yet: add it, going only where it was asked to.
      if (next)
        void mixerCmd({
          action: 'add',
          deviceId: device.deviceId,
          name: device.label,
          room: route === 'room',
          stream: route === 'stream',
        });
      return;
    }
    void mixerCmd({
      action: 'channel',
      id: channel.id,
      patch: next ? { [route]: true, mute: false } : { [route]: false },
    });
  };
  return (
    <li className="flex flex-col gap-1.5 rounded-[8px] bg-[var(--surface-0)] px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--hairline)]">
      <div className="flex items-center gap-2">
        <Mic size={14} className={live ? 'text-[var(--tally-program)]' : 'text-[var(--text-3)]'} />
        <Typography size={12} weight="medium" truncate className="min-w-0 flex-1">
          {channel?.name ?? device.label}
        </Typography>
        {ROUTES.map((route) => (
          <Button
            key={route}
            size="3xs"
            variant={on(route) ? 'primary' : 'subtle'}
            aria-pressed={on(route)}
            aria-label={t(route === 'room' ? 'inputs.toRoom' : 'inputs.toStream', {
              name: device.label,
            })}
            title={t(route === 'room' ? 'inputs.toRoomHelp' : 'inputs.toStreamHelp')}
            onClick={() => toggle(route)}
          >
            {t(route === 'room' ? 'mixer.roomShort' : 'mixer.streamShort')}
          </Button>
        ))}
      </div>
      <LevelMeter device={device} />
      {channel && live && (
        <Slider
          aria-label={t('inputs.volume', { name: device.label })}
          min={MIN_DB}
          max={MAX_DB}
          step={0.5}
          value={channel.gainDb}
          format={formatDb}
          onChange={(e) =>
            mixerLive({
              action: 'channel',
              id: channel.id,
              patch: { gainDb: Number(e.target.value) },
            })
          }
          className="w-full"
        />
      )}
    </li>
  );
}

/**
 * Audio inputs (Audio tab): microphones and desk feeds, each with a level meter. Send one to
 * the stream, the room, or both; each is a channel on the Mixer (EQ, compressor, routing).
 */
export function AudioInputs() {
  const { t } = useTranslation();
  const devices = useInputDevices('audioinput');
  return (
    <section aria-label={t('inputs.audioTitle')} className="flex flex-col gap-1.5 px-2.5 pb-2.5">
      <div className="flex items-center justify-between px-0.5 pt-1">
        <Typography as="h3" variant="overline">
          {t('inputs.audioTitle')}
        </Typography>
        <Button
          size="2xs"
          variant="ghost"
          icon={<SlidersVertical size={12} />}
          onClick={() => useStore.setState({ mixerOpen: true })}
        >
          {t('toolbar.mixer')}
        </Button>
      </div>
      {devices && devices.length === 0 ? (
        <Typography as="p" variant="caption" leading="snug" className="px-0.5">
          {t('inputs.noMics')}
        </Typography>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {(devices ?? []).map((d) => (
            <InputRow key={d.deviceId} device={d} />
          ))}
        </ul>
      )}
    </section>
  );
}

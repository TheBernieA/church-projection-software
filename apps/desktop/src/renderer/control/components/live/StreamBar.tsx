import { useCallback } from 'react';
import { Volume2, VolumeX, VolumeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDb, MAX_DB, MIN_DB, type StreamSettings } from '@lampstand/core';
import type { StreamStatus } from '@lampstand/ipc-contract';
import { Button, IconButton, Meter, Slider, Typography } from '@lampstand/ui';
import { saveSettings } from '../../lib/actions';
import { useInputDevices } from '../../lib/inputs';
import { onMeters, readSides } from '../../lib/meters';
import { mixerCmd, mixerLive } from '../../lib/mixer';
import { useStore } from '../../lib/store';
import { sceneOf, STREAM_SCENES, type StreamSceneId } from '../../lib/streamOptions';
import { Select } from '../Select';

const CUSTOM = 'custom';

/**
 * The stream's sound, left and right, over the corner of its picture: the operator sees at a
 * glance that the stream has sound (and that it isn't clipping) while watching the picture.
 */
export function StreamMeterOverlay() {
  const { t } = useTranslation();
  const left = useCallback(() => readSides('stream')[0], []);
  const right = useCallback(() => readSides('stream')[1], []);
  return (
    <div
      aria-label={t('console.streamSound')}
      role="group"
      className="pointer-events-none absolute bottom-2 left-2 top-2 flex w-[22px] flex-col gap-1 rounded-[4px] bg-black/55 p-[3px] backdrop-blur-sm"
    >
      <div className="flex min-h-0 flex-1 gap-[3px]">
        <Meter
          read={left}
          subscribe={onMeters}
          label={t('console.meterLeft')}
          className="h-full flex-1"
        />
        <Meter
          read={right}
          subscribe={onMeters}
          label={t('console.meterRight')}
          className="h-full flex-1"
        />
      </div>
      <div aria-hidden className="flex justify-around">
        <Typography size={10} weight="semibold" tone="white" className="opacity-70">
          L
        </Typography>
        <Typography size={10} weight="semibold" tone="white" className="opacity-70">
          R
        </Typography>
      </div>
    </div>
  );
}

/**
 * Under the stream picture: the scene (what the stream shows, one click), and the stream's
 * sound (mute and level). The two things changed most during a service, always in view.
 */
export function StreamBar({ st }: { st: StreamSettings }) {
  const { t } = useTranslation();
  const bus = useStore((s) => s.live?.mixer.stream ?? null);
  const cameras = useInputDevices('videoinput');
  const pic = st.picture;
  const scene = sceneOf(pic);
  const pick = (id: StreamSceneId | typeof CUSTOM): void => {
    const s = STREAM_SCENES.find((x) => x.id === id);
    if (!s) return;
    // A camera scene with no camera chosen yet takes the first one there is.
    const camera =
      s.background === 'camera' ? (pic.camera ?? cameras?.[0]?.deviceId ?? null) : pic.camera;
    void saveSettings({
      stream: { ...st, picture: { ...pic, background: s.background, words: s.words, camera } },
    });
  };
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <Select<StreamSceneId | typeof CUSTOM>
          size="sm"
          aria-label={t('console.scene')}
          value={scene ?? CUSTOM}
          onChange={pick}
          options={[
            ...STREAM_SCENES.map((s) => ({ value: s.id, label: t(`console.scenes.${s.id}`) })),
            ...(scene
              ? []
              : [
                  {
                    value: CUSTOM as typeof CUSTOM,
                    label: t('console.scenes.custom'),
                    disabled: true,
                  },
                ]),
          ]}
        />
      </div>
      {bus && (
        <>
          <IconButton
            size="sm"
            aria-label={t('mixer.muteOf', { name: t('mixer.bus.stream') })}
            title={bus.mute ? t('console.streamMuted') : t('console.muteStream')}
            active={bus.mute}
            activeTone="live"
            onClick={() =>
              void mixerCmd({ action: 'bus', bus: 'stream', patch: { mute: !bus.mute } })
            }
          >
            {bus.mute ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </IconButton>
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
            className="w-28 shrink-0"
          />
        </>
      )}
    </div>
  );
}

/**
 * Live with no sound: why, and the one click that most likely fixes it (unmute the stream, or
 * open the channels it hears).
 */
export function SilentNotice({ s }: { s: StreamStatus }) {
  const { t } = useTranslation();
  const mixer = useStore((x) => x.live?.mixer ?? null);
  if (!s.silent || !mixer) return null;
  const heard = mixer.channels.filter((c) => c.stream && !c.mute);
  const why = mixer.stream.mute ? 'muted' : heard.length === 0 ? 'nothing' : 'quiet';
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-[8px] bg-[color-mix(in_srgb,var(--tally-program)_14%,transparent)] px-3 py-2.5 shadow-[inset_3px_0_0_var(--tally-program)]"
    >
      <VolumeOff size={15} className="mt-px shrink-0 text-[var(--tally-program)]" />
      <Typography size={12} tone="primary" leading="snug" className="min-w-0 flex-1">
        {t(`console.silent.${why}`, { names: heard.map((c) => c.name).join(', ') })}
      </Typography>
      {why === 'muted' && (
        <Button
          size="xs"
          variant="primary"
          onClick={() => void mixerCmd({ action: 'bus', bus: 'stream', patch: { mute: false } })}
        >
          {t('console.unmute')}
        </Button>
      )}
    </div>
  );
}

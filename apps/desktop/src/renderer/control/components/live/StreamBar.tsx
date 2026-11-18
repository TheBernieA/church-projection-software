import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, VolumeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  EMPTY_SCENE,
  formatDb,
  MAX_DB,
  MIN_DB,
  type MixerChannel,
  type Scene,
  type StreamSettings,
} from '@lampstand/core';
import type { StreamStatus } from '@lampstand/ipc-contract';
import { Button, IconButton, Meter, Slider, Typography } from '@lampstand/ui';
import { saveSettings } from '../../lib/actions';
import { useCameraSettingsVersion, useDeviceStream, useInputDevices } from '../../lib/inputs';
import { onMeters, readMeter, readSides } from '../../lib/meters';
import { mixerCmd, mixerLive } from '../../lib/mixer';
import { useStore } from '../../lib/store';
import { STREAM_SCENES } from '../../lib/streamOptions';
import { SceneView } from '../SceneView';
import { Select } from '../Select';

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

/** One look the stream can take, ready to click (a camera scene names its camera). */
interface SceneChoice {
  key: string;
  label: string;
  background: StreamSettings['picture']['background'];
  words: StreamSettings['picture']['words'];
  camera: string | null;
}

/** A camera's live picture, small (the tile shows the very camera it would switch to). */
function CameraThumb({ deviceId }: { deviceId: string }) {
  const stream = useDeviceStream('videoinput', deviceId);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  return <video ref={video} autoPlay muted playsInline className="h-full w-full object-cover" />;
}

/** The lower-third band, sketched over a tile's picture. */
const BandSketch = () => (
  <span
    aria-hidden
    className="absolute inset-x-[8%] bottom-[9%] flex h-[24%] flex-col justify-center gap-[3px] rounded-[2px] bg-black/60 px-[8%]"
  >
    <span className="h-[3px] w-full rounded-full bg-white/85" />
    <span className="h-[3px] w-2/3 self-center rounded-full bg-white/70" />
  </span>
);

/**
 * The scenes, as small live previews: what each would put on the stream, with the real camera
 * pictures. One click switches the stream to it.
 */
export function ScenePreviews({ st, streaming }: { st: StreamSettings; streaming: boolean }) {
  const { t } = useTranslation();
  const program = useStore((s) => s.live?.program ?? null);
  const all = useInputDevices('videoinput');
  const saved = useCameraSettingsVersion();
  const pic = st.picture;
  const cameras = useMemo(
    () =>
      (all ?? [])
        .filter((d) => !saved[d.deviceId]?.hidden)
        .map((d) => ({ id: d.deviceId, name: saved[d.deviceId]?.name || d.label })),
    [all, saved],
  );
  const choices: SceneChoice[] = STREAM_SCENES.flatMap((s): SceneChoice[] =>
    s.background === 'camera'
      ? cameras.map((c) => ({
          key: `${s.id}:${c.id}`,
          label: t(`console.scenes.${s.id}Of`, { name: c.name }),
          background: s.background,
          words: s.words,
          camera: c.id,
        }))
      : [{ key: s.id, label: t(`console.scenes.${s.id}`), ...s, camera: null }],
  );
  // The projector's picture without its words, and its words alone (for the tiles to compose).
  const behind = useMemo<Scene | null>(
    () =>
      program ? { ...EMPTY_SCENE, background: program.background, media: program.media } : null,
    [program],
  );
  const wordsAlone = useMemo<Scene | null>(
    () => (program ? { ...EMPTY_SCENE, content: program.content } : null),
    [program],
  );
  const isOn = (c: SceneChoice): boolean =>
    c.background === pic.background &&
    c.words === pic.words &&
    (c.camera === null || c.camera === pic.camera);
  const pick = (c: SceneChoice): void =>
    void saveSettings({
      stream: {
        ...st,
        picture: {
          ...pic,
          background: c.background,
          words: c.words,
          camera: c.camera ?? pic.camera,
        },
      },
    });
  return (
    <div role="group" aria-label={t('console.scene')} className="flex gap-2 overflow-x-auto pb-1">
      {choices.map((c) => {
        const on = isOn(c);
        return (
          <Button
            key={c.key}
            variant="bare"
            aria-pressed={on}
            aria-label={c.label}
            title={c.label}
            onClick={() => pick(c)}
            className="group/scene flex w-[104px] shrink-0 cursor-pointer flex-col gap-1 text-left"
          >
            <span
              className={`relative block aspect-video w-full overflow-hidden rounded-[5px] bg-black transition-shadow ${
                on
                  ? streaming
                    ? 'shadow-[0_0_0_2px_var(--tally-program)]'
                    : 'shadow-[0_0_0_2px_var(--accent)]'
                  : 'shadow-[0_0_0_1px_var(--hairline-strong)] group-hover/scene:shadow-[0_0_0_1px_var(--text-3)]'
              }`}
            >
              {c.background === 'camera' && c.camera ? (
                <CameraThumb deviceId={c.camera} />
              ) : c.background === 'program' && behind && program ? (
                <SceneView mode="thumbnail" scene={c.words === 'full' ? program : behind} />
              ) : c.words === 'full' && wordsAlone ? (
                <SceneView mode="thumbnail" scene={wordsAlone} />
              ) : null}
              {c.words === 'lowerThird' && <BandSketch />}
            </span>
            <Typography
              size={11}
              tone={on ? 'primary' : 'secondary'}
              weight={on ? 'semibold' : 'regular'}
              truncate
              className="block"
            >
              {c.label}
            </Typography>
          </Button>
        );
      })}
    </div>
  );
}

/** One mic or desk feed, at hand while live: on the stream or not, its level, its meter, mute. */
function InputStrip({ c }: { c: MixerChannel }) {
  const { t } = useTranslation();
  const read = useCallback(() => readMeter('stream', c.id), [c.id]);
  const heard = c.stream && !c.mute;
  return (
    <div className="flex items-center gap-2">
      <IconButton
        size="xs"
        aria-label={t('mixer.streamOf', { name: c.name })}
        aria-pressed={c.stream}
        title={c.stream ? t('console.micOnStream') : t('console.micOffStream')}
        active={c.stream}
        activeTone="live"
        onClick={() => void mixerCmd({ action: 'channel', id: c.id, patch: { stream: !c.stream } })}
      >
        {c.stream ? <Mic size={14} /> : <MicOff size={14} />}
      </IconButton>
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
      <Slider
        aria-label={t('mixer.levelOf', { name: c.name })}
        min={MIN_DB}
        max={MAX_DB}
        step={0.5}
        value={c.gainDb}
        format={formatDb}
        onChange={(e) =>
          mixerLive({ action: 'channel', id: c.id, patch: { gainDb: Number(e.target.value) } })
        }
        className="w-24 shrink-0"
      />
      <IconButton
        size="xs"
        aria-label={t('mixer.muteOf', { name: c.name })}
        active={c.mute}
        activeTone="live"
        onClick={() => void mixerCmd({ action: 'channel', id: c.id, patch: { mute: !c.mute } })}
      >
        <VolumeX size={13} />
      </IconButton>
    </div>
  );
}

const ADD = '';

/**
 * The stream's sound at hand, under its picture: its level and mute, then every mic and desk
 * feed with its own switch, level, meter and mute, and a way to add another.
 */
export function StreamSound() {
  const { t } = useTranslation();
  const mixer = useStore((s) => s.live?.mixer ?? null);
  const devices = useInputDevices('audioinput');
  if (!mixer) return null;
  const bus = mixer.stream;
  const inputs = mixer.channels.filter((c) => c.kind === 'input');
  const spare = (devices ?? []).filter((d) => !inputs.some((c) => c.deviceId === d.deviceId));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <IconButton
          size="xs"
          aria-label={t('mixer.muteOf', { name: t('mixer.bus.stream') })}
          title={bus.mute ? t('console.streamMuted') : t('console.muteStream')}
          active={bus.mute}
          activeTone="live"
          onClick={() =>
            void mixerCmd({ action: 'bus', bus: 'stream', patch: { mute: !bus.mute } })
          }
        >
          {bus.mute ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </IconButton>
        <Typography size={12} weight="semibold" tone="primary" className="min-w-0 flex-1">
          {t('console.streamLevel')}
        </Typography>
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
          className="w-32 shrink-0"
        />
      </div>
      {inputs.map((c) => (
        <InputStrip key={c.id} c={c} />
      ))}
      {spare.length > 0 && (
        <Select<string>
          size="sm"
          aria-label={t('console.addMic')}
          placeholder={t('console.addMic')}
          value={ADD}
          onChange={(id) => {
            const d = spare.find((x) => x.deviceId === id);
            if (d) void mixerCmd({ action: 'add', deviceId: d.deviceId, name: d.label });
          }}
          options={spare.map((d) => ({ value: d.deviceId, label: d.label }))}
        />
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

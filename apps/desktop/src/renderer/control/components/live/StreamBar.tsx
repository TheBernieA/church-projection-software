import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Mic, MicOff, Volume2, VolumeX, VolumeOff } from 'lucide-react';
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
import { Button, IconButton, Meter, Segmented, Slider, Typography } from '@lampstand/ui';
import { saveSettings } from '../../lib/actions';
import { useCameraSettingsVersion, useDeviceStream, useInputDevices } from '../../lib/inputs';
import { onMeters, readSides } from '../../lib/meters';
import { mixerCmd, mixerLive } from '../../lib/mixer';
import { useStore } from '../../lib/store';
import { SCENE_GROUPS, STREAM_SCENES, type SceneTemplate } from '../../lib/streamOptions';
import { SceneView } from '../SceneView';
import { Select } from '../Select';
import { LevelMeter } from '../bins/AudioInputs';
import { usePref } from './consoleParts';

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

type Picture = StreamSettings['picture'];

/** One look the stream can take, ready to click (camera scenes name their cameras). */
interface SceneChoice {
  key: string;
  label: string;
  group: SceneTemplate['group'];
  patch: Pick<Picture, 'background' | 'words' | 'mirror'> &
    Partial<Pick<Picture, 'layout' | 'camera' | 'secondCamera'>>;
}

/** A camera's live picture, small (the tile shows the very camera it would switch to). */
function CameraThumb({ deviceId, className = '' }: { deviceId: string; className?: string }) {
  const stream = useDeviceStream('videoinput', deviceId);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={video}
      autoPlay
      muted
      playsInline
      className={`h-full w-full object-cover ${className}`}
    />
  );
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

/** A word on a tile with no picture of its own (the stage display, the switcher with nothing up). */
const TileWord = ({ children }: { children: string }) => (
  <Typography
    as="span"
    size={10}
    weight="semibold"
    tone="white"
    className="absolute inset-0 flex items-center justify-center opacity-70"
  >
    {children}
  </Typography>
);

/** What a scene would put on the stream, small: real cameras, the real slide. */
function ScenePicture({
  c,
  program,
  behind,
  wordsAlone,
}: {
  c: SceneChoice;
  program: Scene | null;
  behind: Scene | null;
  wordsAlone: Scene | null;
}) {
  const { t } = useTranslation();
  const p = c.patch;
  if (p.mirror === 'stage') return <TileWord>{t('console.scenes.stageTile')}</TileWord>;
  if (p.mirror === 'alternate')
    return (
      <>
        {program && <SceneView mode="thumbnail" scene={program} />}
        <Typography
          as="span"
          size={10}
          weight="semibold"
          tone="white"
          className="absolute right-1 top-1 rounded-[3px] bg-black/60 px-1"
        >
          HDMI
        </Typography>
      </>
    );
  const switcherCam = program?.input?.deviceId;
  const picture =
    p.background === 'layout' && p.camera && p.secondCamera ? (
      p.layout === 'pip' ? (
        <>
          <CameraThumb deviceId={p.camera} />
          <span className="absolute right-[4%] top-[6%] h-[32%] w-[32%] overflow-hidden rounded-[3px] shadow-[0_0_0_1px_rgba(255,255,255,0.4)]">
            <CameraThumb deviceId={p.secondCamera} />
          </span>
        </>
      ) : (
        <span className="absolute inset-0 flex">
          <span className="h-full w-1/2 overflow-hidden">
            <CameraThumb deviceId={p.camera} />
          </span>
          <span className="h-full w-1/2 overflow-hidden">
            <CameraThumb deviceId={p.secondCamera} />
          </span>
        </span>
      )
    ) : p.background === 'camera' && p.camera ? (
      <CameraThumb deviceId={p.camera} />
    ) : p.background === 'switcher' ? (
      switcherCam ? (
        <CameraThumb deviceId={switcherCam} />
      ) : (
        <TileWord>{t('console.scenes.switcherTile')}</TileWord>
      )
    ) : p.background === 'program' && program && behind ? (
      <SceneView mode="thumbnail" scene={p.words === 'full' ? program : behind} />
    ) : p.words === 'full' && wordsAlone ? (
      <SceneView mode="thumbnail" scene={wordsAlone} />
    ) : null;
  return (
    <>
      {picture}
      {p.words === 'lowerThird' && <BandSketch />}
    </>
  );
}

/**
 * The scenes, as small live previews in three groups (slides, cameras, screens): what each would
 * put on the stream, with the real camera pictures. One click switches the stream to it.
 */
export function ScenePreviews({ st, streaming }: { st: StreamSettings; streaming: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = usePref('lampstand.liveScenes', true);
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
  // A layout's two cameras: the ones chosen, else the first two there are.
  const pair = useMemo(() => {
    const a = pic.camera && cameras.some((c) => c.id === pic.camera) ? pic.camera : cameras[0]?.id;
    const b =
      pic.secondCamera && pic.secondCamera !== a && cameras.some((c) => c.id === pic.secondCamera)
        ? pic.secondCamera
        : cameras.find((c) => c.id !== a)?.id;
    return a && b ? ([a, b] as const) : null;
  }, [cameras, pic.camera, pic.secondCamera]);
  const choices: SceneChoice[] = STREAM_SCENES.flatMap((s): SceneChoice[] => {
    const base = {
      group: s.group,
      patch: { background: s.background, words: s.words, mirror: s.mirror ?? ('own' as const) },
    };
    if (s.perCamera)
      return cameras.map((c) => ({
        ...base,
        key: `${s.id}:${c.id}`,
        label: t(`console.scenes.${s.id}Of`, { name: c.name }),
        patch: { ...base.patch, camera: c.id },
      }));
    if (s.twoCameras)
      return pair
        ? [
            {
              ...base,
              key: s.id,
              label: t(`console.scenes.${s.id}`),
              patch: { ...base.patch, layout: s.layout, camera: pair[0], secondCamera: pair[1] },
            },
          ]
        : [];
    return [{ ...base, key: s.id, label: t(`console.scenes.${s.id}`) }];
  });
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
  // On air: every field the scene sets matches (a mirror ignores what's behind).
  const isOn = (c: SceneChoice): boolean => {
    const p = c.patch;
    if (p.mirror !== pic.mirror) return false;
    if (p.mirror !== 'own') return true;
    return (
      p.background === pic.background &&
      p.words === pic.words &&
      (p.camera === undefined || p.camera === pic.camera) &&
      (p.layout === undefined || p.layout === pic.layout) &&
      (p.secondCamera === undefined || p.secondCamera === pic.secondCamera)
    );
  };
  const pick = (c: SceneChoice): void =>
    void saveSettings({ stream: { ...st, picture: { ...pic, ...c.patch } } });
  const current = choices.find(isOn);
  // Slides, Cameras or Screens: opens on the one with the scene on air.
  const [tab, setTab] = useState<SceneTemplate['group']>(() => current?.group ?? 'slides');
  const shown = choices.filter((c) => c.group === tab);
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="bare"
        aria-expanded={open}
        aria-label={open ? t('console.scenesHide') : t('console.scenesShow')}
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center gap-2 text-left"
      >
        <ChevronRight
          size={14}
          className={`shrink-0 text-[var(--text-3)] transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <Typography as="span" variant="overline">
          {t('console.scenesTitle')}
        </Typography>
        <Typography size={12} tone="secondary" truncate className="min-w-0 flex-1 text-right">
          {current?.label ?? t('console.scenesCustom')}
        </Typography>
      </Button>
      {open && (
        <>
          <Segmented<SceneTemplate['group']>
            label={t('console.sceneTabs')}
            value={tab}
            onChange={setTab}
            options={SCENE_GROUPS.filter((g) => choices.some((c) => c.group === g)).map((g) => ({
              value: g,
              label: t(`console.sceneGroups.${g}`),
            }))}
          />
          <div
            role="group"
            aria-label={t('console.scene')}
            // Never so tall that the options below have no room: the tiles scroll instead.
            className="grid max-h-[188px] gap-x-2 gap-y-2.5 overflow-y-auto pr-0.5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}
          >
            {shown.map((c) => {
              const on = isOn(c);
              return (
                <Button
                  key={c.key}
                  variant="bare"
                  aria-pressed={on}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => pick(c)}
                  className="group/scene flex min-w-0 cursor-pointer flex-col gap-1 text-left"
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
                    <ScenePicture c={c} program={program} behind={behind} wordsAlone={wordsAlone} />
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
        </>
      )}
    </div>
  );
}

/**
 * One mic or desk feed, compact: on the stream or not, which input it is (with its meter, read
 * straight from the mic), its level and mute.
 */
function InputStrip({
  c,
  choices,
}: {
  c: MixerChannel;
  /** The inputs it can be switched to: its own, and any not on another channel. */
  choices: { deviceId: string; label: string }[];
}) {
  const { t } = useTranslation();
  const heard = c.stream && !c.mute;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
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
      <div className="flex w-32 min-w-0 shrink flex-col gap-1">
        <Select<string>
          size="sm"
          aria-label={t('console.micOf', { name: c.name })}
          value={c.deviceId}
          onChange={(deviceId) => {
            const d = choices.find((x) => x.deviceId === deviceId);
            if (d && d.deviceId !== c.deviceId)
              void mixerCmd({
                action: 'channel',
                id: c.id,
                patch: { deviceId: d.deviceId, name: d.label.slice(0, 40) || 'Input' },
              });
          }}
          options={[
            ...(choices.some((d) => d.deviceId === c.deviceId)
              ? []
              : [{ value: c.deviceId, label: c.name }]),
            ...choices.map((d) => ({ value: d.deviceId, label: d.label })),
          ]}
          className={heard ? '' : 'opacity-70'}
        />
        {/* The same meter as Audio inputs: straight from the mic, live or not. */}
        <LevelMeter device={{ deviceId: c.deviceId, label: c.name }} />
      </div>
      <Slider
        aria-label={t('mixer.levelOf', { name: c.name })}
        title={formatDb(c.gainDb)}
        min={MIN_DB}
        max={MAX_DB}
        step={0.5}
        value={c.gainDb}
        format={null}
        onChange={(e) =>
          mixerLive({ action: 'channel', id: c.id, patch: { gainDb: Number(e.target.value) } })
        }
        className="w-16 shrink-0"
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

/** The computer's default microphone, else the first there is. */
const defaultMic = <T extends { deviceId: string }>(devices: T[]): T | undefined =>
  devices.find((d) => d.deviceId === 'default') ?? devices[0];

/**
 * The stream's sound at hand, on one line under its picture: its level and mute, and the mic
 * (switch it to another input, its level, its meter, mute). There's always a mic: with none on
 * the mixer, the computer's default one is added (on the stream). More mics, from the Mixer,
 * get a line each.
 */
export function StreamSound() {
  const { t } = useTranslation();
  const mixer = useStore((s) => s.live?.mixer ?? null);
  const devices = useInputDevices('audioinput');
  const inputs = useMemo(() => mixer?.channels.filter((c) => c.kind === 'input') ?? [], [mixer]);
  const adding = useRef(false);
  useEffect(() => {
    if (!mixer || inputs.length || adding.current || !devices?.length) return;
    const d = defaultMic(devices);
    if (!d) return;
    adding.current = true;
    void mixerCmd({ action: 'add', deviceId: d.deviceId, name: d.label }).finally(() => {
      adding.current = false;
    });
  }, [mixer, inputs.length, devices]);
  if (!mixer) return null;
  const bus = mixer.stream;
  const choicesFor = (c: MixerChannel) =>
    (devices ?? []).filter(
      (d) => d.deviceId === c.deviceId || !inputs.some((o) => o.deviceId === d.deviceId),
    );
  const [first, ...more] = inputs;
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
        <Slider
          aria-label={t('mixer.levelOf', { name: t('mixer.bus.stream') })}
          title={`${t('console.streamLevel')}: ${formatDb(bus.gainDb)}`}
          min={MIN_DB}
          max={MAX_DB}
          step={0.5}
          value={bus.gainDb}
          format={null}
          onChange={(e) =>
            mixerLive({ action: 'bus', bus: 'stream', patch: { gainDb: Number(e.target.value) } })
          }
          className="min-w-[72px] flex-1"
        />
        {first && (
          <>
            <span aria-hidden className="h-6 w-px shrink-0 bg-[var(--hairline)]" />
            <InputStrip c={first} choices={choicesFor(first)} />
          </>
        )}
      </div>
      {more.map((c) => (
        <div key={c.id} className="flex justify-end">
          <InputStrip c={c} choices={choicesFor(c)} />
        </div>
      ))}
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

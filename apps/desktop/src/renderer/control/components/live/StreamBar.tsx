import { useCallback, useEffect, useMemo, useState } from 'react';
import { Mic, MicOff, PanelBottom, Volume2, VolumeX, VolumeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDb, MAX_DB, MIN_DB, type MixerChannel, type StreamSettings } from '@lampstand/core';
import type { StreamStatus } from '@lampstand/ipc-contract';
import { Button, IconButton, Meter, Slider, Switch, Typography } from '@lampstand/ui';
import { saveSettings } from '../../lib/actions';
import { useInputDevices } from '../../lib/inputs';
import { onMeters, readSides } from '../../lib/meters';
import { mixerCmd, mixerLive } from '../../lib/mixer';
import { useStore } from '../../lib/store';
import { STREAM_SCENES } from '../../lib/streamOptions';
import { Select } from '../Select';
import {
  cameraPair,
  SceneStrip,
  sceneChoices,
  useCameras,
  type SceneChoice,
} from '../scenes/SceneStrip';

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
 * The stream's scenes (slides, cameras, screens), as small live previews: what each would put on
 * the stream. One click switches the stream to it.
 */
export function ScenePreviews({ st, streaming }: { st: StreamSettings; streaming: boolean }) {
  const { t } = useTranslation();
  const cameras = useCameras();
  const pic = st.picture;
  const pair = useMemo(
    () => cameraPair(cameras, pic.camera, pic.secondCamera),
    [cameras, pic.camera, pic.secondCamera],
  );
  const choices = sceneChoices(STREAM_SCENES, cameras, pair, (id, name) =>
    t(`console.scenes.${id}`, { name }),
  );
  // On air: every field the scene sets matches (a mirror ignores what's behind).
  const isOn = (c: SceneChoice): boolean => {
    const p = c.patch;
    if (p.mirror !== pic.mirror) return false;
    if (p.mirror !== 'own') return true;
    return (
      p.background === pic.background &&
      // Scenes that keep the words are on whichever way the lower-third switch is.
      (c.keepsWords || p.words === pic.words) &&
      (p.camera === undefined || p.camera === pic.camera) &&
      (p.layout === undefined || p.layout === pic.layout) &&
      (p.secondCamera === undefined || p.secondCamera === pic.secondCamera)
    );
  };
  const save = (picture: Partial<StreamSettings['picture']>): void =>
    void saveSettings({ stream: { ...st, picture: { ...pic, ...picture } } });
  return (
    <SceneStrip
      prefKey="lampstand.liveScenes"
      label={t('console.scene')}
      choices={choices}
      isOn={isOn}
      onPick={(c) =>
        save(
          c.keepsWords && pic.words === 'lowerThird'
            ? { ...c.patch, words: 'lowerThird' }
            : c.patch,
        )
      }
      onAir={streaming}
      pair={
        pic.mirror === 'own' && pic.background === 'layout' && pair
          ? {
              cameras,
              value: pair,
              onChange: (camera, secondCamera) => save({ camera, secondCamera }),
            }
          : null
      }
    />
  );
}

/**
 * "Lower third on the stream", under the scenes (as the screens have theirs under the monitor):
 * the words along the bottom of whatever the scene shows, or not. Off, the main screen shows the
 * full slide again and a camera shows no words. Not while the stream mirrors a screen.
 */
export function StreamLowerThirdSwitch({ st }: { st: StreamSettings }) {
  const { t } = useTranslation();
  const pic = st.picture;
  const own = pic.mirror === 'own';
  const on = own && pic.words === 'lowerThird';
  return (
    <div
      className={`flex items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-2 ${
        on ? 'bg-[var(--accent-soft)]' : 'bg-[var(--surface-2)]'
      }`}
    >
      <PanelBottom
        size={14}
        aria-hidden
        className={on ? 'text-[var(--accent)]' : 'text-[var(--text-3)]'}
      />
      <div className="min-w-0 flex-1">
        <Typography as="p" size={12} weight="semibold" tone="primary">
          {t('console.lowerThird')}
        </Typography>
        <Typography as="p" size={11} tone="muted" truncate>
          {!own
            ? t('console.lowerThirdMirror')
            : on
              ? t('console.lowerThirdOn')
              : t('console.lowerThirdHelp')}
        </Typography>
      </div>
      <Switch
        label={t('console.lowerThird')}
        checked={on}
        disabled={!own}
        onChange={(next) =>
          void saveSettings({
            stream: {
              ...st,
              picture: {
                ...pic,
                words: next ? 'lowerThird' : pic.background === 'program' ? 'full' : 'none',
              },
            },
          })
        }
      />
    </div>
  );
}

/**
 * One mic or desk feed, compact: on the stream or not, which input it is, its level and mute.
 * (Its sound shows on the L/R meter on the stream picture.)
 */
function InputStrip({
  c,
  choices,
  onSwitch,
}: {
  c: MixerChannel;
  /** The inputs it can be switched to: its own, and any not on another channel. */
  choices: { deviceId: string; label: string }[];
  /** Switch this channel to another input. */
  onSwitch: (c: MixerChannel, d: { deviceId: string; label: string }) => void;
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
      <Select<string>
        size="sm"
        aria-label={t('console.micOf', { name: c.name })}
        value={c.deviceId}
        onChange={(deviceId) => {
          const d = choices.find((x) => x.deviceId === deviceId);
          if (d && d.deviceId !== c.deviceId) onSwitch(c, d);
        }}
        options={[
          ...(choices.some((d) => d.deviceId === c.deviceId)
            ? []
            : [{ value: c.deviceId, label: c.name }]),
          ...choices.map((d) => ({ value: d.deviceId, label: d.label })),
        ]}
        className={`w-32 min-w-0 shrink ${heard ? '' : 'opacity-70'}`}
      />
      <Slider
        aria-label={t('mixer.levelOf', { name: c.name })}
        min={MIN_DB}
        max={MAX_DB}
        step={0.5}
        value={c.gainDb}
        format={formatDb}
        readoutAt="below"
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

/** The default mic has been offered to the mixer this session (see StreamSound). */
let defaultMicTried = false;

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
  useEffect(() => {
    // Once a session, when the mixer first loads with no mic: removing the last mic later
    // (on purpose) never brings it back, and a failure never retries on every update.
    if (!mixer || defaultMicTried || !devices?.length) return;
    defaultMicTried = true;
    if (inputs.length) return;
    const d = defaultMic(devices);
    if (d) void mixerCmd({ action: 'add', deviceId: d.deviceId, name: d.label });
  }, [mixer, inputs.length, devices]);
  // The mics the stream hears get a row each (one, usually). With none, the row last shown
  // stays (switching a mic off doesn't make the row jump to another).
  const onStream = inputs.filter((c) => c.stream);
  const [lastRow, setLastRow] = useState<string | null>(null);
  const leading = onStream[0]?.id;
  if (leading && leading !== lastRow) setLastRow(leading);
  if (!mixer) return null;
  const bus = mixer.stream;
  const rows = onStream.length
    ? onStream
    : [inputs.find((c) => c.id === lastRow) ?? inputs[0]].filter((c): c is MixerChannel => !!c);
  /**
   * Picking another mic in a row sends that mic to the stream instead: this row's mic comes off
   * the stream and the picked one goes on, each with its own levels and settings (a built-in mic
   * keeps its boost; a sound card stays at its own level). A mic not on the mixer yet is added,
   * at 0 dB. Room routing is left as it is.
   */
  const switchInput = (c: MixerChannel, d: { deviceId: string; label: string }): void => {
    if (d.deviceId === c.deviceId) return;
    const target = inputs.find((o) => o.deviceId === d.deviceId);
    if (c.stream) void mixerCmd({ action: 'channel', id: c.id, patch: { stream: false } });
    void (target
      ? mixerCmd({ action: 'channel', id: target.id, patch: { stream: true, mute: false } })
      : mixerCmd({
          action: 'add',
          deviceId: d.deviceId,
          name: d.label.slice(0, 40) || 'Input',
          room: false,
          stream: true,
        }));
  };
  // Every input can be picked from a row.
  const choices = devices ?? [];
  const [first, ...more] = rows;
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
          title={t('console.streamLevel')}
          min={MIN_DB}
          max={MAX_DB}
          step={0.5}
          value={bus.gainDb}
          format={formatDb}
          readoutAt="below"
          onChange={(e) =>
            mixerLive({ action: 'bus', bus: 'stream', patch: { gainDb: Number(e.target.value) } })
          }
          className="min-w-[72px] flex-1"
        />
        {first && (
          <>
            <span aria-hidden className="h-6 w-px shrink-0 bg-[var(--hairline)]" />
            <InputStrip c={first} choices={choices} onSwitch={switchInput} />
          </>
        )}
      </div>
      {more.map((c) => (
        <div key={c.id} className="flex justify-end">
          <InputStrip c={c} choices={choices} onSwitch={switchInput} />
        </div>
      ))}
    </div>
  );
}

/**
 * Turned down this far in total (stream level plus the loudest channel's), ordinary speech no
 * longer reaches viewers: the levels, not the mic, are why the stream is silent.
 */
const TOO_LOW_DB = -20;

/**
 * Live with no sound: why, and the one click that most likely fixes it (unmute the stream, or
 * turn the levels back up).
 */
export function SilentNotice({ s }: { s: StreamStatus }) {
  const { t } = useTranslation();
  const mixer = useStore((x) => x.live?.mixer ?? null);
  if (!s.silent || !mixer) return null;
  const heard = mixer.channels.filter((c) => c.stream && !c.mute);
  const loudest = Math.max(...heard.map((c) => c.gainDb));
  const low = heard.length > 0 && mixer.stream.gainDb + loudest <= TOO_LOW_DB;
  const why = mixer.stream.mute ? 'muted' : heard.length === 0 ? 'nothing' : low ? 'low' : 'quiet';
  const turnedDown = heard.filter((c) => c.gainDb < 0);
  /** Stream level and the channels it hears back to 0 dB (unity). */
  const turnUp = (): void => {
    if (mixer.stream.gainDb < 0)
      void mixerCmd({ action: 'bus', bus: 'stream', patch: { gainDb: 0 } });
    for (const c of turnedDown)
      void mixerCmd({ action: 'channel', id: c.id, patch: { gainDb: 0 } });
  };
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-[8px] bg-[color-mix(in_srgb,var(--tally-program)_14%,transparent)] px-3 py-2.5 shadow-[inset_3px_0_0_var(--tally-program)]"
    >
      <VolumeOff size={15} className="mt-px shrink-0 text-[var(--tally-program)]" />
      <Typography size={12} tone="primary" leading="snug" className="min-w-0 flex-1">
        {t(`console.silent.${why}`, {
          names: heard.map((c) => c.name).join(', '),
          // What's turned down: the stream level, then each channel below 0 dB.
          levels: [
            ...(mixer.stream.gainDb < 0
              ? [t('console.streamLevelIs', { db: formatDb(mixer.stream.gainDb) })]
              : []),
            ...turnedDown.map((c) => `${c.name} ${formatDb(c.gainDb)}`),
          ].join(', '),
        })}
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
      {why === 'low' && (
        <Button size="xs" variant="primary" onClick={turnUp} className="shrink-0">
          {t('console.turnUp')}
        </Button>
      )}
    </div>
  );
}

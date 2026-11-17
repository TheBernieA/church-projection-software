import { useEffect, useState } from 'react';
import { FolderOpen, KeyRound, Plus, SlidersVertical, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  newId,
  recommendedKbps,
  type Settings,
  type StreamDestination,
  type StreamSettings,
} from '@lampstand/core';
import { Button, IconButton, Segmented, Slider, Switch, Typography } from '@lampstand/ui';
import { cmd, q } from '../../lib/api';
import { useInputDevices } from '../../lib/inputs';
import { attempt, closeDialog, toast, useStore } from '../../lib/store';
import { mixerCmd, mixerLive } from '../../lib/mixer';
import { DeferredInput } from '../DeferredControls';
import { CameraAccess } from '../media/CameraAccess';
import { Select } from '../Select';
import { Group, Notice, Row, SettingsPage, Tag } from './parts';
import { CheckComputer } from '../live/CheckComputer';

type Update = (patch: Partial<Settings>) => void;
const NONE = 'none';
const ENCODERS = ['auto', 'h264_videotoolbox', 'h264_nvenc', 'h264_qsv', 'h264_amf', 'libx264'];

/** One destination: its name, on/off, its ingest address (custom), and its stream key. */
export function DestinationRow({
  dest,
  hasKey,
  onChange,
  onRemove,
  onKeySaved,
}: {
  dest: StreamDestination;
  hasKey: boolean;
  onChange: (patch: Partial<StreamDestination>) => void;
  onRemove: () => void;
  onKeySaved: () => void;
}) {
  const { t } = useTranslation();
  const [key, setKey] = useState('');
  const saveKey = async (value: string | null): Promise<void> => {
    const r = await attempt(
      () => cmd('stream.setKey', { destinationId: dest.id, key: value }),
      'errors.save',
    );
    if (r === undefined) return;
    setKey('');
    onKeySaved();
    toast(value ? t('streaming.keySaved', { name: dest.name }) : t('streaming.keyRemoved'));
  };
  return (
    <section aria-label={dest.name} className="flex flex-col gap-2.5 px-4 py-3.5">
      <div className="flex items-center gap-2">
        <Typography
          size={10}
          weight="bold"
          caps
          tone="white"
          className="shrink-0 rounded-[3px] px-1.5 py-0.5"
          style={{
            background:
              dest.kind === 'youtube'
                ? '#d43b30'
                : dest.kind === 'facebook'
                  ? '#2f6ad9'
                  : dest.kind === 'direct'
                    ? '#1f8a70'
                    : '#555b6e',
          }}
        >
          {t(`streaming.kinds.${dest.kind}`)}
        </Typography>
        <DeferredInput
          aria-label={t('streaming.destName')}
          value={dest.name}
          maxLength={60}
          onCommit={(name) => name.trim() && onChange({ name: name.trim() })}
          className="field !h-8 flex-1"
        />
        <Switch
          label={t('streaming.enabledOf', { name: dest.name })}
          checked={dest.enabled}
          onChange={(enabled) => onChange({ enabled })}
        />
        <IconButton
          size="xs"
          variant="danger"
          aria-label={t('streaming.remove', { name: dest.name })}
          onClick={onRemove}
        >
          <Trash2 size={14} />
        </IconButton>
      </div>
      {dest.kind === 'direct' && (
        <>
          <DeferredInput
            aria-label={t('streaming.directUrl')}
            placeholder="srt://192.168.1.50:9000"
            value={dest.url}
            maxLength={500}
            onCommit={(url) => onChange({ url: url.trim() })}
            className="field !h-8 w-full"
          />
          <Typography as="p" size={11} tone="muted">
            {t('streaming.directHelp')}
          </Typography>
        </>
      )}
      {dest.kind === 'custom' && (
        <DeferredInput
          aria-label={t('streaming.url')}
          placeholder="rtmp://…"
          value={dest.url}
          maxLength={500}
          onCommit={(url) => onChange({ url: url.trim() })}
          className="field !h-8 w-full"
        />
      )}
      {dest.kind !== 'direct' && (
        <>
          <div className="flex items-center gap-2">
            <KeyRound size={14} className="shrink-0 text-[var(--text-3)]" />
            <input
              type="password"
              autoComplete="off"
              aria-label={t('streaming.keyOf', { name: dest.name })}
              placeholder={hasKey ? t('streaming.keyReplace') : t('streaming.keyPlaceholder')}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && key.trim() && void saveKey(key)}
              className="field !h-8 flex-1"
            />
            <Button
              size="xs"
              variant="primary"
              disabled={!key.trim()}
              onClick={() => void saveKey(key)}
            >
              {t('streaming.saveKey')}
            </Button>
            {hasKey && (
              <Button size="xs" variant="ghost" onClick={() => void saveKey(null)}>
                {t('streaming.forgetKey')}
              </Button>
            )}
          </div>
          <Typography as="p" size={11} tone="muted">
            {hasKey ? t('streaming.keyStored') : t(`streaming.keyHelp.${dest.kind}`)}
          </Typography>
        </>
      )}
    </section>
  );
}

/**
 * Settings › Streaming: where the livestream goes (YouTube, Facebook, any RTMP service), what it
 * shows and sounds like, its quality, and where recordings are saved. Stream keys are stored
 * encrypted on this computer and never shown again.
 */
export function StreamingPage({ s, update }: { s: Settings; update: Update }) {
  const { t } = useTranslation();
  const st = s.stream;
  const set = (patch: Partial<StreamSettings>): void => update({ stream: { ...st, ...patch } });
  const status = useStore((x) => x.stream);
  const cameras = useInputDevices('videoinput');
  const mixer = useStore((x) => x.live?.mixer ?? null);
  const [keys, setKeys] = useState<Record<string, boolean>>({});
  const loadKeys = (): void => void q('stream.keys').then(setKeys, () => undefined);
  useEffect(loadKeys, [st.destinations.length]);
  const [kbpsDraft, setKbpsDraft] = useState<number | null>(null);
  const setQuality = (patch: Partial<StreamSettings['quality']>): void =>
    set({ quality: { ...st.quality, ...patch } });
  // What the stream uses now (the mode's values, or Custom's).
  const profile = status?.profile;
  const shown =
    st.performance === 'custom' || !profile
      ? st.quality
      : { ...st.quality, height: profile.height, fps: profile.fps, videoKbps: profile.videoKbps };
  const kbps = kbpsDraft ?? shown.videoKbps;
  const recommended = recommendedKbps(shown.height, shown.fps);
  /** Changing size, rate or bitrate by hand makes the mode Custom (starting from what it was). */
  const setCustom = (patch: Partial<StreamSettings['quality']>): void =>
    set({ performance: 'custom', quality: { ...shown, ...patch } });
  const setDest = (id: string, patch: Partial<StreamDestination>): void =>
    set({ destinations: st.destinations.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  const addDest = (kind: StreamDestination['kind']): void =>
    set({
      destinations: [
        ...st.destinations,
        { id: newId(), kind, name: t(`streaming.kinds.${kind}`), url: '', enabled: true },
      ],
    });
  const removeDest = async (d: StreamDestination): Promise<void> => {
    await attempt(() => cmd('stream.setKey', { destinationId: d.id, key: null }), 'errors.save');
    set({ destinations: st.destinations.filter((x) => x.id !== d.id) });
  };
  const live = !!status && status.state !== 'idle';

  return (
    <SettingsPage
      title={t('settings.pages.streaming')}
      description={t('settings.pagesHelp.streaming')}
    >
      {status && !status.available && <Notice tone="warn">{t('live.noFfmpeg')}</Notice>}
      <Group
        title={t('streaming.destinations')}
        footnote={t('streaming.destinationsHelp')}
        action={
          <span className="flex gap-1">
            {(['youtube', 'facebook', 'custom', 'direct'] as const).map((k) => (
              <Button
                key={k}
                size="xs"
                variant="ghost"
                icon={<Plus size={13} />}
                onClick={() => addDest(k)}
              >
                {t(`streaming.kinds.${k}`)}
              </Button>
            ))}
          </span>
        }
      >
        {st.destinations.length === 0 ? (
          <Typography as="p" size={12} tone="muted" className="px-4 py-4">
            {t('streaming.noDestinations')}
          </Typography>
        ) : (
          st.destinations.map((d) => (
            <DestinationRow
              key={d.id}
              dest={d}
              hasKey={!!keys[d.id]}
              onChange={(patch) => setDest(d.id, patch)}
              onRemove={() => void removeDest(d)}
              onKeySaved={loadKeys}
            />
          ))
        )}
      </Group>

      <Group title={t('streaming.picture')} footnote={t('streaming.pictureHelp')}>
        <Row label={t('streaming.words')} description={t('streaming.wordsHelp')}>
          <Segmented<StreamSettings['picture']['words']>
            label={t('streaming.words')}
            value={st.picture.words}
            onChange={(words) => set({ picture: { ...st.picture, words } })}
            options={[
              { value: 'lowerThird', label: t('streaming.lowerThird') },
              { value: 'full', label: t('streaming.fullScreen') },
              { value: 'none', label: t('streaming.off') },
            ]}
          />
        </Row>
        <Row label={t('streaming.background')} description={t('streaming.backgroundHelp')}>
          <Segmented<StreamSettings['picture']['background']>
            label={t('streaming.background')}
            value={st.picture.background}
            onChange={(background) => set({ picture: { ...st.picture, background } })}
            options={[
              { value: 'program', label: t('streaming.bgProgram') },
              { value: 'camera', label: t('streaming.bgCamera') },
              { value: 'black', label: t('streaming.bgBlack') },
            ]}
          />
        </Row>
        <Row label={t('streaming.camera')} description={t('streaming.cameraHelp')}>
          <div className="w-60">
            <Select<string>
              size="sm"
              aria-label={t('streaming.camera')}
              value={st.picture.camera ?? NONE}
              onChange={(v) => set({ picture: { ...st.picture, camera: v === NONE ? null : v } })}
              options={[
                { value: NONE, label: t('streaming.noCamera') },
                ...(cameras ?? []).map((c) => ({ value: c.deviceId, label: c.label })),
              ]}
            />
          </div>
        </Row>
      </Group>
      <CameraAccess />

      <Group
        title={t('streaming.sound')}
        footnote={t('streaming.soundMixerHelp')}
        action={
          <Button
            size="xs"
            variant="ghost"
            icon={<SlidersVertical size={13} />}
            onClick={() => {
              useStore.setState({ mixerOpen: true });
              closeDialog();
            }}
          >
            {t('streaming.openMixer')}
          </Button>
        }
      >
        {(mixer?.channels ?? []).map((c) => (
          <Row key={c.id} label={c.name} description={t(`streaming.channelKind.${c.kind}`)}>
            <Switch
              label={t('mixer.streamOf', { name: c.name })}
              checked={c.stream}
              onChange={(stream) =>
                void mixerCmd({ action: 'channel', id: c.id, patch: { stream } })
              }
            />
          </Row>
        ))}
        {mixer && (
          <Row label={t('mixer.delay')} description={t('streaming.delayHelp')}>
            <Slider
              aria-label={t('mixer.delayOf')}
              min={0}
              max={500}
              step={10}
              value={mixer.stream.delayMs}
              format={(v) => `${v} ms`}
              className="w-56"
              onChange={(e) =>
                mixerLive({
                  action: 'bus',
                  bus: 'stream',
                  patch: { delayMs: Number(e.currentTarget.value) },
                })
              }
            />
          </Row>
        )}
      </Group>

      <Group title={t('streaming.performance')} description={t('streaming.performanceHelp')}>
        <Row
          label={t('streaming.performanceMode')}
          description={
            profile
              ? t('streaming.performanceNow', {
                  mode: t(`streaming.modes.${profile.mode}`),
                  size: `${profile.height}p${profile.fps}`,
                  rate: (profile.videoKbps / 1000).toFixed(1),
                  encoder: status.encoder,
                })
              : undefined
          }
          badge={
            st.performance === 'auto' ? (
              <Tag tone="accent">{t('streaming.recommended')}</Tag>
            ) : undefined
          }
        >
          <Segmented<StreamSettings['performance']>
            label={t('streaming.performanceMode')}
            value={st.performance}
            onChange={(performance) => set({ performance })}
            options={(['auto', 'light', 'balanced', 'quality', 'custom'] as const).map((m) => ({
              value: m,
              label: t(`streaming.modes.${m}`),
            }))}
          />
        </Row>
        <Row label={t('benchmark.button')} description={t('benchmark.help')}>
          <CheckComputer size="sm" />
        </Row>
        <Row
          label={t(`streaming.modeHelpTitle`)}
          description={t(`streaming.modeHelp.${st.performance}`)}
        >
          <span />
        </Row>
      </Group>

      <Group
        title={t('streaming.quality')}
        footnote={live ? t('streaming.qualityLive') : t('streaming.qualityHelp')}
      >
        <Row label={t('streaming.resolution')}>
          <Segmented<'540' | '720' | '1080'>
            label={t('streaming.resolution')}
            value={String(shown.height) as '540' | '720' | '1080'}
            onChange={(v) => {
              const height = Number(v) as 540 | 720 | 1080;
              setCustom({ height, videoKbps: recommendedKbps(height, shown.fps) });
            }}
            options={[
              { value: '540', label: '540p' },
              { value: '720', label: '720p' },
              { value: '1080', label: '1080p' },
            ]}
          />
        </Row>
        <Row label={t('streaming.fps')}>
          <Segmented<'30' | '60'>
            label={t('streaming.fps')}
            value={String(shown.fps) as '30' | '60'}
            onChange={(v) => {
              const fps = Number(v) as 30 | 60;
              setCustom({ fps, videoKbps: recommendedKbps(shown.height, fps) });
            }}
            options={[
              { value: '30', label: '30 fps' },
              { value: '60', label: '60 fps' },
            ]}
          />
        </Row>
        <Row
          label={t('streaming.bitrate')}
          description={t('streaming.bitrateHelp', { kbps: recommended.toLocaleString() })}
        >
          <Slider
            aria-label={t('streaming.bitrate')}
            min={800}
            max={12_000}
            step={100}
            value={kbps}
            format={(v) => `${(v / 1000).toFixed(1)} Mb/s`}
            onChange={(e) => setKbpsDraft(Number(e.currentTarget.value))}
            onPointerUp={() => {
              if (kbpsDraft !== null) setCustom({ videoKbps: kbpsDraft });
              setKbpsDraft(null);
            }}
            onKeyUp={() => {
              if (kbpsDraft !== null) setCustom({ videoKbps: kbpsDraft });
              setKbpsDraft(null);
            }}
            className="w-60"
          />
        </Row>
        <Row
          label={t('streaming.encoder')}
          description={t('streaming.encoderHelp', { encoder: status?.encoder ?? '…' })}
        >
          <div className="w-60">
            <Select<string>
              size="sm"
              aria-label={t('streaming.encoder')}
              value={st.quality.encoder}
              onChange={(encoder) => setQuality({ encoder })}
              options={ENCODERS.map((e) => ({ value: e, label: t(`streaming.encoders.${e}`) }))}
            />
          </div>
        </Row>
      </Group>

      <Group title={t('streaming.recording')}>
        <Row
          label={t('streaming.folder')}
          description={st.recording.folder ?? t('streaming.folderDefault')}
        >
          <div className="flex gap-1.5">
            <Button
              size="xs"
              variant="ghost"
              onClick={() =>
                void q('recording.chooseFolder').then(
                  (r) => r.folder && set({ recording: { ...st.recording, folder: r.folder } }),
                )
              }
            >
              {t('streaming.choose')}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              icon={<FolderOpen size={13} />}
              onClick={() => void q('recording.reveal', { path: null })}
            >
              {t('streaming.open')}
            </Button>
          </div>
        </Row>
        <Row label={t('streaming.recordWhile')} description={t('streaming.recordWhileHelp')}>
          <Switch
            label={t('streaming.recordWhile')}
            checked={st.recording.recordWhileStreaming}
            onChange={(recordWhileStreaming) =>
              set({ recording: { ...st.recording, recordWhileStreaming } })
            }
          />
        </Row>
      </Group>
    </SettingsPage>
  );
}

import { useState, type ReactNode } from 'react';
import { Cast, FolderOpen, Globe, Link2, Plus, SlidersVertical, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  recommendedKbps,
  type Settings,
  type StreamDestination,
  type StreamSettings,
  STREAM_ENCODERS,
} from '@lampstand/core';
import { Button, IconButton, Segmented, Slider, Switch, Typography } from '@lampstand/ui';
import { q } from '../../lib/api';
import { useInputDevices } from '../../lib/inputs';
import { closeDialog, openDialog, useStore } from '../../lib/store';
import { mixerCmd, mixerLive } from '../../lib/mixer';
import { lowerThirdThemes } from '../../lib/slides';
import { useDestinations } from '../../lib/streamDestinations';
import {
  BACKGROUNDS,
  choices,
  NONE,
  PERFORMANCE_MODES,
  pickWordsTheme,
  WORDS_MODES,
  WORDS_SIZE,
  WORDS_WIDTH,
  wordsThemeOptions,
} from '../../lib/streamOptions';
import { DeferredInput } from '../DeferredControls';
import { CameraAccess } from '../media/CameraAccess';
import { Select } from '../Select';
import { Group, Notice, Row, SettingsPage, Tag } from './parts';
import { CheckComputer } from '../live/CheckComputer';
import { DestinationFields, KindBadge } from '../live/destinationFields';
import { WordsPlacement } from '../live/WordsPlacement';

type Update = (patch: Partial<Settings>) => void;
const ENCODERS = ['auto', ...STREAM_ENCODERS];

/** One destination: its name, on/off, and what it needs (a key, an address). */
export function DestinationRow({
  dest,
  hasKey,
  srt,
  onChange,
  onRemove,
  onKeySaved,
}: {
  dest: StreamDestination;
  hasKey: boolean;
  srt: boolean | null;
  onChange: (patch: Partial<StreamDestination>) => void;
  onRemove: () => void;
  onKeySaved: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section aria-label={dest.name} className="flex flex-col gap-2.5 px-4 py-3.5">
      <div className="flex items-center gap-2">
        <KindBadge kind={dest.kind} />
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
      <DestinationFields
        dest={dest}
        hasKey={hasKey}
        srt={srt}
        onChange={onChange}
        onKeySaved={onKeySaved}
      />
    </section>
  );
}

/** One way of getting the service out, with what it's for and how to add it. */
function Way({
  icon,
  title,
  delay,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  delay: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 px-4 py-3.5">
      <span className="mt-0.5 shrink-0 text-[var(--accent)]">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Typography variant="label">{title}</Typography>
          <Tag>{delay}</Tag>
        </div>
        <Typography as="p" size={12} tone="secondary" leading="snug" className="mt-1">
          {body}
        </Typography>
        <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
      </div>
    </div>
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
  const themes = useStore((x) => x.themes);
  // Pictures and videos the stream can be covered with.
  const media = useStore((x) => x.media);
  const visuals = media.filter((m) => m.kind === 'image' || m.kind === 'video');
  const {
    keys,
    loadKeys,
    patch: setDest,
    add: addDest,
    remove: removeDest,
  } = useDestinations(st.destinations, (destinations) => set({ destinations }));
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
  const live = !!status && status.state !== 'idle';
  const ndi = useStore((x) => x.ndi);
  const ndiOn = s.ndi.feeds.filter((f) => f.enabled).length;

  return (
    <SettingsPage
      title={t('settings.pages.streaming')}
      description={t('settings.pagesHelp.streaming')}
    >
      {status && !status.available && <Notice tone="warn">{t('live.noFfmpeg')}</Notice>}
      <Group title={t('streaming.ways.title')} footnote={t('streaming.ways.help')}>
        <Way
          icon={<Globe size={16} />}
          title={t('streaming.ways.service.title')}
          delay={t('streaming.ways.service.delay')}
          body={t('streaming.ways.service.body')}
        >
          {(['youtube', 'facebook', 'custom'] as const).map((k) => (
            <Button
              key={k}
              size="xs"
              variant="secondary"
              icon={<Plus size={13} />}
              onClick={() => addDest(k)}
            >
              {t(`streaming.kinds.${k}`)}
            </Button>
          ))}
        </Way>
        <Way
          icon={<Link2 size={16} />}
          title={t('streaming.ways.direct.title')}
          delay={t('streaming.ways.direct.delay')}
          body={t('streaming.ways.direct.body')}
        >
          <Button
            size="xs"
            variant="secondary"
            icon={<Plus size={13} />}
            onClick={() => addDest('direct')}
          >
            {t('streaming.kinds.direct')}
          </Button>
        </Way>
        <Way
          icon={<Cast size={16} />}
          title={t('streaming.ways.ndi.title')}
          delay={t('streaming.ways.ndi.delay')}
          body={
            ndi?.available
              ? t('streaming.ways.ndi.body')
              : `${t('streaming.ways.ndi.body')} ${t('streaming.ways.ndi.needsTools')}`
          }
        >
          <Button
            size="xs"
            variant="secondary"
            onClick={() => openDialog('settings', { settingsPage: 'ndi' })}
          >
            {t('streaming.ways.ndi.open', { count: ndiOn })}
          </Button>
        </Way>
      </Group>

      <Group title={t('streaming.destinations')} footnote={t('streaming.destinationsHelp')}>
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
              srt={status?.srt ?? null}
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
            options={choices(WORDS_MODES, t)}
          />
        </Row>
        {st.picture.words === 'lowerThird' && (
          <Row label={t('streaming.wordsTheme')} description={t('streaming.wordsThemeHelp')}>
            <div className="w-60">
              <Select<string>
                size="sm"
                aria-label={t('streaming.wordsTheme')}
                value={st.picture.wordsTheme ?? NONE}
                onChange={(v) =>
                  set({
                    picture: { ...st.picture, ...pickWordsTheme(v, lowerThirdThemes(themes)) },
                  })
                }
                options={wordsThemeOptions(lowerThirdThemes(themes), t)}
              />
            </div>
          </Row>
        )}
        {st.picture.words === 'lowerThird' && (
          <Row label={t('streaming.wordsAlign')} description={t('streaming.wordsAlignHelp')}>
            <WordsPlacement
              edge={st.picture.wordsEdge}
              align={st.picture.wordsAlign}
              onChange={(p) => set({ picture: { ...st.picture, ...p } })}
            />
          </Row>
        )}
        {st.picture.words === 'lowerThird' && (
          <Row label={t('streaming.wordsWidth')} description={t('streaming.wordsWidthHelp')}>
            <Slider
              aria-label={t('streaming.wordsWidth')}
              {...WORDS_WIDTH}
              value={st.picture.wordsWidth}
              format={(v) => `${v}%`}
              className="w-56"
              onChange={(e) =>
                set({ picture: { ...st.picture, wordsWidth: Number(e.currentTarget.value) } })
              }
            />
          </Row>
        )}
        {st.picture.words === 'lowerThird' && (
          <>
            <Row label={t('streaming.wordsAutoLong')} description={t('streaming.wordsAutoHelp')}>
              <Switch
                label={t('streaming.wordsAutoLong')}
                checked={st.picture.wordsAuto}
                onChange={(wordsAuto) => set({ picture: { ...st.picture, wordsAuto } })}
              />
            </Row>
            {!st.picture.wordsAuto && (
              <Row label={t('streaming.wordsSize')} description={t('streaming.wordsSizeHelp')}>
                <Slider
                  aria-label={t('streaming.wordsSize')}
                  {...WORDS_SIZE}
                  value={st.picture.wordsSize}
                  format={(v) => `${v}%`}
                  className="w-56"
                  onChange={(e) =>
                    set({ picture: { ...st.picture, wordsSize: Number(e.currentTarget.value) } })
                  }
                />
              </Row>
            )}
          </>
        )}
        <Row label={t('streaming.background')} description={t('streaming.backgroundHelp')}>
          <Segmented<StreamSettings['picture']['background']>
            label={t('streaming.background')}
            value={st.picture.background}
            onChange={(background) => set({ picture: { ...st.picture, background } })}
            options={choices(BACKGROUNDS, t)}
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
            options={PERFORMANCE_MODES.map((m) => ({
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

      <Group>
        <Row label={t('streaming.cover')} description={t('streaming.coverHelp')}>
          <div className="w-60">
            <Select<string>
              size="sm"
              aria-label={t('streaming.cover')}
              value={st.cover.kind === 'logo' ? NONE : st.cover.mediaId}
              onChange={(id) => {
                const m = visuals.find((x) => x.id === id);
                set({
                  cover:
                    m && (m.kind === 'image' || m.kind === 'video')
                      ? { kind: m.kind, mediaId: m.id }
                      : { kind: 'logo' },
                });
              }}
              options={[
                { value: NONE, label: t('streaming.coverLogo') },
                ...visuals.map((m) => ({ value: m.id, label: m.name })),
              ]}
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

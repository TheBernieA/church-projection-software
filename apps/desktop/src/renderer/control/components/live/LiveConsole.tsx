import { useCallback, useEffect, useState, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Circle,
  ExternalLink,
  FolderOpen,
  KeyRound,
  Plus,
  Gauge,
  PanelRightClose,
  PictureInPicture2,
  Radio,
  RotateCcw,
  Settings2,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  formatClock,
  formatDb,
  MAX_DB,
  MIN_DB,
  newId,
  secondsSince,
  type StreamDestination,
  type StreamSettings,
} from '@lampstand/core';
import type { StreamStatus } from '@lampstand/ipc-contract';
import { Button, IconButton, Meter, Segmented, Slider, Switch, Typography } from '@lampstand/ui';
import { saveSettings } from '../../lib/actions';
import { cmd, q } from '../../lib/api';
import { useNow } from '../../lib/hooks';
import { useInputDevices } from '../../lib/inputs';
import { onMeters, readMeter } from '../../lib/meters';
import { mixerCmd, mixerLive } from '../../lib/mixer';
import { attempt, openDialog, useStore } from '../../lib/store';
import { useStreamPreview } from '../../lib/streamPreview';
import { Select } from '../Select';
import { ITEM_CLASS, MENU_CLASS } from '../menu';
import { DestinationRow } from '../settings/streaming';
import { Sparkline } from './Sparkline';
import { CheckComputer } from './CheckComputer';

const NO_DESTINATIONS: StreamSettings['destinations'] = [];
const READY_KEY = 'lampstand.liveReady';
const NO_CAMERA = 'none';

const run = (type: string, payload: object = {}): void =>
  void attempt(() => cmd(type, payload), 'errors.stream');

/** "1.2 GB" / "340 MB". */
const formatBytes = (bytes: number): string =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${Math.max(0, Math.round(bytes / 1024 ** 2))} MB`;

function readPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

/** A titled block of the console. */
function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-2.5 border-t border-[var(--hairline)] px-4 py-3.5"
    >
      <div className="flex min-h-5 items-center justify-between gap-2">
        <Typography as="h3" variant="overline">
          {title}
        </Typography>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One measure in the health panel: its value, a caption, and a sparkline. */
function Stat({
  label,
  value,
  sub,
  history,
  max,
  tone = 'ok',
}: {
  label: string;
  value: string;
  sub?: string;
  history?: readonly number[];
  max?: number;
  tone?: 'ok' | 'warn' | 'bad';
}) {
  const color =
    tone === 'bad'
      ? 'var(--tally-program)'
      : tone === 'warn'
        ? 'var(--accent)'
        : 'var(--tally-preview)';
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[8px] bg-[var(--surface-2)] px-3 py-2.5 shadow-[0_0_0_1px_var(--hairline)]">
      <Typography size={11} tone="muted" truncate>
        {label}
      </Typography>
      <Typography size={16} weight="semibold" tone="primary" tabular truncate>
        {value}
      </Typography>
      {sub && (
        <Typography size={10} tone="muted" truncate>
          {sub}
        </Typography>
      )}
      {history && <Sparkline values={history} max={max} color={color} />}
    </div>
  );
}

function StatusPill({ s }: { s: StreamStatus | null }) {
  const { t } = useTranslation();
  const now = useNow(1000, !!s && s.state !== 'idle');
  const elapsed = s?.since ? formatClock(secondsSince(s.since, now)) : '00:00';
  const [label, tone] = !s
    ? [t('console.state.offAir'), 'idle']
    : s.error === 'reconnecting'
      ? [t('console.state.reconnecting'), 'warn']
      : s.state === 'starting'
        ? [t('console.state.starting'), 'warn']
        : s.state === 'live' && s.streaming
          ? [t('console.state.live'), 'live']
          : s.state === 'live' && s.recording
            ? [t('console.state.recording'), 'live']
            : s.ready
              ? [t('console.state.ready'), 'ready']
              : [t('console.state.offAir'), 'idle'];
  const look = {
    idle: 'bg-[var(--surface-3)] text-[var(--text-2)]',
    ready:
      'bg-[color-mix(in_srgb,var(--tally-preview)_20%,transparent)] text-[var(--tally-preview)]',
    warn: 'bg-[var(--accent-soft)] text-[var(--accent)]',
    live: 'bg-[var(--tally-program)] text-white',
  }[tone];
  return (
    <div className="flex items-center gap-2">
      <Typography
        role="status"
        size={11}
        weight="bold"
        tone="inherit"
        caps
        className={`flex items-center gap-1.5 rounded-[5px] px-2 py-1 ${look}`}
      >
        {tone === 'live' && (
          <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        )}
        {label}
      </Typography>
      {s && s.state !== 'idle' && (
        <Typography size={13} weight="semibold" tone="primary" tabular>
          {elapsed}
        </Typography>
      )}
    </div>
  );
}

/** What the stream shows: words, what's behind them, and which camera (applies at once). */
function PicturePanel({ st }: { st: StreamSettings }) {
  const { t } = useTranslation();
  const cameras = useInputDevices('videoinput');
  const set = (patch: Partial<StreamSettings['picture']>): void =>
    void saveSettings({ stream: { ...st, picture: { ...st.picture, ...patch } } });
  return (
    <Section title={t('console.picture')}>
      <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
        <Typography size={12} tone="secondary">
          {t('streaming.words')}
        </Typography>
        <Segmented<StreamSettings['picture']['words']>
          label={t('streaming.words')}
          value={st.picture.words}
          onChange={(words) => set({ words })}
          options={[
            { value: 'lowerThird', label: t('streaming.lowerThird') },
            { value: 'full', label: t('streaming.fullScreen') },
            { value: 'none', label: t('streaming.off') },
          ]}
        />
        <Typography size={12} tone="secondary">
          {t('console.behind')}
        </Typography>
        <Segmented<StreamSettings['picture']['background']>
          label={t('streaming.background')}
          value={st.picture.background}
          onChange={(background) => set({ background })}
          options={[
            { value: 'program', label: t('streaming.bgProgram') },
            { value: 'camera', label: t('streaming.bgCamera') },
            { value: 'black', label: t('streaming.bgBlack') },
          ]}
        />
        <Typography size={12} tone="secondary">
          {t('streaming.camera')}
        </Typography>
        <Select<string>
          size="sm"
          aria-label={t('streaming.camera')}
          value={st.picture.camera ?? NO_CAMERA}
          onChange={(id) => set({ camera: id === NO_CAMERA ? null : id })}
          options={[
            { value: NO_CAMERA, label: t('streaming.noCamera') },
            ...(cameras ?? []).map((c) => ({ value: c.deviceId, label: c.label })),
          ]}
        />
      </div>
    </Section>
  );
}

/** The stream's sound: its meter and level, mute, which channels it hears, and the delay. */
function SoundPanel() {
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

/**
 * Where the stream goes: each destination with its health, on/off, and its stream key (added or
 * replaced right here). Add YouTube, Facebook or any RTMP service from the + menu.
 */
function DestinationsPanel({ s, st }: { s: StreamStatus | null; st: StreamSettings }) {
  const { t } = useTranslation();
  const live = !!s?.streaming;
  const failed = live && s.destinations.some((d) => d.state === 'failed');
  const [keys, setKeys] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<string | null>(null);
  const loadKeys = useCallback(() => void q('stream.keys').then(setKeys, () => undefined), []);
  useEffect(loadKeys, [loadKeys, st.destinations.length]);
  const setDestinations = (destinations: StreamDestination[]): void =>
    void saveSettings({ stream: { ...st, destinations } });
  const add = (kind: StreamDestination['kind']): void => {
    const id = newId();
    setDestinations([
      ...st.destinations,
      { id, kind, name: t(`streaming.kinds.${kind}`), url: '', enabled: true },
    ]);
    setOpen(id); // straight to its key
  };
  const remove = async (d: StreamDestination): Promise<void> => {
    await attempt(() => cmd('stream.setKey', { destinationId: d.id, key: null }), 'errors.save');
    setDestinations(st.destinations.filter((x) => x.id !== d.id));
  };
  const dot = (id: string): string => {
    const state = s?.destinations.find((d) => d.id === id)?.state;
    return state === 'ok'
      ? 'var(--tally-preview)'
      : state === 'failed'
        ? 'var(--tally-program)'
        : state === 'connecting'
          ? 'var(--accent)'
          : 'var(--text-3)';
  };
  return (
    <Section
      title={t('console.destinations')}
      action={
        <div className="flex items-center gap-1">
          {failed && (
            <Button
              size="2xs"
              variant="secondary"
              icon={<RotateCcw size={12} />}
              onClick={() => run('stream.retry')}
            >
              {t('console.retry')}
            </Button>
          )}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button size="2xs" variant="ghost" icon={<Plus size={12} />} disabled={live}>
                {t('console.addDestination')}
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={4} className={MENU_CLASS}>
                {(['youtube', 'facebook', 'custom'] as const).map((k) => (
                  <DropdownMenu.Item key={k} className={ITEM_CLASS} onSelect={() => add(k)}>
                    {t(`streaming.kinds.${k}`)}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      }
    >
      {st.destinations.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <Typography as="p" size={12} tone="muted" leading="snug">
            {t('console.noDestinations')}
          </Typography>
          <div className="flex flex-wrap gap-1.5">
            {(['youtube', 'facebook', 'custom'] as const).map((k) => (
              <Button
                key={k}
                size="xs"
                variant="secondary"
                icon={<Plus size={12} />}
                onClick={() => add(k)}
              >
                {t(`streaming.kinds.${k}`)}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {st.destinations.map((d) => {
            const state = s?.destinations.find((x) => x.id === d.id)?.state;
            const needsKey = d.kind !== 'custom' && !keys[d.id];
            const expanded = open === d.id;
            return (
              <li
                key={d.id}
                className={`rounded-[8px] ${expanded ? 'bg-[var(--surface-2)] shadow-[0_0_0_1px_var(--hairline)]' : ''}`}
              >
                <div className={`flex items-center gap-2.5 ${expanded ? 'px-2.5 pt-2' : ''}`}>
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: dot(d.id) }}
                  />
                  <Typography size={13} tone="primary" truncate className="min-w-0 flex-1">
                    {d.name}
                  </Typography>
                  {state ? (
                    <Typography size={11} tone="muted">
                      {t(`live.dest.${state}`)}
                    </Typography>
                  ) : (
                    needsKey && (
                      <Typography
                        size={10}
                        weight="semibold"
                        tone="inherit"
                        caps
                        className="rounded-[4px] bg-[var(--accent-soft)] px-1.5 py-px text-[var(--accent)]"
                      >
                        {t('console.keyNeeded')}
                      </Typography>
                    )
                  )}
                  <IconButton
                    size="xs"
                    aria-label={t('console.editDestination', { name: d.name })}
                    active={expanded}
                    disabled={live}
                    onClick={() => setOpen(expanded ? null : d.id)}
                  >
                    <KeyRound size={13} />
                  </IconButton>
                  <Switch
                    label={t('streaming.enabledOf', { name: d.name })}
                    checked={d.enabled}
                    disabled={live}
                    onChange={(enabled) =>
                      setDestinations(
                        st.destinations.map((x) => (x.id === d.id ? { ...x, enabled } : x)),
                      )
                    }
                  />
                </div>
                {expanded && (
                  <div className="-mx-1.5">
                    <DestinationRow
                      dest={d}
                      hasKey={!!keys[d.id]}
                      onChange={(patch) =>
                        setDestinations(
                          st.destinations.map((x) => (x.id === d.id ? { ...x, ...patch } : x)),
                        )
                      }
                      onRemove={() => void remove(d)}
                      onKeySaved={() => {
                        loadKeys();
                        setOpen(null);
                      }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/** "VideoToolbox", "NVENC"… for the stats strip. */
const ENCODER_NAMES: Record<string, string> = {
  h264_videotoolbox: 'VideoToolbox',
  h264_nvenc: 'NVENC',
  h264_qsv: 'Quick Sync',
  h264_amf: 'AMF',
  libx264: 'x264',
};

/**
 * The readouts at the top: while running, frame rate, encoder speed, bitrate, dropped frames,
 * the encoder and the computer's load (each coloured by how it's doing); otherwise the mode,
 * size and encoder the next start will use.
 */
function StatsStrip({ s }: { s: StreamStatus }) {
  const { t } = useTranslation();
  const running = s.state !== 'idle' && s.state !== 'stopping';
  const p = s.profile;
  const encoder = ENCODER_NAMES[s.encoder] ?? s.encoder;
  const load = s.health ? s.health.appCpu + (s.health.encoderCpu ?? 0) : null;
  const chips: { label: string; title: string; tone: 'ok' | 'warn' | 'bad' | 'plain' }[] = running
    ? [
        {
          label: `${Math.round(s.fps)}/${p.fps} fps`,
          title: t('console.fps'),
          tone:
            s.fps === 0
              ? 'plain'
              : s.fps >= p.fps * 0.95
                ? 'ok'
                : s.fps >= p.fps * 0.8
                  ? 'warn'
                  : 'bad',
        },
        {
          label: s.speed > 0 ? `${s.speed.toFixed(2)}×` : '—×',
          title: t('console.speed'),
          tone: s.speed === 0 ? 'plain' : s.speed >= 0.97 ? 'ok' : s.speed >= 0.9 ? 'warn' : 'bad',
        },
        {
          label:
            s.kbps > 0
              ? `${(s.kbps / 1000).toFixed(1)} Mb/s`
              : `${(p.videoKbps / 1000).toFixed(1)} Mb/s`,
          title: t('console.bitrate'),
          tone: 'plain',
        },
        ...(s.dropped > 0
          ? [
              {
                label: t('console.droppedShort', { count: s.dropped }),
                title: t('live.dropped', { count: s.dropped }),
                tone: 'warn' as const,
              },
            ]
          : []),
        { label: encoder, title: t('streaming.encoder'), tone: 'plain' },
        ...(load !== null
          ? [
              {
                label: t('console.loadShort', { load }),
                title: t('console.cpu'),
                tone: 'plain' as const,
              },
            ]
          : []),
      ]
    : [
        {
          label: t(`streaming.modes.${p.mode}`),
          title: t('streaming.performanceMode'),
          tone: 'plain',
        },
        { label: `${p.height}p${p.fps}`, title: t('streaming.resolution'), tone: 'plain' },
        {
          label: `${(p.videoKbps / 1000).toFixed(1)} Mb/s`,
          title: t('console.bitrate'),
          tone: 'plain',
        },
        { label: encoder, title: t('streaming.encoder'), tone: 'plain' },
      ];
  const look = {
    ok: 'text-[var(--tally-preview)]',
    warn: 'text-[var(--accent)]',
    bad: 'text-[var(--tally-program)]',
    plain: 'text-[var(--text-2)]',
  };
  return (
    <div
      role="group"
      aria-label={t('console.stats')}
      className="flex flex-wrap items-center gap-1.5 border-b border-[var(--hairline)] px-3 py-2"
    >
      {chips.map((c) => (
        <Typography
          key={c.title}
          size={11}
          weight="semibold"
          tone="inherit"
          tabular
          title={c.title}
          className={`rounded-[5px] bg-[var(--surface-2)] px-1.5 py-0.5 shadow-[0_0_0_1px_var(--hairline)] ${look[c.tone]}`}
        >
          {c.label}
        </Typography>
      ))}
    </div>
  );
}

function HealthPanel({ s }: { s: StreamStatus }) {
  const { t } = useTranslation();
  const h = s.health;
  const running = s.state !== 'idle';
  const target = s.profile.fps;
  const fpsTone = !running
    ? 'ok'
    : s.fps >= target * 0.95
      ? 'ok'
      : s.fps >= target * 0.8
        ? 'warn'
        : 'bad';
  const speedTone =
    !running || s.speed === 0 ? 'ok' : s.speed >= 0.97 ? 'ok' : s.speed >= 0.9 ? 'warn' : 'bad';
  return (
    <Section
      title={t('console.health')}
      action={
        <Typography size={11} tone="muted" truncate>
          {t('console.profile', {
            mode: t(`streaming.modes.${s.profile.mode}`),
            size: `${s.profile.height}p${s.profile.fps}`,
            encoder: s.encoder,
          })}
        </Typography>
      }
    >
      {s.advice === 'lighter' && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-[8px] bg-[var(--accent-soft)] px-3 py-2.5 shadow-[inset_3px_0_0_var(--accent)]"
        >
          <Gauge size={16} className="shrink-0 text-[var(--accent)]" />
          <Typography size={12} tone="primary" leading="snug" className="min-w-0 flex-1">
            {t('console.advice')}
          </Typography>
          <Button size="xs" variant="primary" onClick={() => run('stream.lighter')}>
            {t('console.switchLight')}
          </Button>
        </div>
      )}
      {!running ? (
        <Typography as="p" size={12} tone="muted" leading="snug">
          {t('console.healthIdle')}
        </Typography>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label={t('console.fps')}
            value={`${Math.round(s.fps)} / ${target}`}
            sub={s.dropped > 0 ? t('live.dropped', { count: s.dropped }) : t('console.noDrops')}
            history={h?.history.fps}
            max={target}
            tone={fpsTone}
          />
          <Stat
            label={t('console.bitrate')}
            value={s.kbps > 0 ? `${(s.kbps / 1000).toFixed(1)} Mb/s` : '—'}
            sub={t('console.target', { rate: (s.profile.videoKbps / 1000).toFixed(1) })}
            history={h?.history.kbps}
          />
          <Stat
            label={t('console.speed')}
            value={s.speed > 0 ? `${s.speed.toFixed(2)}×` : '—'}
            sub={t('console.speedHelp')}
            history={h?.history.speed}
            max={1.2}
            tone={speedTone}
          />
          <Stat
            label={t('console.cpu')}
            value={h ? `${h.appCpu + (h.encoderCpu ?? 0)}%` : '—'}
            sub={
              h
                ? t('console.cpuSplit', {
                    app: h.appCpu,
                    encoder: h.encoderCpu ?? '—',
                    mem: formatBytes((h.appMemMB + (h.encoderMemMB ?? 0)) * 1024 ** 2),
                  })
                : undefined
            }
            history={h?.history.cpu}
          />
        </div>
      )}
    </Section>
  );
}

/**
 * The Live console: everything for running the livestream and recording in one place, docked
 * beside the output or in its own window (another display). The real outgoing picture, going
 * live and recording, what the stream shows and hears, each destination, and how the computer
 * is coping.
 */
export function LiveConsole({ mode }: { mode: 'docked' | 'window' }) {
  const { t } = useTranslation();
  const s = useStore((x) => x.stream);
  const settings = useStore((x) => x.settings);
  const st: StreamSettings | null = settings?.stream ?? null;
  const destinations = st?.destinations ?? NO_DESTINATIONS;
  const enabled = destinations.filter((d) => d.enabled);
  const [showReady, setShowReady] = useState(() => readPref(READY_KEY, true));
  const canReady = s?.profile.allowReady ?? true;
  const running = !!s && s.state !== 'idle';
  const preview = useStreamPreview(
    running || (showReady && canReady) ? 4 : 0,
    showReady && canReady,
  );

  const toggleReady = (on: boolean): void => {
    setShowReady(on);
    try {
      localStorage.setItem(READY_KEY, on ? '1' : '0');
    } catch {
      /* this session only */
    }
  };
  const goLive = (): void => {
    const names = enabled.map((d) => d.name).join(', ');
    if (window.confirm(t('live.confirmStart', { names }))) run('stream.start', { stream: true });
  };
  const endStream = (): void => {
    if (window.confirm(t('live.confirmEnd'))) run('stream.stop', { stream: true, record: true });
  };

  if (!st) return null;
  return (
    <section
      aria-label={t('console.title')}
      className="flex h-full min-h-0 flex-col bg-[var(--surface-1)]"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--hairline)] px-3">
        <Radio size={16} className="text-[var(--tally-program)]" />
        <Typography as="h2" size={14} weight="semibold" tone="primary" className="flex-1">
          {t('console.title')}
        </Typography>
        <StatusPill s={s} />
        {mode === 'docked' ? (
          <>
            <IconButton
              size="xs"
              aria-label={t('console.popOut')}
              onClick={() => run('liveConsole.open', { open: true })}
            >
              <ExternalLink size={14} />
            </IconButton>
            <IconButton
              size="xs"
              aria-label={t('console.close')}
              onClick={() => useStore.setState({ liveConsole: 'closed' })}
            >
              <X size={14} />
            </IconButton>
          </>
        ) : (
          <IconButton
            size="xs"
            aria-label={t('console.dock')}
            onClick={() => run('liveConsole.open', { open: false })}
          >
            <PanelRightClose size={14} />
          </IconButton>
        )}
      </header>
      {s && s.available && <StatsStrip s={s} />}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Going live and recording. */}
        <div className="flex flex-col gap-2 px-4 py-3.5">
          {s && !s.available ? (
            <Typography as="p" size={12} tone="secondary" leading="snug">
              {t('live.noFfmpeg')}
            </Typography>
          ) : (
            <div className="flex gap-2">
              {s?.streaming ? (
                <Button
                  size="md"
                  variant="live"
                  className="flex-1"
                  icon={<Square size={14} fill="currentColor" />}
                  onClick={endStream}
                >
                  {t('live.end')}
                </Button>
              ) : (
                <Button
                  size="md"
                  variant="live"
                  className="flex-1"
                  icon={<Radio size={15} />}
                  disabled={!enabled.length}
                  title={enabled.length ? undefined : t('live.noDestinations')}
                  onClick={goLive}
                >
                  {t('live.goLive')}
                </Button>
              )}
              {s?.recording ? (
                <Button
                  size="md"
                  variant="subtle"
                  icon={<Square size={13} fill="currentColor" />}
                  onClick={() => run('stream.stop', { record: true })}
                >
                  {t('live.stopRecording')}
                </Button>
              ) : (
                <Button
                  size="md"
                  variant="subtle"
                  icon={<Circle size={13} fill="var(--tally-program)" strokeWidth={0} />}
                  onClick={() => run('stream.start', { record: true })}
                >
                  {t('live.record')}
                </Button>
              )}
            </div>
          )}
          {s?.error && s.error !== 'reconnecting' && (
            <Typography
              as="p"
              size={12}
              tone="inherit"
              leading="snug"
              className="text-[var(--tally-program)]"
            >
              {t(`live.errors.${s.error}`)}
            </Typography>
          )}
        </div>

        {/* The real picture going out. */}
        <div className="px-4 pb-3.5">
          <div
            className={`relative aspect-video w-full overflow-hidden rounded-[8px] bg-black ${s?.streaming ? 'shadow-[0_0_0_2px_var(--tally-program)]' : 'shadow-[0_0_0_1px_var(--hairline-strong)]'}`}
          >
            {preview ? (
              <img src={preview} alt={t('live.preview')} className="h-full w-full object-contain" />
            ) : (
              <Typography
                as="div"
                size={12}
                tone="muted"
                leading="snug"
                className="absolute inset-0 flex items-center justify-center px-8 text-center"
              >
                {running
                  ? t('live.starting')
                  : canReady
                    ? t('console.previewOff')
                    : t('console.previewLight')}
              </Typography>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Typography size={12} tone="secondary">
              {t('console.showBefore')}
            </Typography>
            <Switch
              label={t('console.showBefore')}
              checked={showReady && canReady}
              disabled={!canReady}
              onChange={toggleReady}
            />
          </div>
        </div>

        <PicturePanel st={st} />
        <SoundPanel />
        <DestinationsPanel s={s} st={st} />
        {s && <HealthPanel s={s} />}

        {s?.recordingPath && (
          <Section title={t('console.recordingTitle')}>
            <div className="flex items-center gap-2">
              <Typography size={12} tone="primary" truncate className="min-w-0 flex-1">
                {s.recordingPath.split(/[\\/]/).pop()}
              </Typography>
              <Typography size={12} tone="muted" tabular>
                {formatBytes(s.recordingBytes)}
              </Typography>
              <IconButton
                size="xs"
                aria-label={t('live.openRecordings')}
                onClick={() => void q('recording.reveal', { path: s.recordingPath })}
              >
                <FolderOpen size={14} />
              </IconButton>
            </div>
          </Section>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-1 border-t border-[var(--hairline)] px-3 py-2">
        <CheckComputer showResult={false} />
        <span className="flex-1" />
        <IconButton
          size="sm"
          aria-label={t('live.openRecordings')}
          onClick={() => void q('recording.reveal', { path: s?.recordingPath ?? null })}
        >
          <FolderOpen size={15} />
        </IconButton>
        {mode === 'docked' && (
          <IconButton
            size="sm"
            aria-label={t('console.popOut')}
            onClick={() => run('liveConsole.open', { open: true })}
          >
            <PictureInPicture2 size={15} />
          </IconButton>
        )}
        <IconButton
          size="sm"
          aria-label={t('live.settings')}
          onClick={() => openDialog('settings', { settingsPage: 'streaming' })}
        >
          <Settings2 size={15} />
        </IconButton>
      </footer>
    </section>
  );
}

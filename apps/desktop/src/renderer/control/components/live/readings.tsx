import { Gauge } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ENCODER_SHORT_NAMES, formatClock, secondsSince } from '@lampstand/core';
import type { StreamStatus } from '@lampstand/ipc-contract';
import { Button, Typography } from '@lampstand/ui';
import { useNow } from '../../lib/hooks';
import { formatBytes, run, Section } from './consoleParts';
import { Sparkline } from './Sparkline';

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

/** Off air, Ready, Starting, Live or Recording, with the time on air. */
export function StatusPill({ s }: { s: StreamStatus | null }) {
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

/** "VideoToolbox", "NVENC"… for the stats strip. */
const ENCODER_NAMES: Record<string, string> = ENCODER_SHORT_NAMES;

type Tone = 'ok' | 'warn' | 'bad' | 'plain';
const TONE: Record<Tone, string> = {
  ok: 'text-[var(--tally-preview)]',
  warn: 'text-[var(--accent)]',
  bad: 'text-[var(--tally-program)]',
  plain: 'text-[var(--text-2)]',
};

/** A row of short readings, each explained on hover, separated by dots. */
function Readings({
  items,
  label,
  className = '',
}: {
  items: { text: string; help: string; tone?: Tone }[];
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex min-w-0 items-center gap-1.5 ${className}`}
    >
      {items.map((r, i) => (
        <span key={r.help} className="flex items-center gap-1.5">
          {i > 0 && (
            <Typography aria-hidden size={11} tone="muted">
              ·
            </Typography>
          )}
          <Typography
            size={11}
            weight="semibold"
            tone="inherit"
            tabular
            title={r.help}
            className={`cursor-help whitespace-nowrap ${TONE[r.tone ?? 'plain']}`}
          >
            {r.text}
          </Typography>
        </span>
      ))}
    </div>
  );
}

const fpsTone = (s: StreamStatus): Tone =>
  s.fps === 0
    ? 'plain'
    : s.fps >= s.profile.fps * 0.95
      ? 'ok'
      : s.fps >= s.profile.fps * 0.8
        ? 'warn'
        : 'bad';
/** The sending delay: fine under a second, a worry past 2.5 s (the upload isn't keeping up). */
const delayTone = (ms: number): Tone => (ms > 2500 ? 'bad' : ms > 1000 ? 'warn' : 'plain');
const speedTone = (s: StreamStatus): Tone =>
  s.speed === 0 ? 'plain' : s.speed >= 0.97 ? 'ok' : s.speed >= 0.9 ? 'warn' : 'bad';

/**
 * The few readings that matter at a glance, beside the status: while running, frame rate,
 * encoder speed, the computer's load and any dropped frames; before, just the size it will use.
 */
export function HeaderReadings({ s }: { s: StreamStatus }) {
  const { t } = useTranslation();
  const p = s.profile;
  const running = s.state !== 'idle' && s.state !== 'stopping';
  const load = s.health ? s.health.appCpu + (s.health.encoderCpu ?? 0) : null;
  const items = running
    ? [
        {
          text: `${Math.round(s.fps)} fps`,
          help: t('console.help.fps', { target: p.fps }),
          tone: fpsTone(s),
        },
        {
          text: s.speed > 0 ? `${s.speed.toFixed(2)}×` : '—',
          help: t('console.help.speed'),
          tone: speedTone(s),
        },
        ...(s.delayMs !== null
          ? [
              {
                text: `${(s.delayMs / 1000).toFixed(1)} s`,
                help: t('console.help.delay'),
                tone: delayTone(s.delayMs),
              },
            ]
          : []),
        ...(load !== null ? [{ text: `${load}%`, help: t('console.help.load') }] : []),
        ...(s.dropped > 0
          ? [
              {
                text: `−${s.dropped}`,
                help: t('live.dropped', { count: s.dropped }),
                tone: 'warn' as const,
              },
            ]
          : []),
      ]
    : [
        {
          text: `${p.height}p${p.fps}`,
          help: t('console.help.size', { mode: t(`streaming.modes.${p.mode}`) }),
        },
      ];
  return <Readings items={items} label={t('console.stats')} className="shrink overflow-hidden" />;
}

/** Quieter details in the footer: bitrate and the encoder. */
export function FooterReadings({ s }: { s: StreamStatus }) {
  const { t } = useTranslation();
  const running = s.state !== 'idle' && s.state !== 'stopping';
  const kbps = running && s.kbps > 0 ? s.kbps : s.profile.videoKbps;
  return (
    <Readings
      label={t('console.details')}
      className="min-w-0 flex-1 overflow-hidden"
      items={[
        {
          text: `${(kbps / 1000).toFixed(1)} Mb/s`,
          help:
            s.adaptedKbps !== null
              ? t('console.help.bitrateAdapted', {
                  rate: (s.adaptedKbps / 1000).toFixed(1),
                  target: (s.profile.videoKbps / 1000).toFixed(1),
                })
              : t('console.help.bitrate', { target: (s.profile.videoKbps / 1000).toFixed(1) }),
          tone: s.adaptedKbps !== null ? ('warn' as const) : undefined,
        },
        { text: ENCODER_NAMES[s.encoder] ?? s.encoder, help: t('console.help.encoder') },
      ]}
    />
  );
}

/** How it's going: frame rate, bitrate, encoder speed and the computer's load, with history. */
export function HealthPanel({ s }: { s: StreamStatus }) {
  const { t } = useTranslation();
  const h = s.health;
  // In the panel a reading with nothing to say yet is simply fine.
  const statTone = (tone: Tone): 'ok' | 'warn' | 'bad' => (tone === 'plain' ? 'ok' : tone);
  const running = s.state !== 'idle';
  const target = s.profile.fps;
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
      {s.advice && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-[8px] bg-[var(--accent-soft)] px-3 py-2.5 shadow-[inset_3px_0_0_var(--accent)]"
        >
          <Gauge size={16} className="shrink-0 text-[var(--accent)]" />
          <Typography size={12} tone="primary" leading="snug" className="min-w-0 flex-1">
            {s.advice === 'upload'
              ? t('console.adviceUpload', { rate: (s.kbps / 1000).toFixed(1) })
              : s.canLighten
                ? t('console.advice')
                : t('console.adviceLightest')}
          </Typography>
          {s.canLighten && (
            <Button size="xs" variant="primary" onClick={() => run('stream.lighter')}>
              {t('console.switchLight')}
            </Button>
          )}
        </div>
      )}
      {s.canRestore && s.restoreTo && !s.advice && (
        <div className="flex items-center gap-3 rounded-[8px] bg-[var(--surface-1)] px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--hairline)]">
          <Gauge size={16} className="shrink-0 text-[var(--text-3)]" />
          <Typography size={12} tone="primary" leading="snug" className="min-w-0 flex-1">
            {t('console.canRestore')}
          </Typography>
          <Button size="xs" variant="secondary" onClick={() => run('stream.restore')}>
            {t('console.restore', { size: `${s.restoreTo.height}p${s.restoreTo.fps}` })}
          </Button>
        </div>
      )}
      {s.easeOff && running && (
        <Typography as="p" size={11} tone="muted" leading="snug">
          {t('console.easeOff')}
        </Typography>
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
            tone={statTone(fpsTone(s))}
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
            tone={statTone(speedTone(s))}
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

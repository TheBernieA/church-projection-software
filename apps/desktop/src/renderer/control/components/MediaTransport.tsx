import { useEffect, type ReactNode } from 'react';
import { Pause, Play, Repeat, SkipBack, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatClock, mediaEnd, mediaPositionAt, type MediaLayer } from '@lampstand/core';
import { Button, IconButton, Typography } from '@lampstand/ui';
import { cmd } from '../lib/api';
import { useNow } from '../lib/hooks';
import { attempt, useStore } from '../lib/store';
import { mediaUrl } from '../../shared/mediaUrl';
import { hasDuration, setDuration, useKnownDuration } from '../lib/mediaDurations';
import { pct, useDraft } from '../lib/slider';

/**
 * Duration of a library clip: from the library record when known, else read once from the
 * file's metadata (no decoding) and cached. A probe that errors or stalls is retried, so the
 * progress bar never stays disabled because one metadata read went missing.
 */
function useMediaDuration(mediaId: string | undefined): number | undefined {
  const known = useStore((s) =>
    mediaId ? s.media.find((m) => m.id === mediaId)?.durationSec : undefined,
  );
  useEffect(() => {
    if (!mediaId || known || hasDuration(mediaId)) return;
    let cancelled = false;
    let stop = (): void => undefined;
    const attempt = (n: number): void => {
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.muted = true;
      let settled = false;
      const end = (): void => {
        settled = true;
        clearTimeout(timer);
        probe.removeAttribute('src');
        probe.load();
      };
      const read = (): void => {
        if (settled || !Number.isFinite(probe.duration) || probe.duration <= 0) return;
        setDuration(mediaId, probe.duration);
        end();
      };
      const retry = (): void => {
        if (settled) return;
        end();
        if (!cancelled && n < 3) attempt(n + 1);
      };
      probe.addEventListener('loadedmetadata', read);
      probe.addEventListener('durationchange', read);
      probe.addEventListener('error', retry);
      const timer = setTimeout(retry, 4000);
      stop = end;
      probe.src = mediaUrl(mediaId);
    };
    attempt(1);
    return () => {
      cancelled = true;
      stop();
    };
  }, [mediaId, known]);
  return useKnownDuration(mediaId, known);
}

/** Ticking playhead derived from the shared playback state (same maths as the outputs). */
function usePlayhead(media: MediaLayer | null, duration: number | undefined): number {
  const now = useNow(250, !!media?.playing);
  // A tick older than the latest restart/seek counts as zero elapsed, so the new position
  // shows at once rather than waiting for the next tick.
  return media ? mediaPositionAt(media, now, duration) : 0;
}

const sendMedia = (payload: Record<string, unknown>): void =>
  void attempt(() => cmd('live.media', payload));

/** Circular-arrow "skip 15 s" glyph (back or forward), drawn in the icon's current colour. */
function SkipIcon({ dir, seconds }: { dir: 'back' | 'forward'; seconds: number }) {
  const back = dir === 'back';
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        {back ? (
          <>
            <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" />
            <path d="M3.5 3.5v5h5" />
          </>
        ) : (
          <>
            <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1l2.6 2.6" />
            <path d="M20.5 3.5v5h-5" />
          </>
        )}
      </g>
      <text
        x="12"
        y="15.6"
        textAnchor="middle"
        fontSize="8.5"
        fontWeight="700"
        fill="currentColor"
        fontFamily="var(--font-ui)"
      >
        {seconds}
      </text>
    </svg>
  );
}

/** "Jump to the last 10 seconds" glyph: −10 over an arrow running into a stop line. */
function LastSecondsIcon({ seconds }: { seconds: number }) {
  return (
    <svg width="19" height="18" viewBox="0 0 26 24" fill="none" aria-hidden>
      <text
        x="11"
        y="9"
        textAnchor="middle"
        fontSize="8.5"
        fontWeight="700"
        fill="currentColor"
        fontFamily="var(--font-ui)"
      >
        −{seconds}
      </text>
      <g stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 16h16M15 12l4 4-4 4M22.5 11.5v9" />
      </g>
    </svg>
  );
}

/** A transport button: round, quiet, brightening on hover. */
function TransportButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <IconButton
      size="xs"
      variant="quiet"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="!rounded-full !text-[var(--text-2)] hover:!text-[var(--text-1)]"
    >
      {children}
    </IconButton>
  );
}

const SKIP = 15;
const LAST = 10;

/**
 * Compact video transport under the monitor (two slim rows): play/pause, the clip's name, loop
 * and volume; then restart, skip back/forward 15 s and jump to the last 10 s around a scrubber
 * with elapsed and remaining time. Every output follows the same shared timeline, so projector
 * and stage stay in sync.
 */
export function MediaTransport({
  media,
  target = 'program',
  switcher,
}: {
  media: MediaLayer | null;
  /** Control the video on screen, or the one waiting in Preview (silent, only you see it). */
  target?: 'program' | 'preview';
  /** Live / Preview switch, when both have a video. */
  switcher?: ReactNode;
}) {
  const { t } = useTranslation();
  const send = (payload: Record<string, unknown>): void => sendMedia({ ...payload, target });
  const item = useStore((s) => (media ? s.media.find((m) => m.id === media.mediaId) : undefined));
  const name = item?.name;
  const duration = useMediaDuration(media?.mediaId);
  const playhead = usePlayhead(media, duration);
  const scrub = useDraft(media?.syncedAt, (position) => send({ action: 'seek', position }));
  const volume = useDraft(media?.volume, (v) => send({ action: 'set', volume: v }));
  const idle = !media;
  const shown = scrub.draft ?? playhead;
  // Trimmed clips end (and count down) to their out-point, not the file's end.
  const end = media ? mediaEnd(media, duration) : undefined;
  const ended = !!media && !media.loop && end !== undefined && playhead >= end - 0.05;
  const playing = !!media?.playing && !ended;
  const remaining = end !== undefined ? Math.max(0, end - shown) : undefined;
  const ending = playing && remaining !== undefined && remaining <= LAST;
  const vol = volume.draft ?? media?.volume ?? 1;
  const seek = (to: number): void =>
    send({ action: 'seek', position: Math.max(0, Math.min(to, (duration ?? to) - 0.05)) });

  return (
    <div
      role="group"
      aria-label={t('media.transport')}
      className={`flex flex-col gap-1 rounded-[8px] bg-[var(--surface-0)] px-2 py-1.5 shadow-[inset_0_0_0_1px_var(--hairline)] ${idle ? 'opacity-80' : ''}`}
    >
      {switcher}
      {/* Play; what's playing, elapsed and time left; loop and volume. */}
      <div className="flex items-center gap-2">
        <Button
          variant="bare"
          disabled={idle}
          aria-label={playing ? t('media.pause') : t('media.play')}
          title={playing ? t('media.pause') : t('media.play')}
          onClick={() => send({ action: ended ? 'restart' : 'toggle' })}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--text-1)] text-[var(--surface-0)] transition-[filter,transform] duration-[var(--dur-fast)] hover:brightness-110 active:scale-95 disabled:opacity-40 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          {playing ? (
            <Pause size={14} fill="currentColor" strokeWidth={0} />
          ) : (
            <Play size={14} fill="currentColor" strokeWidth={0} className="translate-x-px" />
          )}
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5" title={name}>
            {playing && (
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--tally-program)] shadow-[0_0_6px_var(--tally-program)]"
              />
            )}
            <Typography size={12} weight="medium" truncate tone={idle ? 'muted' : 'primary'}>
              {name ?? t('media.noVideo')}
            </Typography>
          </div>
          <Typography as="p" size={10} tone="muted" tabular truncate>
            {idle ? (
              t('media.noVideoHint')
            ) : (
              <>
                {formatClock(shown)}
                {remaining !== undefined && (
                  <Typography
                    size={10}
                    tabular
                    tone={ending ? 'inherit' : 'muted'}
                    className={ending ? 'text-[var(--tally-program)]' : ''}
                  >
                    {` · −${formatClock(Math.ceil(remaining))}`}
                  </Typography>
                )}
                {target === 'preview' && ` · ${t('media.previewHint')}`}
              </>
            )}
          </Typography>
        </div>
        <IconButton
          size="2xs"
          variant="quiet"
          disabled={idle}
          aria-label={t('media.loop')}
          aria-pressed={!!media?.loop}
          active={!!media?.loop}
          onClick={() => send({ action: 'set', loop: !media?.loop })}
        >
          <Repeat size={13} />
        </IconButton>
        <IconButton
          size="2xs"
          variant="quiet"
          disabled={idle}
          aria-label={media?.muted ? t('media.unmute') : t('media.mute')}
          aria-pressed={!!media?.muted}
          onClick={() => send({ action: 'set', muted: !media?.muted })}
          className={media?.muted ? '!text-[var(--tally-program)]' : ''}
        >
          {media?.muted || vol === 0 ? (
            <VolumeX size={14} />
          ) : vol < 0.5 ? (
            <Volume1 size={14} />
          ) : (
            <Volume2 size={14} />
          )}
        </IconButton>
        <input
          type="range"
          aria-label={t('media.volume')}
          min={0}
          max={1}
          step={0.05}
          disabled={idle}
          value={vol}
          {...volume.props}
          style={pct(vol, 1)}
          className="ls-range w-14 shrink-0"
        />
      </div>

      {/* Restart and skip back, the scrubber, skip on. */}
      <div className="flex items-center gap-0.5">
        <TransportButton
          label={t('media.restart')}
          disabled={idle}
          onClick={() => send({ action: 'restart' })}
        >
          <SkipBack size={13} fill="currentColor" />
        </TransportButton>
        <TransportButton
          label={t('media.back', { count: SKIP })}
          disabled={idle}
          onClick={() => seek(shown - SKIP)}
        >
          <SkipIcon dir="back" seconds={SKIP} />
        </TransportButton>
        <input
          type="range"
          aria-label={t('media.position')}
          min={0}
          max={duration ?? 0}
          step={0.1}
          disabled={!duration}
          value={Math.min(shown, duration ?? 0)}
          {...scrub.props}
          style={{
            ...pct(Math.min(shown, duration ?? 0), duration ?? 0),
            ...(ending ? { '--fill': 'var(--tally-program)' } : {}),
          }}
          className="ls-range mx-2 min-w-0 flex-1"
        />
        <TransportButton
          label={t('media.forward', { count: SKIP })}
          disabled={idle || !duration}
          onClick={() => seek(shown + SKIP)}
        >
          <SkipIcon dir="forward" seconds={SKIP} />
        </TransportButton>
        <TransportButton
          label={t('media.lastSeconds', { count: LAST })}
          disabled={idle || !duration}
          onClick={() => seek((duration ?? 0) - LAST)}
        >
          <LastSecondsIcon seconds={LAST} />
        </TransportButton>
      </div>
      {name && <span className="sr-only">{name}</span>}
    </div>
  );
}

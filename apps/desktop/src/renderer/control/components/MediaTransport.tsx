import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Film, Pause, Play, Repeat, SkipBack, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatClock, mediaEnd, mediaPositionAt, type MediaLayer } from '@lampstand/core';
import { Button, IconButton, Typography } from '@lampstand/ui';
import { cmd } from '../lib/api';
import { useNow } from '../lib/hooks';
import { attempt, useStore } from '../lib/store';
import { mediaUrl, thumbUrl } from '../../shared/mediaUrl';
import { durations } from '../lib/mediaDurations';

/**
 * Duration of a library clip: from the library record when known, else read once from the
 * file's metadata (no decoding) and cached. A probe that errors or stalls is retried, so the
 * progress bar never stays disabled because one metadata read went missing.
 */
function useMediaDuration(mediaId: string | undefined): number | undefined {
  const known = useStore((s) =>
    mediaId ? s.media.find((m) => m.id === mediaId)?.durationSec : undefined,
  );
  // Bumped when a probe succeeds, to re-read the module-level cache.
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!mediaId || known || durations.has(mediaId)) return;
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
        durations.set(mediaId, probe.duration);
        end();
        if (!cancelled) setVersion((v) => v + 1);
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
  return known ?? (mediaId ? durations.get(mediaId) : undefined);
}

/** Ticking playhead derived from the shared playback state (same maths as the outputs). */
function usePlayhead(media: MediaLayer | null, duration: number | undefined): number {
  const now = useNow(250, !!media?.playing);
  // A tick older than the latest restart/seek counts as zero elapsed, so the new position
  // shows at once rather than waiting for the next tick.
  return media ? mediaPositionAt(media, now, duration) : 0;
}

/**
 * A slider value held locally while the operator drags, committed exactly once when they let
 * go: on the native `change` event, which the browser fires once per drag (on release, even
 * off the slider) and once per arrow key. React's `onChange` is really `input`, so it only
 * updates the draft.
 *
 * The draft is tagged with the playback state it was made against. It keeps showing the
 * dropped position until the commit comes back as new shared state, then gives way to the
 * real playhead; no snap back to the old position, and never stuck.
 */
function useDraft(resetKey: unknown, commit: (value: number) => void) {
  const [held, setHeld] = useState<{ key: unknown; value: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(commit);
  useEffect(() => {
    latest.current = commit;
  });
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const onCommit = (): void => latest.current(Number(el.value));
    el.addEventListener('change', onCommit);
    return () => el.removeEventListener('change', onCommit);
  }, []);
  const draft = held && held.key === resetKey ? held.value : null;
  return {
    draft,
    props: {
      ref: input,
      onChange: (e: ChangeEvent<HTMLInputElement>) =>
        setHeld({ key: resetKey, value: Number(e.target.value) }),
    },
  };
}

const sendMedia = (payload: Record<string, unknown>): void =>
  void attempt(() => cmd('live.media', payload));

/** Circular-arrow "skip 15 s" glyph (back or forward), drawn in the icon's current colour. */
function SkipIcon({ dir, seconds }: { dir: 'back' | 'forward'; seconds: number }) {
  const back = dir === 'back';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
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
    <svg width="24" height="22" viewBox="0 0 26 24" fill="none" aria-hidden>
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
      size="sm"
      variant="quiet"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="!rounded-full !text-[var(--text-2)] hover:!text-[var(--text-1)]"
    >
      {children}
    </IconButton>
  );
}

const pct = (value: number, max: number): CSSProperties =>
  ({ '--pct': `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }) as CSSProperties;

const SKIP = 15;
const LAST = 10;

/**
 * Media transport under the monitor (§12), always there like a deck's transport: the clip's
 * thumbnail and name, a scrubber with elapsed and remaining time, skip back/forward 15 s, a
 * large play/pause, jump to the last 10 s, restart, loop and volume. Every output follows the
 * same shared timeline, so projector and stage stay in sync. With no video live it rests,
 * dimmed, saying so.
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
      className={`flex flex-col gap-1.5 rounded-[10px] bg-[var(--surface-0)] px-3 pb-2 pt-2.5 shadow-[inset_0_0_0_1px_var(--hairline),var(--highlight-top)] ${idle ? 'opacity-80' : ''}`}
    >
      {switcher}
      {/* What's playing, and its volume. */}
      <div className="flex items-center gap-2.5">
        <div className="relative flex aspect-video w-11 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-black shadow-[0_0_0_1px_var(--hairline-strong)]">
          {media && item?.hasThumbnail ? (
            <img src={thumbUrl(media.mediaId)} alt="" className="h-full w-full object-cover" />
          ) : media ? (
            // No stored thumbnail: show the clip's own first frame.
            <video
              src={`${mediaUrl(media.mediaId)}#t=0.1`}
              muted
              preload="metadata"
              aria-hidden
              className="h-full w-full object-cover"
            />
          ) : (
            <Typography tone="muted" className="flex">
              <Film size={13} />
            </Typography>
          )}
          {playing && (
            <span
              aria-hidden
              className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-[var(--tally-program)] shadow-[0_0_6px_var(--tally-program)]"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <Typography as="p" size={12} weight="medium" truncate tone={idle ? 'muted' : 'primary'}>
            {name ?? t('media.noVideo')}
          </Typography>
          <Typography as="p" size={11} tone="muted" truncate>
            {idle
              ? t('media.noVideoHint')
              : target === 'preview'
                ? t('media.previewHint')
                : [
                    t('media.video'),
                    media.loop ? t('media.looping') : null,
                    media.muted ? t('media.muted') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
          </Typography>
        </div>
        <IconButton
          size="xs"
          variant="quiet"
          disabled={idle}
          aria-label={media?.muted ? t('media.unmute') : t('media.mute')}
          aria-pressed={!!media?.muted}
          onClick={() => send({ action: 'set', muted: !media?.muted })}
          className={media?.muted ? '!text-[var(--tally-program)]' : ''}
        >
          {media?.muted || vol === 0 ? (
            <VolumeX size={15} />
          ) : vol < 0.5 ? (
            <Volume1 size={15} />
          ) : (
            <Volume2 size={15} />
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
          className="ls-range w-16 shrink-0"
        />
      </div>

      {/* Scrubber: elapsed on the left, time left on the right. */}
      <div>
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
          className="ls-range block w-full"
        />
        <div className="flex justify-between">
          <Typography size={10} tone="muted" tabular>
            {media ? formatClock(shown) : '--:--'}
          </Typography>
          <Typography
            size={10}
            tabular
            tone={ending ? 'inherit' : 'muted'}
            className={ending ? 'text-[var(--tally-program)]' : ''}
          >
            {remaining !== undefined && media ? `−${formatClock(Math.ceil(remaining))}` : '--:--'}
          </Typography>
        </div>
      </div>

      {/* Transport. */}
      <div className="flex items-center justify-between">
        <IconButton
          size="xs"
          variant="quiet"
          disabled={idle}
          aria-label={t('media.loop')}
          aria-pressed={!!media?.loop}
          active={!!media?.loop}
          onClick={() => send({ action: 'set', loop: !media?.loop })}
        >
          <Repeat size={14} />
        </IconButton>
        <div className="flex items-center gap-1">
          <TransportButton
            label={t('media.restart')}
            disabled={idle}
            onClick={() => send({ action: 'restart' })}
          >
            <SkipBack size={16} fill="currentColor" />
          </TransportButton>
          <TransportButton
            label={t('media.back', { count: SKIP })}
            disabled={idle}
            onClick={() => seek(shown - SKIP)}
          >
            <SkipIcon dir="back" seconds={SKIP} />
          </TransportButton>
          <Button
            variant="bare"
            disabled={idle}
            aria-label={playing ? t('media.pause') : t('media.play')}
            title={playing ? t('media.pause') : t('media.play')}
            onClick={() => send({ action: ended ? 'restart' : 'toggle' })}
            className="mx-1 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--text-1)] text-[var(--surface-0)] shadow-[0_2px_10px_rgba(0,0,0,0.45)] transition-[transform,filter] duration-[var(--dur-fast)] hover:brightness-110 active:scale-95 disabled:opacity-40 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            {playing ? (
              <Pause size={17} fill="currentColor" strokeWidth={0} />
            ) : (
              <Play size={17} fill="currentColor" strokeWidth={0} className="translate-x-px" />
            )}
          </Button>
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
        {/* Balances the loop button so the transport sits in the middle. */}
        <span aria-hidden className="w-7" />
      </div>
      {name && <span className="sr-only">{name}</span>}
    </div>
  );
}

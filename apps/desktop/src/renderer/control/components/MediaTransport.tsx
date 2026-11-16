import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Pause, Play, Repeat, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatClock, mediaPositionAt, type MediaLayer } from '@lampstand/core';
import { IconButton } from '@lampstand/ui';
import { cmd } from '../lib/api';
import { useNow } from '../lib/hooks';
import { attempt, useStore } from '../lib/store';
import { mediaUrl } from '../../shared/mediaUrl';

const durations = new Map<string, number>();

/**
 * Duration of a library clip: from the library record when known, else read once from the
 * file's metadata (no decoding) and cached. A probe that errors or stalls is retried, so the
 * progress bar never stays disabled because one metadata read went missing.
 */
function useMediaDuration(mediaId: string): number | undefined {
  const known = useStore((s) => s.media.find((m) => m.id === mediaId)?.durationSec);
  // Bumped when a probe succeeds, to re-read the module-level cache.
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (known || durations.has(mediaId)) return;
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
  return known ?? durations.get(mediaId);
}

/** Ticking playhead derived from the shared playback state (same maths as the outputs). */
function usePlayhead(media: MediaLayer, duration: number | undefined): number {
  const now = useNow(250, media.playing);
  // A tick older than the latest restart/seek counts as zero elapsed, so the new position
  // shows at once rather than waiting for the next tick.
  return mediaPositionAt(media, now, duration);
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

const send = (payload: Record<string, unknown>): void =>
  void attempt(() => cmd('live.media', payload));

/**
 * Transport for the live video (§12): play/pause, restart, scrub, loop, mute and volume.
 * Every output follows the same shared timeline, so projector and stage stay in sync.
 */
export function MediaTransport({ media }: { media: MediaLayer }) {
  const { t } = useTranslation();
  const name = useStore((s) => s.media.find((m) => m.id === media.mediaId)?.name);
  const duration = useMediaDuration(media.mediaId);
  const playhead = usePlayhead(media, duration);
  const scrub = useDraft(media.syncedAt, (position) => send({ action: 'seek', position }));
  const volume = useDraft(media.volume, (v) => send({ action: 'set', volume: v }));
  const shown = scrub.draft ?? playhead;
  const ended = !media.loop && duration !== undefined && playhead >= duration - 0.05;

  const playPause = (
    <IconButton
      size="sm"
      variant="subtle"
      aria-label={media.playing && !ended ? t('media.pause') : t('media.play')}
      onClick={() => send({ action: ended ? 'restart' : 'toggle' })}
    >
      {media.playing && !ended ? (
        <Pause size={15} fill="currentColor" />
      ) : (
        <Play size={15} fill="currentColor" />
      )}
    </IconButton>
  );
  // Two rows so the progress bar always gets the full width, even in a narrow column.
  return (
    <div
      className="flex flex-col gap-1 rounded-[8px] bg-[var(--surface-0)] px-2 py-1.5 shadow-[inset_0_0_0_1px_var(--hairline)]"
      role="group"
      aria-label={t('media.transport')}
    >
      <div className="flex items-center gap-2">
        <span className="tnum w-10 text-right text-ui-11 text-[var(--text-2)]">
          {formatClock(shown)}
        </span>
        <input
          type="range"
          aria-label={t('media.position')}
          min={0}
          max={duration ?? 0}
          step={0.1}
          disabled={!duration}
          value={Math.min(shown, duration ?? 0)}
          {...scrub.props}
          className="h-1.5 min-w-0 flex-1 accent-[var(--tally-program)]"
        />
        <span className="tnum w-10 text-ui-11 text-[var(--text-3)]">
          {duration ? formatClock(duration) : '--:--'}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {playPause}
        <IconButton
          size="sm"
          aria-label={t('media.restart')}
          onClick={() => send({ action: 'restart' })}
        >
          <RotateCcw size={15} />
        </IconButton>
        <IconButton
          size="sm"
          aria-label={t('media.loop')}
          aria-pressed={media.loop}
          active={media.loop}
          onClick={() => send({ action: 'set', loop: !media.loop })}
        >
          <Repeat size={15} />
        </IconButton>
        <IconButton
          size="sm"
          className="ml-auto"
          aria-label={media.muted ? t('media.unmute') : t('media.mute')}
          aria-pressed={media.muted}
          onClick={() => send({ action: 'set', muted: !media.muted })}
        >
          {media.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </IconButton>
        <input
          type="range"
          aria-label={t('media.volume')}
          min={0}
          max={1}
          step={0.05}
          value={volume.draft ?? media.volume}
          {...volume.props}
          className="h-1.5 w-20 accent-[var(--accent)]"
        />
      </div>
      {name && <span className="sr-only">{name}</span>}
    </div>
  );
}

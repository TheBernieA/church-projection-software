import type { MediaLayer } from '../schemas/scene';

/**
 * Where a live video should be right now, in seconds. Every output and the operator's transport
 * compute this from the same shared state, so they agree without streaming time updates.
 * `duration` (when known) clamps a finished video, or wraps a looping one.
 */
export function mediaPositionAt(media: MediaLayer, nowMs: number, duration?: number): number {
  const elapsed =
    media.playing && media.syncedAt ? Math.max(0, (nowMs - Date.parse(media.syncedAt)) / 1000) : 0;
  const pos = media.position + elapsed;
  if (!duration || !Number.isFinite(duration) || duration <= 0) return pos;
  return media.loop ? pos % duration : Math.min(pos, duration);
}

/** Start a media layer playing from the beginning, stamped with the time it went live. */
export function startMedia(media: MediaLayer, nowIso: string): MediaLayer {
  return { ...media, playing: true, position: 0, syncedAt: nowIso };
}

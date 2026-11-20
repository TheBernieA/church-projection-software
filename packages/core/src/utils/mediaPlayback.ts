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
  const end = mediaEnd(media, duration);
  if (end === undefined) return pos;
  const start = mediaStart(media);
  if (!media.loop) return Math.min(pos, end);
  const span = end - start;
  return span > 0 && pos > start ? start + ((pos - start) % span) : pos;
}

/** Where playback begins (the in-point, or 0). */
export const mediaStart = (media: MediaLayer): number => media.start ?? 0;

/** Where playback stops: the out-point if set (and before the file's end), else the file's end. */
export function mediaEnd(media: MediaLayer, duration?: number): number | undefined {
  const known = duration !== undefined && Number.isFinite(duration) && duration > 0;
  if (media.end !== undefined && media.end > mediaStart(media))
    return known ? Math.min(media.end, duration) : media.end;
  return known ? duration : undefined;
}

/**
 * How visible/loud the clip is at `pos`, 0–1, from its fade in and fade out. Every output and
 * the monitors use the same curve, so they fade together.
 */
export function mediaFadeAt(media: MediaLayer, pos: number, duration?: number): number {
  let a = 1;
  const start = mediaStart(media);
  if (media.fadeIn) a = Math.min(a, Math.max(0, (pos - start) / media.fadeIn));
  const end = mediaEnd(media, duration);
  if (media.fadeOut && end !== undefined) a = Math.min(a, Math.max(0, (end - pos) / media.fadeOut));
  return a;
}

/** Start a media layer from its in-point, stamped with the time it went live. */
export function startMedia(media: MediaLayer, nowIso: string): MediaLayer {
  return { ...media, playing: true, position: mediaStart(media), syncedAt: nowIso };
}

import {
  mediaEnd,
  mediaFadeAt,
  mediaPositionAt,
  mediaStart,
  type BackgroundLayer,
  type MediaLayer,
} from '@lampstand/core';
import { el, loop, safePlay, trySetSink } from './dom';
import { backgroundFilter, gradientCss, scrimCss } from './style';
import { buildGenerated } from './generated';
import { FILL } from './constants';
import { type MediaResolver, type RenderMode } from './types';

/** Build a background element. Videos loop seamlessly and keep playing across slide changes. */
export function buildBackground(
  doc: Document,
  bg: BackgroundLayer,
  media: MediaResolver,
  mode: RenderMode,
): HTMLElement {
  const wrap = el(doc, 'div', 'ls-bg', { ...FILL, overflow: 'hidden', willChange: 'opacity' });
  const ref = bg.ref;
  let inner: HTMLElement | null = null;
  switch (ref.kind) {
    case 'none':
      break;
    case 'color':
      inner = el(doc, 'div', '', { ...FILL, background: ref.color });
      break;
    case 'gradient':
      inner = el(doc, 'div', '', { ...FILL, background: gradientCss(ref) });
      break;
    case 'image': {
      const img = el(doc, 'img', '', { ...FILL, objectFit: 'cover' });
      img.src = media.mediaUrl(ref.mediaId);
      img.alt = '';
      img.decoding = 'async';
      if (ref.kenBurns && mode !== 'thumbnail')
        loop(img, [{ transform: 'scale(1)' }, { transform: 'scale(1.08) translate(-1%, -1%)' }], {
          duration: 30000,
          direction: 'alternate',
          easing: 'ease-in-out',
        });
      inner = img;
      break;
    }
    case 'video': {
      const v = el(doc, 'video', '', { ...FILL, objectFit: 'cover' });
      // Read with permission (CORS), so its sound can join a mixer when it's switched on.
      v.crossOrigin = 'anonymous';
      v.muted = true; // syncBackgroundSound unmutes it where the room's sound plays
      v.loop = ref.loop;
      v.playsInline = true;
      v.src = media.mediaUrl(ref.mediaId);
      if (mode === 'thumbnail') v.preload = 'metadata';
      else {
        v.autoplay = true;
        v.playbackRate = ref.playbackRate ?? 1;
        safePlay(v);
      }
      inner = v;
      break;
    }
    case 'generated':
      inner = buildGenerated(doc, ref.preset, ref.colors, ref.speed ?? 1, mode !== 'thumbnail');
      break;
  }
  if (inner) {
    const filter = backgroundFilter(bg.adjust);
    if (filter) inner.style.filter = filter;
    wrap.append(inner);
  }
  if (bg.adjust?.tint && bg.adjust.tint.opacity > 0)
    wrap.append(
      el(doc, 'div', 'ls-bg-tint', {
        ...FILL,
        background: bg.adjust.tint.color,
        opacity: String(bg.adjust.tint.opacity),
      }),
    );
  if (bg.adjust?.dim)
    wrap.append(el(doc, 'div', '', { ...FILL, background: `rgba(0,0,0,${bg.adjust.dim})` }));
  syncScrim(doc, wrap, bg);
  return wrap;
}

/**
 * The readability overlay over a background (its last layer): added, changed or removed in
 * place, so changing it never rebuilds the background (a video keeps playing).
 */
export function syncScrim(doc: Document, wrap: HTMLElement, bg: BackgroundLayer | null): void {
  const scrim = bg?.adjust?.scrim;
  let layer = wrap.querySelector<HTMLElement>(':scope > .ls-bg-scrim');
  if (!scrim || scrim.strength <= 0) {
    layer?.remove();
    return;
  }
  if (!layer) {
    layer = el(doc, 'div', 'ls-bg-scrim', { ...FILL });
    wrap.append(layer);
  }
  layer.style.background = scrimCss(scrim);
}

/** Send a video's sound to `sinkId` (the room output), where the engine can (not in jsdom). */
function routeSound(v: HTMLMediaElement, sinkId: string): void {
  const routed = v as HTMLMediaElement & { lsSink?: string };
  if (routed.lsSink === sinkId) return;
  routed.lsSink = sinkId;
  trySetSink(v, sinkId);
}

/**
 * A background video's sound: heard only when it's switched on for that background and this
 * renderer plays the room's sound (the main output, or the Program monitor with no output),
 * through the same mix and room output as a media video.
 */
export function syncBackgroundSound(
  node: HTMLElement,
  bg: BackgroundLayer | null,
  mode: RenderMode,
  audio: boolean,
  sinkId = '',
  tap?: (v: HTMLMediaElement) => void,
): void {
  const v = node.querySelector('video');
  if (!v || mode === 'thumbnail') return;
  const on = audio && bg?.ref.kind === 'video' && !!bg.ref.sound;
  if (on) {
    if (tap) tap(v);
    routeSound(v, sinkId);
  }
  v.muted = !on;
}

/**
 * Identity of a media layer: *which* clip, not where it is. Playback changes (pause, seek,
 * volume…) keep the same element and are applied by {@link syncMedia} — rebuilding would restart it.
 */
export function mediaKey(m: MediaLayer | null): string {
  return m ? `${m.mediaId}|${m.kind}|${m.fit}` : 'none';
}

/** Bring a live video element in line with the shared playback state (position, play/pause, audio). */
export function syncMedia(
  node: HTMLElement,
  m: MediaLayer,
  mode: RenderMode,
  audio: boolean,
  sinkId = '',
  tap?: (v: HTMLMediaElement) => void,
): void {
  const v = node.querySelector('video');
  if (!v || mode === 'thumbnail') return;
  // This renderer plays the sound: it goes through the mix (once tapped, it never plays direct).
  if (audio && tap) tap(v);
  // The room hears a video's sound where Settings › Audio sends room audio.
  if (audio) routeSound(v, sinkId);
  const trimmed = m.start !== undefined || m.end !== undefined;
  // A trimmed clip loops between its in- and out-points (handled below), not the whole file.
  v.loop = m.loop && !trimmed;
  // Only one renderer plays audio (the main output, or the Program monitor when there is no
  // output), so the room never hears doubled sound.
  v.muted = m.muted || !audio;
  const held = v as HTMLVideoElement & { lsHold?: ReturnType<typeof setTimeout> };
  if (held.lsHold) clearTimeout(held.lsHold);
  const apply = (): void => {
    // Off the screen already, or a newer state has taken over: never play it.
    const latest = (v as HTMLVideoElement & { lsPlayback?: MediaLayer }).lsPlayback;
    if (!v.isConnected || (latest && latest !== m)) return;
    // Synced to start later (a countdown video ending on the start time): hold its first frame
    // until then, so every output starts it together.
    const wait = m.playing && m.syncedAt ? Date.parse(m.syncedAt) - Date.now() : 0;
    if (wait > 50) {
      v.pause();
      if (Math.abs(v.currentTime - m.position) > 0.05) v.currentTime = m.position;
      held.lsHold = setTimeout(apply, Math.min(wait, 2_147_000_000));
      return;
    }
    const duration = Number.isFinite(v.duration) ? v.duration : undefined;
    const target = mediaPositionAt(m, Date.now(), duration);
    if (Math.abs(v.currentTime - target) > 0.3) v.currentTime = target;
    const end = mediaEnd(m, duration);
    const finished = !m.loop && end !== undefined && target >= end - 0.05;
    // play() on an ended video would restart it from 0 — a finished clip stays on its last frame.
    if (m.playing && !finished) safePlay(v);
    else v.pause();
  };
  // The newest state first, so an older one still waiting for metadata knows to stand aside.
  watchPlayback(v, m);
  if (v.readyState >= 1) apply();
  else v.addEventListener('loadedmetadata', apply, { once: true });
}

/**
 * Per frame while a clip shows: fade it in and out (picture and sound together), and honour
 * the out-point: stop there, or jump back to the in-point when looping. One loop per element;
 * a newer playback state replaces the older one.
 */
function watchPlayback(v: HTMLVideoElement, m: MediaLayer): void {
  const state = v as HTMLVideoElement & { lsPlayback?: MediaLayer; lsWatching?: boolean };
  state.lsPlayback = m;
  const needs = m.fadeIn || m.fadeOut || m.start !== undefined || m.end !== undefined;
  if (!needs) {
    v.style.opacity = '';
    v.volume = m.volume;
    return;
  }
  const win = v.ownerDocument.defaultView;
  if (state.lsWatching || !win) return;
  state.lsWatching = true;
  const tick = (): void => {
    const cur = state.lsPlayback;
    const still =
      cur && (cur.fadeIn || cur.fadeOut || cur.start !== undefined || cur.end !== undefined);
    // Stop when the element is gone, or when a newer state no longer trims or fades.
    if (!cur || !still || !v.isConnected) {
      state.lsWatching = false;
      return;
    }
    const duration = Number.isFinite(v.duration) ? v.duration : undefined;
    const end = mediaEnd(cur, duration);
    // Judged by the shared state, not the element: at the file's end the browser has already
    // paused it (native loop is off for trimmed clips), and a loop must still jump back.
    if (end !== undefined && cur.playing && v.currentTime >= end - 0.02) {
      if (cur.loop) {
        v.currentTime = mediaStart(cur);
        safePlay(v);
      } else if (!v.paused) v.pause();
    }
    const a = mediaFadeAt(cur, v.currentTime, duration);
    v.style.opacity = String(a);
    v.volume = Math.max(0, Math.min(1, cur.volume * a));
    win.requestAnimationFrame(tick);
  };
  win.requestAnimationFrame(tick);
}

export function buildMedia(
  doc: Document,
  m: MediaLayer,
  media: MediaResolver,
  mode: RenderMode,
  audio: boolean,
  sinkId = '',
  tap?: (v: HTMLMediaElement) => void,
): HTMLElement {
  const wrap = el(doc, 'div', 'ls-media', { ...FILL, background: '#000' });
  if (m.kind === 'image') {
    const img = el(doc, 'img', '', { ...FILL, objectFit: m.fit });
    img.src = media.mediaUrl(m.mediaId);
    img.alt = '';
    wrap.append(img);
  } else {
    const v = el(doc, 'video', '', { ...FILL, objectFit: m.fit });
    // Read with permission (CORS): a mixer gets silence from media it may only play.
    v.crossOrigin = 'anonymous';
    v.src = media.mediaUrl(m.mediaId);
    v.playsInline = true;
    v.preload = mode === 'thumbnail' ? 'metadata' : 'auto';
    v.muted = true; // syncMedia sets the real audio state once metadata is known
    wrap.append(v);
    syncMedia(wrap, m, mode, audio, sinkId, tap);
  }
  return wrap;
}

import { mediaPositionAt, type BackgroundLayer, type MediaLayer } from '@lampstand/core';
import { el, loop, safePlay } from './dom';
import { backgroundFilter, gradientCss } from './style';
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
      v.muted = true;
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
  return wrap;
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
): void {
  const v = node.querySelector('video');
  if (!v || mode === 'thumbnail') return;
  v.loop = m.loop;
  // Only one renderer plays audio (the main output, or the Program monitor when there is no
  // output), so the room never hears doubled sound.
  v.muted = m.muted || !audio;
  v.volume = m.volume;
  const apply = (): void => {
    const duration = Number.isFinite(v.duration) ? v.duration : undefined;
    const target = mediaPositionAt(m, Date.now(), duration);
    if (Math.abs(v.currentTime - target) > 0.3) v.currentTime = target;
    const finished = !m.loop && duration !== undefined && target >= duration - 0.05;
    // play() on an ended video would restart it from 0 — a finished clip stays on its last frame.
    if (m.playing && !finished) safePlay(v);
    else v.pause();
  };
  if (v.readyState >= 1) apply();
  else v.addEventListener('loadedmetadata', apply, { once: true });
}

export function buildMedia(
  doc: Document,
  m: MediaLayer,
  media: MediaResolver,
  mode: RenderMode,
  audio: boolean,
): HTMLElement {
  const wrap = el(doc, 'div', 'ls-media', { ...FILL, background: '#000' });
  if (m.kind === 'image') {
    const img = el(doc, 'img', '', { ...FILL, objectFit: m.fit });
    img.src = media.mediaUrl(m.mediaId);
    img.alt = '';
    wrap.append(img);
  } else {
    const v = el(doc, 'video', '', { ...FILL, objectFit: m.fit });
    v.src = media.mediaUrl(m.mediaId);
    v.playsInline = true;
    v.preload = mode === 'thumbnail' ? 'metadata' : 'auto';
    v.muted = true; // syncMedia sets the real audio state once metadata is known
    wrap.append(v);
    syncMedia(wrap, m, mode, audio);
  }
  return wrap;
}

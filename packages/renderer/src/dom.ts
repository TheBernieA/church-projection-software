import type { StyleInit } from './types';
/** Tiny DOM helpers. Text is ALWAYS set via text nodes — never innerHTML (§17.1). */
export function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  style?: StyleInit,
): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (className) e.className = className;
  if (style) Object.assign(e.style, style);
  return e;
}

/** WAAPI animation that resolves when done. Falls back to instant where WAAPI is missing (tests). */
export function animate(
  target: HTMLElement,
  keyframes: Keyframe[],
  opts: KeyframeAnimationOptions,
): Promise<void> {
  if (typeof target.animate !== 'function' || !opts.duration) {
    const last = keyframes[keyframes.length - 1];
    if (last)
      for (const [k, v] of Object.entries(last))
        if (k !== 'offset' && k !== 'easing') target.style.setProperty(k, String(v));
    return Promise.resolve();
  }
  let a: Animation;
  try {
    a = target.animate(keyframes, { fill: 'forwards', ...opts });
  } catch {
    // An easing the browser doesn't know: show the end state at once rather than fail.
    return animate(target, keyframes, { ...opts, duration: 0 });
  }
  return a.finished.then(
    () => {
      // Bake the end state into inline styles and release the animation. Without this every
      // finished transition stays alive (fill: forwards) and they pile up over a long service.
      try {
        if (target.isConnected) a.commitStyles();
        a.cancel();
      } catch {
        /* element already detached */
      }
    },
    () => undefined,
  );
}

/** Start playback; autoplay can be refused (e.g. no user gesture) and that must never throw. */
export function safePlay(v: HTMLMediaElement): void {
  try {
    const p = v.play() as Promise<void> | undefined;
    p?.catch(() => undefined);
  } catch {
    /* not supported in this environment */
  }
}

/** Start an infinite decorative animation (backgrounds). No-op without WAAPI. */
export function loop(
  target: HTMLElement,
  keyframes: Keyframe[],
  opts: KeyframeAnimationOptions,
): void {
  if (typeof target.animate !== 'function') return;
  // Promote to its own compositor layer so infinite motion never triggers repaints.
  target.style.willChange = Object.keys(keyframes[0] ?? {}).includes('opacity')
    ? 'transform, opacity'
    : 'transform';
  target.animate(keyframes, { iterations: Infinity, ...opts });
}

/** Retired media: off the page and its file let go, never to play again. */
const released = new WeakSet<HTMLMediaElement>();

/** Stop a media element for good and free its file (the renderer is done with it). */
export function releaseMedia(v: HTMLMediaElement): void {
  released.add(v);
  v.pause();
  v.removeAttribute('src');
  v.load();
}

export const isReleased = (v: HTMLMediaElement): boolean => released.has(v);

/**
 * Send a media element's or an audio context's sound to an output device ('' = the default).
 * Not in every engine (jsdom in tests), and a device that's gone keeps the current one.
 */
export function trySetSink(target: object, sinkId: string): void {
  const sinkable = target as { setSinkId?: (id: string) => Promise<void> };
  void sinkable.setSinkId?.(sinkId).catch(() => undefined);
}

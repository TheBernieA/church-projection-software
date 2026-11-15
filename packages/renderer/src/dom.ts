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
  const a = target.animate(keyframes, { fill: 'forwards', ...opts });
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
export function safePlay(v: HTMLVideoElement): void {
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

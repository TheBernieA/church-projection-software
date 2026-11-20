import type { MediaTransition, ServiceItem, TransitionSpec } from '@lampstand/core';
import { saveSettings } from './actions';
import { cmd } from './api';
import { attempt, patchItem, useStore } from './store';

/** The slide transitions on offer, in menu order. */
export const SLIDE_KINDS: TransitionSpec['kind'][] = [
  'cut',
  'fade',
  'dissolve',
  'slide',
  'zoom',
  'blur',
];
/** Lengths to pick from (ms): slides change quickly, pictures and videos can take longer. */
export const SLIDE_LENGTHS = [200, 400, 600, 1000, 1500];
export const MEDIA_LENGTHS = [400, 800, 1500, 3000, 5000, 10000];

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** A slide transition of `kind`, keeping the length it had (a cut has none). */
export const slideSpec = (kind: TransitionSpec['kind'], durationMs = 400): TransitionSpec => ({
  kind,
  durationMs: kind === 'cut' ? 0 : durationMs,
  easing: EASE,
});

type ItemWithTransition = Extract<ServiceItem, { transition?: TransitionSpec | undefined }>;

const hasTransition = (item: ServiceItem): item is ItemWithTransition =>
  item.kind === 'song' ||
  item.kind === 'scripture' ||
  item.kind === 'presentation' ||
  item.kind === 'announcements' ||
  item.kind === 'countdown';

export const takesTransition = hasTransition;

/**
 * How a slide of `item` comes on: the item's own transition, else the default one (Show, bottom
 * left), else undefined (the theme's own).
 */
export function slideTransitionFor(item: ServiceItem): TransitionSpec | undefined {
  const own = hasTransition(item) ? item.transition : undefined;
  return own ?? useStore.getState().settings?.transitions.slide;
}

export function setItemTransition(item: ServiceItem, t: TransitionSpec | undefined): void {
  if (hasTransition(item)) patchItem<ItemWithTransition>(item, { transition: t });
}

export function setDefaultSlideTransition(t: TransitionSpec | undefined): void {
  const cur = useStore.getState().settings?.transitions ?? {};
  // Unset (undefined) drops out when saved: back to the themes.
  void saveSettings({ transitions: { ...cur, slide: t } });
}

export function setDefaultMediaTransition(t: MediaTransition | undefined): void {
  const cur = useStore.getState().settings?.transitions ?? {};
  // Unset (undefined) drops out when saved: back to the usual fades.
  void saveSettings({ transitions: { ...cur, media: t } });
}

/** "Fade · 0.4 s", "Cut". */
export function describeTransition(
  t: { kind: string; durationMs: number },
  name: (kind: string) => string,
): string {
  return t.kind === 'cut' ? name('cut') : `${name(t.kind)} · ${t.durationMs / 1000} s`;
}

/**
 * Keep every screen on the default media transition: sent whenever it changes (and at start, so
 * outputs opened later get it from the live state).
 */
export function installMediaTransition(): () => void {
  let sent: string | undefined;
  const sync = (): void => {
    const s = useStore.getState().settings;
    if (!s) return;
    const t = s.transitions.media ?? null;
    const key = JSON.stringify(t);
    if (key === sent) return;
    sent = key;
    void attempt(() => cmd('live.setMediaTransition', { mediaTransition: t }));
  };
  sync();
  return useStore.subscribe(sync);
}

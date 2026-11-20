import type { BackgroundRef, MediaItem, Scrim, ServiceItem } from '@lampstand/core';
import { slidesFor } from './actions';
import { cmd } from './api';
import { attempt, editItems, itemIn, patchItem, useStore } from './store';
import { thumbUrl } from '../../shared/mediaUrl';

/** Items whose slides sit on a background of their own (otherwise their theme's). */
export type BackgroundItem = Extract<
  ServiceItem,
  { kind: 'song' | 'scripture' | 'presentation' | 'announcements' | 'countdown' }
>;

export const takesBackground = (item: ServiceItem | null | undefined): item is BackgroundItem =>
  !!item &&
  (item.kind === 'song' ||
    item.kind === 'scripture' ||
    item.kind === 'presentation' ||
    item.kind === 'announcements' ||
    item.kind === 'countdown');

/** The item the operator is working on (selected in the plan, or picked from the library). */
export function useTargetItem(): BackgroundItem | null {
  return useStore((s) => {
    const item = itemIn(s, s.selectedItemId);
    return takesBackground(item) ? item : null;
  });
}

/**
 * Put `ref` behind every slide of `item` (`undefined`: back to its theme's background). If one
 * of its slides is on screen now, the screen's background changes with it (the words stay put).
 */
export function setItemBackground(item: BackgroundItem, ref: BackgroundRef | undefined): void {
  patchItem<BackgroundItem>(item, { background: ref });
  followLive({ ...item, background: ref });
}

/**
 * A readability overlay over `item`'s backgrounds, under the words (`undefined`: its theme's).
 * If one of its slides is on screen, the screen follows at once.
 */
export function setItemOverlay(item: BackgroundItem, overlay: Scrim | undefined): void {
  patchItem<BackgroundItem>(item, { backgroundOverlay: overlay });
  followLive({ ...item, backgroundOverlay: overlay });
}

/** The overlay's presets: how dark each strength is. */
export const OVERLAY_STRENGTHS = { light: 0.3, medium: 0.5, strong: 0.7 } as const;
export type OverlayStrength = keyof typeof OVERLAY_STRENGTHS;

/** The preset nearest an overlay's strength (for ticking the menu). */
export const strengthOf = (s: Scrim): OverlayStrength =>
  s.strength < 0.4 ? 'light' : s.strength < 0.6 ? 'medium' : 'strong';

/** Items whose slides can each have a background of their own. */
type SlideBackgroundItem = Extract<
  ServiceItem,
  { kind: 'song' | 'scripture' | 'presentation' | 'announcements' }
>;

export const takesSlideBackgrounds = (
  item: ServiceItem | null | undefined,
): item is SlideBackgroundItem =>
  !!item &&
  (item.kind === 'song' ||
    item.kind === 'scripture' ||
    item.kind === 'presentation' ||
    item.kind === 'announcements');

/**
 * Put `ref` behind one slide of `item` (by its key) instead of the item's background;
 * `undefined` puts it back on the item's. If that slide is on screen, the screen follows.
 */
export function setSlideBackground(
  item: SlideBackgroundItem,
  key: string,
  ref: BackgroundRef | undefined,
): void {
  let latest: SlideBackgroundItem = item;
  // From the item as it is now, so quick changes to several slides all stick.
  patchItem<SlideBackgroundItem>(item, (cur) => {
    const others = Object.entries(cur.slideBackgrounds ?? {}).filter(([k]) => k !== key);
    const next: Record<string, BackgroundRef> = Object.fromEntries(
      ref ? [...others, [key, ref]] : others,
    );
    latest = { ...cur, slideBackgrounds: Object.keys(next).length ? next : undefined };
    return { slideBackgrounds: latest.slideBackgrounds };
  });
  followLive(latest);
}

/** If one of `item`'s slides is on screen, show its (new) background there; the words stay. */
function followLive(item: BackgroundItem): void {
  const cur = useStore.getState().liveCursor;
  if (cur?.itemId !== item.id) return;
  const action = slidesFor(item)[cur.index]?.action;
  if (action?.kind === 'content')
    void attempt(() => cmd('live.setBackground', { background: action.background ?? null }));
}

/** How many items in the service plan can have their own background. */
export const useBackgroundItemCount = (): number =>
  useStore((s) => s.service?.items.filter(takesBackground).length ?? 0);

/**
 * Put `ref` behind the slides of every item in the service plan that has slides (songs,
 * scripture, presentations, announcements, countdowns); `undefined` puts them all back on their
 * themes' backgrounds. One undo step.
 */
export function setServiceBackground(ref: BackgroundRef | undefined): void {
  editItems((items) => items.map((i) => (takesBackground(i) ? { ...i, background: ref } : i)));
  const s = useStore.getState();
  const adhoc = s.adhoc;
  if (takesBackground(adhoc)) useStore.setState({ adhoc: { ...adhoc, background: ref } });
  const live = itemIn(s, s.liveCursor?.itemId);
  if (takesBackground(live)) followLive({ ...live, background: ref });
}

/** A library picture or video as a background. */
export const mediaBackground = (m: MediaItem): BackgroundRef =>
  m.kind === 'video'
    ? { kind: 'video', mediaId: m.id, loop: true }
    : { kind: 'image', mediaId: m.id };

/** A small CSS swatch for a background (menus, chips): its colours, or its picture. */
export function backgroundSwatch(ref: BackgroundRef | undefined): string {
  if (!ref) return 'var(--surface-3)';
  switch (ref.kind) {
    case 'none':
      return '#000';
    case 'color':
      return ref.color;
    case 'gradient':
      return `linear-gradient(${ref.angle}deg, ${ref.stops.map((s) => s.color).join(', ')})`;
    case 'generated':
      return `linear-gradient(135deg, ${ref.colors.join(', ')})`;
    case 'image':
    case 'video':
      return `center / cover no-repeat url("${thumbUrl(ref.mediaId)}"), #111`;
  }
}

/** A background without its sound switch (the same video, heard or not, is the same choice). */
const unsounded = (r: BackgroundRef | undefined) =>
  r?.kind === 'video' ? { ...r, sound: undefined } : r;

/** Same background? (to tick the current one in a menu). */
export const sameBackground = (a: BackgroundRef | undefined, b: BackgroundRef | undefined) =>
  JSON.stringify(unsounded(a)) === JSON.stringify(unsounded(b));

/**
 * Switch the sound of the video behind the words on screen. The item it belongs to keeps the
 * choice (its own background, or the slide's), so it stays on the next time it's shown.
 */
export function setLiveBackgroundSound(on: boolean): void {
  const s = useStore.getState();
  const bg = s.live?.program.background;
  if (bg?.ref.kind !== 'video') return;
  const ref: BackgroundRef = { ...bg.ref, sound: on || undefined };
  const cur = s.liveCursor;
  const item = itemIn(s, cur?.itemId);
  if (takesBackground(item) && sameBackground(item.background, ref)) {
    setItemBackground(item, ref);
    return;
  }
  void attempt(() => cmd('live.setBackground', { background: { ...bg, ref } }));
}

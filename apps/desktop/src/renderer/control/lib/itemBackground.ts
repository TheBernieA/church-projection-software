import type { BackgroundRef, MediaItem, ServiceItem } from '@lampstand/core';
import { slidesFor } from './actions';
import { cmd } from './api';
import { attempt, editItems, patchItem, useStore } from './store';
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
    const item = s.adhoc ?? s.service?.items.find((i) => i.id === s.selectedItemId) ?? null;
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
  const live = s.liveCursor
    ? ((s.adhoc?.id === s.liveCursor.itemId
        ? s.adhoc
        : s.service?.items.find((i) => i.id === s.liveCursor?.itemId)) ?? null)
    : null;
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

/** Same background? (to tick the current one in a menu). */
export const sameBackground = (a: BackgroundRef | undefined, b: BackgroundRef | undefined) =>
  JSON.stringify(a) === JSON.stringify(b);

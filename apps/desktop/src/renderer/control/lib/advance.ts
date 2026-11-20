import type { ServiceItem } from '@lampstand/core';
import { patchItem } from './store';

/** How an item's slides move on by themselves while live: every `seconds`, looping or not. */
interface AdvanceState {
  seconds: number;
  loop: boolean;
}

/** Seconds to pick from (the header's auto-advance menu). */
export const ADVANCE_SECONDS = [3, 5, 8, 10, 15, 20, 30, 60];

type AdvanceItem = Extract<
  ServiceItem,
  { kind: 'song' | 'scripture' | 'presentation' | 'announcements' }
>;

/** Items whose slides can move on by themselves. */
export const takesAdvance = (item: ServiceItem | null | undefined): item is AdvanceItem =>
  !!item &&
  (item.kind === 'song' ||
    item.kind === 'scripture' ||
    item.kind === 'presentation' ||
    item.kind === 'announcements');

/** The item's auto-advance, or null when its slides wait for a click. Announcements always loop. */
export function advanceOf(item: ServiceItem): AdvanceState | null {
  if (item.kind === 'announcements')
    return item.autoAdvance ? { seconds: item.loopIntervalSec, loop: true } : null;
  if (item.kind === 'song' || item.kind === 'scripture' || item.kind === 'presentation')
    return item.advance ?? null;
  return null;
}

/** Turn auto-advance on (every `adv.seconds`) or off (null). */
export function setAdvance(item: AdvanceItem, adv: AdvanceState | null): void {
  if (item.kind === 'announcements') {
    patchItem<typeof item>(item, {
      autoAdvance: !!adv,
      loopIntervalSec: Math.round(adv?.seconds ?? item.loopIntervalSec),
    });
    return;
  }
  patchItem<typeof item>(item, { advance: adv ?? undefined });
}

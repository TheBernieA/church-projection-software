import type { ServiceItem } from '@lampstand/core';
import { editable } from './slideThumbs';
import { itemIn, useStore } from './store';
import { type ControlState } from '../types';

/**
 * Whether the Edit workspace has an editor for this item: a song wherever it was picked; the
 * playlist's own slides, countdowns and web pages once they're in the playlist.
 */
function hasEditor(item: ServiceItem | null | undefined, inService: boolean): boolean {
  if (!item) return false;
  if (item.kind === 'song') return true;
  return inService && (editable(item) || item.kind === 'web');
}

/**
 * Open the Edit workspace. Something just made opens `expanded` (the editor takes the whole
 * window); something already there opens compact, beside the playlist and the output. The
 * editor's Expand button switches between the two.
 */
export function openEditor(expanded: boolean, extra: Partial<ControlState> = {}): void {
  useStore.setState({ ...extra, mode: 'edit', editExpanded: expanded });
}

/** The editor is open and expanded: the rest of the window makes way for it. */
export function useEditorExpanded(): boolean {
  return useStore((s) => {
    if (s.mode !== 'edit' || !s.editExpanded) return false;
    const item = itemIn(s, s.selectedItemId);
    return hasEditor(item, !!item && item !== s.adhoc);
  });
}

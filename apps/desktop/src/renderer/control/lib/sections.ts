import type { ServiceItem } from '@lampstand/core';

/**
 * Service-plan sections: a header plus every item after it, up to the next header. Items before
 * the first header form an untitled leading group. Sections move as one block and only ever land
 * on a section boundary — never between another section's items.
 */

const isHeader = (i: ServiceItem | undefined): boolean => i?.kind === 'header';

/** [start, end) of the section whose header is at `headerIndex` (or of the group containing `index`). */
export function sectionBounds(items: readonly ServiceItem[], index: number): [number, number] {
  let start = index;
  while (start > 0 && !isHeader(items[start])) start--;
  if (!isHeader(items[start])) start = 0; // leading, untitled group
  let end = start + 1;
  while (end < items.length && !isHeader(items[end])) end++;
  return [start, end];
}

/**
 * Where a dragged section should land when dropped onto row `overIndex`:
 * on a header → just before that section; on an item → just after that item's whole section.
 * Returns an insertion index in the *original* list.
 */
export function sectionDropBoundary(items: readonly ServiceItem[], overIndex: number): number {
  if (overIndex >= items.length) return items.length;
  if (isHeader(items[overIndex])) return overIndex;
  return sectionBounds(items, overIndex)[1];
}

/** Move the section headed at `headerIndex` to insertion boundary `boundary` (original indices). */
export function moveSectionTo(
  items: readonly ServiceItem[],
  headerIndex: number,
  boundary: number,
): ServiceItem[] {
  const [start, end] = sectionBounds(items, headerIndex);
  if (boundary >= start && boundary <= end) return [...items]; // dropped onto itself
  const block = items.slice(start, end);
  const rest = [...items.slice(0, start), ...items.slice(end)];
  const at = boundary > end ? boundary - (end - start) : boundary;
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}

/** Swap a section with the one above (-1) or below (+1). The untitled leading group never moves. */
export function moveSectionBy(
  items: readonly ServiceItem[],
  headerIndex: number,
  dir: -1 | 1,
): ServiceItem[] {
  const [start, end] = sectionBounds(items, headerIndex);
  if (!isHeader(items[start])) return [...items];
  if (dir === 1) {
    if (end >= items.length) return [...items];
    const [, nextEnd] = sectionBounds(items, end);
    return moveSectionTo(items, start, nextEnd);
  }
  if (start === 0) return [...items];
  const [prevStart] = sectionBounds(items, start - 1);
  // Never jump above the untitled leading group: it has no header to hold it in place.
  if (!isHeader(items[prevStart])) return [...items];
  return moveSectionTo(items, start, prevStart);
}

/** Can this section move up / down? (Drives the ↑ ↓ button states.) */
export function sectionCanMove(
  items: readonly ServiceItem[],
  headerIndex: number,
): { up: boolean; down: boolean } {
  const [start, end] = sectionBounds(items, headerIndex);
  const prevStart = start > 0 ? sectionBounds(items, start - 1)[0] : -1;
  return { up: prevStart >= 0 && isHeader(items[prevStart]), down: end < items.length };
}

// ---------- Adding to a section ----------

type Edit = (items: ServiceItem[]) => ServiceItem[];

/**
 * Where a section ends: the index just past its last item (the next heading, or the end of the
 * playlist). -1 when there's no such section.
 */
export function sectionEnd(items: readonly ServiceItem[], headerId: string): number {
  const start = items.findIndex((i) => i.id === headerId && i.kind === 'header');
  return start < 0 ? -1 : sectionBounds(items, start)[1];
}

/** Is there nothing under this heading? */
export const sectionIsEmpty = (items: readonly ServiceItem[], headerId: string): boolean => {
  const start = items.findIndex((i) => i.id === headerId);
  return start >= 0 && sectionEnd(items, headerId) === start + 1;
};

/** Put items at the end of a section (at the end of the playlist if the section has gone). */
export function insertInSection(
  items: readonly ServiceItem[],
  headerId: string | null,
  added: readonly ServiceItem[],
): ServiceItem[] {
  const at = headerId ? sectionEnd(items, headerId) : -1;
  if (at < 0) return [...items, ...added];
  return [...items.slice(0, at), ...added, ...items.slice(at)];
}

/**
 * Turn an edit that adds items (anywhere) into one that adds them at the end of a section:
 * whatever the edit added is moved there; anything else it did is kept.
 */
export function intoSection(headerId: string, edit: Edit): Edit {
  return (items) => {
    const next = edit(items);
    const had = new Set(items.map((i) => i.id));
    const added = next.filter((i) => !had.has(i.id));
    if (!added.length) return next;
    return insertInSection(
      next.filter((i) => had.has(i.id)),
      headerId,
      added,
    );
  };
}

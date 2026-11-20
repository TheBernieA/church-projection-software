import { newId, type TextSlide } from '@lampstand/core';
import { moveItem } from './array';
import { updateItem, useStore } from './store';
import { type TextItem } from '../types';

/**
 * Slide operations for text items (text slides, announcements), shared by the filmstrip and the
 * inspector: each is one undo step and keeps the edited slide selected.
 */
const edit = (
  item: TextItem,
  change: (slides: TextSlide[]) => TextSlide[],
  select: number,
): void => {
  // From the slides as they are now (not the copy the caller rendered with).
  updateItem<TextItem>(item.id, (x) => ({ ...x, slides: change(x.slides) }));
  useStore.setState({ editCursor: { itemId: item.id, index: select }, editObjectId: null });
};

export const selectSlide = (item: TextItem, index: number): void =>
  useStore.setState({
    editCursor: { itemId: item.id, index: Math.max(0, Math.min(index, item.slides.length - 1)) },
    editObjectId: null,
  });

/** A new, empty slide after slide `after` (the last, by default), selected. Returns its id. */
export function addSlide(item: TextItem, after = item.slides.length - 1): string {
  const id = newId();
  edit(item, (slides) => slides.toSpliced(after + 1, 0, { id, title: '', body: '' }), after + 1);
  return id;
}

/**
 * Break slide `index` at the caret: its text keeps what came before, a new slide after it takes
 * the rest (selected). Read from the item as it is now, so typing just before isn't lost.
 * Returns the new slide's id.
 */
export function breakSlide(item: TextItem, index: number, before: string, after: string): string {
  const id = newId();
  updateItem<TextItem>(item.id, (x) => {
    const slides = x.slides.map((s, i) => (i === index ? { ...s, body: before.trimEnd() } : s));
    slides.splice(index + 1, 0, { id, title: '', body: after.trimStart() });
    return { ...x, slides };
  });
  useStore.setState({ editCursor: { itemId: item.id, index: index + 1 }, editObjectId: null });
  return id;
}

export function duplicateSlide(item: TextItem, index: number): void {
  const id = newId();
  edit(
    item,
    (slides) => {
      const slide = slides[index];
      return slide ? slides.toSpliced(index + 1, 0, { ...slide, id }) : slides;
    },
    index + 1,
  );
}

/** The last slide stays (an item always has one). */
export function deleteSlide(item: TextItem, index: number): void {
  if (item.slides.length <= 1) return;
  edit(
    item,
    (slides) => (slides.length > 1 ? slides.filter((_, i) => i !== index) : slides),
    Math.max(0, index - 1),
  );
}

export function moveSlide(item: TextItem, from: number, to: number): void {
  if (to < 0 || to >= item.slides.length || from === to) return;
  edit(item, (slides) => moveItem(slides, from, to), to);
}

/** Change one slide's own words (title, body); typing groups keystrokes into one undo step. */
export function patchSlide(item: TextItem, index: number, p: Partial<TextSlide>): void {
  updateItem<TextItem>(
    item.id,
    (x) => ({ ...x, slides: x.slides.map((s, i) => (i === index ? { ...s, ...p } : s)) }),
    { typing: true },
  );
}

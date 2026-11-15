import { newId, type ServiceItem, type SlideObject, type TextSlide } from '@lampstand/core';
import { updateItem, type EditOptions } from './store';

export type TextItem = Extract<ServiceItem, { kind: 'presentation' | 'announcements' }>;
export type ObjectKind = SlideObject['kind'];

export const CANVAS = { width: 1920, height: 1080 };
const GRID = 8;

/** A new object of a kind, centred-ish on the canvas with sensible defaults. */
export function newObject(kind: ObjectKind, mediaId?: string): SlideObject {
  const id = newId();
  switch (kind) {
    case 'text':
      return {
        id,
        kind,
        x: 160,
        y: 160,
        w: 900,
        h: 200,
        text: 'Text',
        fontSize: 72,
        color: '#ffffff',
        align: 'left',
      };
    case 'rect':
      return { id, kind, x: 660, y: 340, w: 600, h: 400, fill: '#f0a73a', radius: 24 };
    case 'ellipse':
      return { id, kind, x: 760, y: 340, w: 400, h: 400, fill: '#4f8ef7' };
    case 'line':
      return { id, kind, x: 460, y: 528, w: 1000, h: 24, stroke: { width: 8, color: '#ffffff' } };
    case 'image':
      return { id, kind, x: 560, y: 240, w: 800, h: 600, mediaId: mediaId ?? '', fit: 'contain' };
  }
}

/**
 * Snap a coordinate to the 8px grid, and to the canvas edges and centre when close.
 * `size` lets a box snap its far edge too.
 */
export function snap(v: number, size = 0, axis: 'x' | 'y' = 'x'): number {
  const max = axis === 'x' ? CANVAS.width : CANVAS.height;
  for (const target of [0, max / 2 - size / 2, max - size])
    if (Math.abs(v - target) <= GRID) return Math.round(target);
  return Math.round(v / GRID) * GRID;
}

/** Change one slide's objects (one undo step, or coalesced while typing). */
export function editObjects(
  item: TextItem,
  slideIndex: number,
  fn: (objects: SlideObject[]) => SlideObject[],
  opts?: EditOptions,
): void {
  updateItem<TextItem>(
    item.id,
    (x) => ({
      ...x,
      slides: x.slides.map((s: TextSlide, i) =>
        i === slideIndex ? { ...s, objects: fn(s.objects ?? []) } : s,
      ),
    }),
    opts,
  );
}

/** Replace one object by id. */
export function patchObject<T extends SlideObject>(
  item: TextItem,
  slideIndex: number,
  id: string,
  p: Partial<T>,
  opts?: EditOptions,
): void {
  editObjects(item, slideIndex, (os) => os.map((o) => (o.id === id ? { ...o, ...p } : o)), opts);
}

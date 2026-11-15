import type { DragEvent } from 'react';
import { newId, ServiceItemSchema, type ServiceItem } from '@lampstand/core';

/** Private drag payload type, so only Lampstand library items can be dropped into the plan. */
export const LIBRARY_MIME = 'application/x-lampstand-item';

/** Spread onto a library element to make it draggable into the service plan. */
export function libraryDragSource(make: () => ServiceItem) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(LIBRARY_MIME, JSON.stringify(make()));
      e.dataTransfer.effectAllowed = 'copy';
    },
  };
}

export function isLibraryDrag(e: DragEvent): boolean {
  return e.dataTransfer.types.includes(LIBRARY_MIME);
}

/** Read and validate a dropped library item; it always gets a fresh id. */
export function readLibraryDrop(e: DragEvent): ServiceItem | null {
  try {
    const parsed = ServiceItemSchema.safeParse(JSON.parse(e.dataTransfer.getData(LIBRARY_MIME)));
    return parsed.success ? { ...parsed.data, id: newId() } : null;
  } catch {
    return null;
  }
}

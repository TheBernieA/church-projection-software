import type { PassageRef } from '@lampstand/core';

/**
 * Compact passage notation used by the fixture tables: "JHN 3:16-3:18".
 * Whole-chapter ends show as 999 (WHOLE_CHAPTER) so the sentinel is explicit in fixtures.
 */
export function compact(passages: readonly PassageRef[]): string {
  return passages
    .map(
      (p) =>
        `${p.start.book} ${String(p.start.chapter)}:${String(p.start.verse)}-${String(p.end.chapter)}:${String(p.end.verse)}`,
    )
    .join(', ');
}

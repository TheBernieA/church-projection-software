import type { SongSection } from '@lampstand/core';
import type { ImportedSong } from '@lampstand/lyrics';
import type { LyricsDraft } from './draft';

const MAX_SECTIONS = 100;
const MAX_LINES = 200;

/**
 * Normalised short forms for the sung order: "V1", "Verse 1" and "verse one" are the same
 * part, as are "C", "Chorus" and "Chorus 1".
 */
function orderKey(label: string): string {
  const t = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const m =
    /^(verse|v|chorus|c|ch|pre chorus|pre|prechorus|pc|bridge|b|tag|t|intro|outro|ending)\s*(\d*)$/.exec(
      t,
    );
  if (!m) return t;
  const kind: Record<string, string> = {
    v: 'verse',
    c: 'chorus',
    ch: 'chorus',
    pre: 'pre chorus',
    prechorus: 'pre chorus',
    pc: 'pre chorus',
    b: 'bridge',
    t: 'tag',
  };
  const k = kind[m[1] ?? ''] ?? m[1] ?? '';
  const n = m[2] || (k === 'verse' ? '1' : '');
  return `${k}${n ? ` ${n}` : ''}`;
}

/**
 * The model's structured lyrics as an imported song (the same path as a song file): its lines
 * as given, each part once, and the sung order where the labels make sense.
 */
export function songFromLyricsDraft(draft: LyricsDraft, newId: () => string): ImportedSong | null {
  const sections: SongSection[] = draft.sections
    .map((s) => ({
      id: newId(),
      kind: s.kind,
      label: s.label.trim().slice(0, 60) || s.kind,
      lines: s.lines
        .map((l) => l.replace(/\s+$/, '').slice(0, 500))
        .filter((l) => l.trim())
        .slice(0, MAX_LINES),
    }))
    .filter((s) => s.lines.length > 0)
    .slice(0, MAX_SECTIONS);
  if (!sections.length) return null;
  const byKey = new Map<string, string>();
  for (const s of sections) {
    const k = orderKey(s.label);
    if (!byKey.has(k)) byKey.set(k, s.id);
  }
  const order = draft.order
    .map((label) => byKey.get(orderKey(label)))
    .filter((id): id is string => !!id)
    .slice(0, 200);
  return {
    format: 'text',
    title: draft.title.replace(/\s+/g, ' ').trim().slice(0, 200) || 'New song',
    authors: draft.authors
      .map((a) => a.trim())
      .filter(Boolean)
      .slice(0, 20),
    sections,
    // No order the labels can follow: as written.
    order: order.length ? order : [],
  };
}

import { newId, type HymnalFile, type Song, type SongSection } from '@lampstand/core';

type Hymn = HymnalFile['hymns'][number];

/**
 * Convert a hymnal entry to a read-only Song. Ids are derived deterministically from the
 * hymnal id + number so service plans keep pointing at the same hymn across restarts.
 */
export function hymnToSong(hymnal: Pick<HymnalFile, 'id' | 'name'>, hymn: Hymn): Song {
  const songId = `hymn-${hymnal.id}-${hymn.number}`;
  const sections: SongSection[] = hymn.sections.map((s, i) => ({
    id: `${songId}-s${i}`,
    kind: s.kind,
    label: s.label,
    lines: s.lines,
  }));
  let order: string[];
  if (hymn.order?.length) {
    order = hymn.order
      .map((label) => sections.find((s) => s.label.toLowerCase() === label.toLowerCase())?.id)
      .filter((id): id is string => !!id);
  } else {
    const chorus = sections.find((s) => s.kind === 'chorus');
    order = [];
    for (const s of sections) {
      if (s.kind === 'chorus') continue;
      order.push(s.id);
      if (chorus && s.kind === 'verse') order.push(chorus.id);
    }
  }
  const arrangementId = `${songId}-default`;
  const song: Song = {
    id: songId,
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    title: hymn.title,
    alternateTitles: [],
    authors: hymn.authors,
    hymnNumber: [{ hymnalId: hymnal.id, number: hymn.number }],
    sections,
    arrangements: [{ id: arrangementId, name: 'Default', sectionOrder: order }],
    defaultArrangementId: arrangementId,
    tags: hymn.tags ?? [],
    origin: 'hymnal',
  };
  if (hymn.copyright) song.copyright = hymn.copyright;
  else song.copyright = `Public domain${hymn.year ? ` (${hymn.year})` : ''}`;
  return song;
}

/** Create a new, empty user song with one verse and a default arrangement. */
export function createEmptySong(title: string, now: string): Song {
  const sectionId = newId();
  const arrangementId = newId();
  return {
    id: newId(),
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    title,
    alternateTitles: [],
    authors: [],
    sections: [{ id: sectionId, kind: 'verse', label: 'Verse 1', lines: [] }],
    arrangements: [{ id: arrangementId, name: 'Default', sectionOrder: [] }],
    defaultArrangementId: arrangementId,
    tags: [],
    origin: 'user',
  };
}

import type { Song, SongSection } from '@lampstand/core';
import { hasChords, stripChords } from './chords';
import { type LyricSlide } from './types';

/** Split a section into slide-sized chunks. Explicit blank lines always break. */
export function splitSection(lines: string[], maxLines: number): string[][] {
  const groups: string[][] = [[]];
  for (const line of lines) {
    if (!line.trim()) {
      if ((groups[groups.length - 1]?.length ?? 0) > 0) groups.push([]);
      continue;
    }
    groups[groups.length - 1]?.push(line);
  }
  const out: string[][] = [];
  for (const g of groups) {
    if (!g.length) continue;
    // Balance chunk sizes so a 5-line verse with max 4 becomes 3+2, not 4+1.
    const chunks = Math.ceil(g.length / maxLines);
    const size = Math.ceil(g.length / chunks);
    for (let i = 0; i < g.length; i += size) out.push(g.slice(i, i + size));
  }
  return out;
}

/** Build the ordered slide list for a song + arrangement (§9.1). */
export function buildSongSlides(
  song: Song,
  opts: { arrangementId?: string; maxLines: number; translationLang?: string },
): LyricSlide[] {
  const arrangement =
    song.arrangements.find((a) => a.id === opts.arrangementId) ??
    song.arrangements.find((a) => a.id === song.defaultArrangementId) ??
    song.arrangements[0];
  const order = arrangement?.sectionOrder.length
    ? arrangement.sectionOrder
    : song.sections.map((s) => s.id);
  const translated = opts.translationLang ? song.translations?.[opts.translationLang] : undefined;
  const occurrences = new Map<string, number>();
  const slides: LyricSlide[] = [];
  for (const sectionId of order) {
    const section: SongSection | undefined = song.sections.find((s) => s.id === sectionId);
    if (!section) continue;
    const occ = occurrences.get(sectionId) ?? 0;
    occurrences.set(sectionId, occ + 1);
    const chunks = splitSection(section.lines, opts.maxLines);
    const tChunks = translated
      ? splitSection(translated.find((t) => t.id === sectionId)?.lines ?? [], opts.maxLines)
      : [];
    chunks.forEach((lines, i) => {
      // The room never sees chords; the stage gets them separately.
      const slide: LyricSlide = {
        key: `${song.id}:${sectionId}:${i}:${occ}`,
        sectionId,
        sectionLabel: section.label,
        label: chunks.length > 1 ? `${section.label} (${i + 1}/${chunks.length})` : section.label,
        lines: lines.map(stripChords),
      };
      if (lines.some(hasChords)) slide.chordLines = lines;
      const t = tChunks[i];
      if (t) slide.translation = t.map(stripChords);
      slides.push(slide);
    });
  }
  return slides;
}

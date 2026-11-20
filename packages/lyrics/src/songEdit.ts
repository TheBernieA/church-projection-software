import { newId, type Song, type SongSection } from '@lampstand/core';
import { splitSection } from './slides';
import { inferSectionKind } from './textFormat';

/**
 * Editing a song slide by slide, the way a presentation editor shows it: groups (the song's
 * sections: Verse 1, Chorus…) each holding slides (the section's blank-line separated chunks).
 * Every function here is pure: it takes a song and returns the changed song, keeping the
 * arrangements and translations in step with the sections that remain.
 */

/** One slide as the editor shows it: which group it's in, and its lines. */
export interface EditorSlide {
  sectionId: string;
  lines: string[];
}

/** Group names offered when grouping a slide (any other name can be typed). */
export const GROUP_LABELS = [
  'Verse 1',
  'Verse 2',
  'Verse 3',
  'Verse 4',
  'Pre-chorus',
  'Chorus',
  'Chorus 2',
  'Bridge',
  'Tag',
  'Intro',
  'Outro',
  'Ending',
] as const;

/** A section's slides: its lines split at blank lines (an empty section is one empty slide). */
function chunksOf(section: SongSection): string[][] {
  const chunks = splitSection(section.lines, Infinity);
  return chunks.length ? chunks : [[]];
}

/** The song's slides in order, group by group. */
export function editorSlides(song: Song): EditorSlide[] {
  return song.sections.flatMap((s) => chunksOf(s).map((lines) => ({ sectionId: s.id, lines })));
}

/** The words of one slide, ready to store: trailing spaces trimmed, blank lines dropped. */
export function slideLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());
}

/**
 * The song rebuilt from a list of slides. Groups come in the order they first appear; a group
 * left with no slides is gone (and so is its place in arrangements and translations), except
 * that a song always keeps at least one group.
 */
function fromSlides(song: Song, slides: EditorSlide[], extra: SongSection[] = []): Song {
  const known = new Map([...song.sections, ...extra].map((s) => [s.id, s]));
  const order: string[] = [];
  const chunks = new Map<string, string[][]>();
  for (const s of slides) {
    if (!known.has(s.sectionId)) continue;
    if (!chunks.has(s.sectionId)) {
      order.push(s.sectionId);
      chunks.set(s.sectionId, []);
    }
    if (s.lines.length) chunks.get(s.sectionId)?.push(s.lines);
  }
  const sections = order.flatMap((id) => {
    const section = known.get(id);
    if (!section) return [];
    const lines = (chunks.get(id) ?? []).flatMap((c, i) => (i ? ['', ...c] : c));
    return [{ ...section, lines }];
  });
  if (!sections.length) {
    const first = song.sections[0];
    if (first) sections.push({ ...first, lines: [] });
  }
  return withSections(song, sections);
}

/** The song with new sections, its arrangements and translations cleaned of any that went. */
function withSections(song: Song, sections: SongSection[]): Song {
  const ids = new Set(sections.map((s) => s.id));
  const next: Song = {
    ...song,
    sections,
    arrangements: song.arrangements.map((a) => ({
      ...a,
      sectionOrder: a.sectionOrder.filter((id) => ids.has(id)),
    })),
  };
  if (song.translations)
    next.translations = Object.fromEntries(
      Object.entries(song.translations).map(([lang, ts]) => [
        lang,
        ts.filter((t) => ids.has(t.id)),
      ]),
    );
  return next;
}

/** Give slide `index` these words. With none, the slide goes (unless it's its group's only one). */
export function setSlideLines(song: Song, index: number, lines: string[]): Song {
  const slides = editorSlides(song);
  const slide = slides[index];
  if (!slide) return song;
  slides[index] = { ...slide, lines };
  return fromSlides(song, slides);
}

/**
 * A new slide with these words, placed at `index` (it joins the group of the slide before it,
 * or of the one after when it goes first). A slide with no words isn't kept.
 */
export function insertSlide(song: Song, index: number, lines: string[]): Song {
  const slides = editorSlides(song);
  const at = Math.max(0, Math.min(index, slides.length));
  const near = slides[at - 1] ?? slides[at];
  if (!near) return song;
  slides.splice(at, 0, { sectionId: near.sectionId, lines });
  return fromSlides(song, slides);
}

/** A copy of slide `index`, right after it. */
export function duplicateSlide(song: Song, index: number): Song {
  const slide = editorSlides(song)[index];
  return slide ? insertSlide(song, index + 1, slide.lines) : song;
}

/** Remove slide `index` (the song's last slide is emptied instead). */
export function removeSlide(song: Song, index: number): Song {
  const slides = editorSlides(song);
  if (!slides[index]) return song;
  if (slides.length === 1) return setSlideLines(song, 0, []);
  slides.splice(index, 1);
  return fromSlides(song, slides);
}

/**
 * Move slide `from` so it ends up at `to`. It stays in its group when it lands beside another
 * slide of it; otherwise it joins the group it lands in (the slide before it, or after it at the
 * very start).
 */
export function moveSlide(song: Song, from: number, to: number): Song {
  const slides = editorSlides(song);
  const [slide] = slides.splice(from, 1);
  if (!slide || from === to) return song;
  const at = Math.max(0, Math.min(to, slides.length));
  const before = slides[at - 1];
  const after = slides[at];
  const own = before?.sectionId === slide.sectionId || after?.sectionId === slide.sectionId;
  const sectionId = own ? slide.sectionId : (before ?? after)?.sectionId;
  if (!sectionId) return song;
  slides.splice(at, 0, { ...slide, sectionId });
  return fromSlides(song, slides);
}

/** Slide `index` split into slides of at most `maxLines` lines (balanced: 5 lines → 3 + 2). */
export function splitSlide(song: Song, index: number, maxLines: number): Song {
  const slides = editorSlides(song);
  const slide = slides[index];
  if (!slide) return song;
  const parts = splitSection(slide.lines, maxLines).map((lines) => ({ ...slide, lines }));
  slides.splice(index, 1, ...parts);
  return fromSlides(song, slides);
}

/** Whether slide `index` is the first of its group (where a group name can be changed). */
export function startsGroup(song: Song, index: number): boolean {
  const slides = editorSlides(song);
  const slide = slides[index];
  return !!slide && slides[index - 1]?.sectionId !== slide.sectionId;
}

/** Rename a group (its kind follows the name: "Chorus 2" is a chorus). */
export function renameGroup(song: Song, sectionId: string, label: string): Song {
  const name = label.trim().slice(0, 60);
  if (!name) return song;
  return {
    ...song,
    sections: song.sections.map((s) =>
      s.id === sectionId ? { ...s, label: name, kind: inferSectionKind(name) } : s,
    ),
  };
}

/**
 * Group from slide `index` on: the first slide of a group renames it; a slide further in starts
 * a new group with this name, taking the rest of its group's slides with it.
 */
export function groupFrom(song: Song, index: number, label: string): Song {
  const name = label.trim().slice(0, 60);
  const slides = editorSlides(song);
  const slide = slides[index];
  if (!slide || !name) return song;
  if (startsGroup(song, index)) return renameGroup(song, slide.sectionId, name);
  const group: SongSection = { id: newId(), kind: inferSectionKind(name), label: name, lines: [] };
  const next = slides.findIndex((s, i) => i > index && s.sectionId !== slide.sectionId);
  const end = next === -1 ? slides.length : next;
  const regrouped = slides.map((s, i) =>
    i >= index && i < end ? { ...s, sectionId: group.id } : s,
  );
  return fromSlides(song, regrouped, [group]);
}

/** Ungroup: the group's slides join the group before it (the first group can't). */
export function ungroup(song: Song, sectionId: string): Song {
  const at = song.sections.findIndex((s) => s.id === sectionId);
  const prev = song.sections[at - 1];
  if (!prev) return song;
  const slides = editorSlides(song).map((s) =>
    s.sectionId === sectionId ? { ...s, sectionId: prev.id } : s,
  );
  return fromSlides(song, slides);
}

/** Delete a group and its slides (the song's only group is emptied instead). */
export function removeGroup(song: Song, sectionId: string): Song {
  return fromSlides(
    song,
    editorSlides(song).filter((s) => s.sectionId !== sectionId),
  );
}

/**
 * A new, empty group after the group of slide `index`. Returns the song and where the group's
 * (empty) slide is.
 */
export function addGroup(song: Song, index: number, label: string): { song: Song; index: number } {
  const slides = editorSlides(song);
  const sectionId = slides[index]?.sectionId;
  let at = index + 1;
  while (sectionId && slides[at]?.sectionId === sectionId) at++;
  const name = label.trim().slice(0, 60) || 'Group';
  const group: SongSection = { id: newId(), kind: inferSectionKind(name), label: name, lines: [] };
  const sections = [...song.sections];
  const after = sections.findIndex((s) => s.id === sectionId);
  sections.splice(after + 1, 0, group);
  return { song: withSections(song, sections), index: Math.min(at, slides.length) };
}

/** The name a new group of this kind would take: the next free verse number, or a chorus. */
export function nextGroupLabel(song: Song): string {
  const used = new Set(song.sections.map((s) => s.label.toLowerCase()));
  const free = GROUP_LABELS.find((l) => !used.has(l.toLowerCase()));
  if (free) return free;
  let n = 1;
  while (used.has(`group ${n}`)) n++;
  return `Group ${n}`;
}

import { describe, expect, it } from 'vitest';
import type { Song } from '@lampstand/core';
import {
  addGroup,
  createEmptySong,
  duplicateSlide,
  editorSlides,
  groupFrom,
  insertSlide,
  moveSlide,
  nextGroupLabel,
  parseSongText,
  removeGroup,
  removeSlide,
  renameGroup,
  setSlideLines,
  slideLines,
  songSectionsToText,
  splitSlide,
  startsGroup,
  ungroup,
} from './index';

function song(text: string): Song {
  const s = createEmptySong('Test', '2026-01-01T00:00:00.000Z');
  return { ...s, sections: parseSongText(text).sections };
}

const BASE = song('[Verse 1]\na\nb\n\nc\n\n[Chorus]\nd');
const words = (s: Song): string[][] => editorSlides(s).map((x) => x.lines);
const labels = (s: Song): string[] => s.sections.map((x) => x.label);

describe('song slide editing', () => {
  it('lists slides group by group, an empty group as one empty slide', () => {
    expect(words(BASE)).toEqual([['a', 'b'], ['c'], ['d']]);
    expect(words(createEmptySong('x', '2026-01-01T00:00:00.000Z'))).toEqual([[]]);
  });

  it('reads typed words without blank lines or trailing spaces', () => {
    expect(slideLines('one  \r\n\n  \ntwo')).toEqual(['one', 'two']);
  });

  it('changes one slide, and clearing it removes it (but keeps an only slide of a group)', () => {
    expect(words(setSlideLines(BASE, 1, ['x', 'y']))).toEqual([['a', 'b'], ['x', 'y'], ['d']]);
    expect(words(setSlideLines(BASE, 1, []))).toEqual([['a', 'b'], ['d']]);
    const emptied = setSlideLines(BASE, 2, []);
    expect(labels(emptied)).toEqual(['Verse 1', 'Chorus']);
    expect(words(emptied)).toEqual([['a', 'b'], ['c'], []]);
  });

  it('inserts a slide into the group before it (or after it, at the start)', () => {
    const s = insertSlide(BASE, 2, ['new']);
    expect(words(s)).toEqual([['a', 'b'], ['c'], ['new'], ['d']]);
    expect(editorSlides(s)[2]?.sectionId).toBe(BASE.sections[0]?.id);
    expect(editorSlides(insertSlide(BASE, 0, ['top']))[0]?.sectionId).toBe(BASE.sections[0]?.id);
    expect(words(insertSlide(BASE, 1, []))).toEqual(words(BASE)); // no words, no slide
  });

  it('duplicates and removes slides; a group left empty goes, the last slide stays', () => {
    expect(words(duplicateSlide(BASE, 2))).toEqual([['a', 'b'], ['c'], ['d'], ['d']]);
    const noChorus = removeSlide(BASE, 2);
    expect(labels(noChorus)).toEqual(['Verse 1']);
    const one = song('[Verse 1]\nonly');
    expect(words(removeSlide(one, 0))).toEqual([[]]);
    expect(one.sections).toHaveLength(1);
  });

  it('moves a slide, joining the group it lands in', () => {
    const toEnd = moveSlide(BASE, 0, 2);
    expect(words(toEnd)).toEqual([['c'], ['d'], ['a', 'b']]);
    expect(editorSlides(toEnd)[2]?.sectionId).toBe(BASE.sections[1]?.id);
    // Within its own group it stays there.
    const within = moveSlide(BASE, 1, 0);
    expect(words(within)).toEqual([['c'], ['a', 'b'], ['d']]);
    expect(labels(within)).toEqual(['Verse 1', 'Chorus']);
    expect(moveSlide(BASE, 1, 1)).toBe(BASE);
  });

  it('splits a long slide into balanced slides', () => {
    const long = song('[Verse 1]\n1\n2\n3\n4\n5');
    expect(words(splitSlide(long, 0, 4))).toEqual([
      ['1', '2', '3'],
      ['4', '5'],
    ]);
  });

  it('groups: renames at a group start, splits a group further in', () => {
    expect(startsGroup(BASE, 0)).toBe(true);
    expect(startsGroup(BASE, 1)).toBe(false);
    const renamed = groupFrom(BASE, 2, 'Refrain');
    expect(renamed.sections[1]).toMatchObject({ label: 'Refrain', kind: 'chorus' });
    const split = groupFrom(BASE, 1, 'Verse 2');
    expect(labels(split)).toEqual(['Verse 1', 'Verse 2', 'Chorus']);
    expect(songSectionsToText(split.sections)).toBe(
      '[Verse 1]\na\nb\n\n[Verse 2]\nc\n\n[Chorus]\nd',
    );
    expect(renameGroup(BASE, BASE.sections[0]?.id ?? '', '  ')).toBe(BASE);
  });

  it('ungroups into the group before, and adds empty groups after the current one', () => {
    const merged = ungroup(BASE, BASE.sections[1]?.id ?? '');
    expect(labels(merged)).toEqual(['Verse 1']);
    expect(words(merged)).toEqual([['a', 'b'], ['c'], ['d']]);
    expect(ungroup(BASE, BASE.sections[0]?.id ?? '')).toBe(BASE);
    const added = addGroup(BASE, 0, 'Bridge');
    expect(labels(added.song)).toEqual(['Verse 1', 'Bridge', 'Chorus']);
    expect(added.index).toBe(2);
    expect(words(added.song)[2]).toEqual([]);
  });

  it('keeps arrangements and translations to the groups that remain', () => {
    const [v, c] = BASE.sections;
    const arranged: Song = {
      ...BASE,
      arrangements: [{ id: 'arr', name: 'A', sectionOrder: [c?.id ?? '', v?.id ?? ''] }],
      translations: { es: [{ id: c?.id ?? '', kind: 'chorus', label: 'Chorus', lines: ['x'] }] },
    };
    const gone = removeSlide(arranged, 2);
    expect(gone.arrangements[0]?.sectionOrder).toEqual([v?.id]);
    expect(gone.translations?.es).toEqual([]);
  });

  it('removes a group with its slides, emptying an only group instead', () => {
    expect(labels(removeGroup(BASE, BASE.sections[0]?.id ?? ''))).toEqual(['Chorus']);
    const one = song('[Verse 1]\nonly');
    const emptied = removeGroup(one, one.sections[0]?.id ?? '');
    expect(labels(emptied)).toEqual(['Verse 1']);
    expect(words(emptied)).toEqual([[]]);
  });

  it('names a new group with the next free label', () => {
    expect(nextGroupLabel(BASE)).toBe('Verse 2');
  });
});

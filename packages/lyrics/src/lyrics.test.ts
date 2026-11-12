import { describe, expect, it } from 'vitest';
import {
  arrangementLabel,
  buildSongSlides,
  createEmptySong,
  hymnToSong,
  inferSectionKind,
  parseArrangementOrder,
  parseSongText,
  songSectionsToText,
  splitSection,
} from './index';

const TEXT = `[Verse 1]
Line one
Line two
Line three
Line four
Line five

[Chorus]
Sing a
Sing b

[Bridge]
Up

Down`;

describe('song text format', () => {
  it('parses sections and kinds', () => {
    const { sections } = parseSongText(TEXT);
    expect(sections.map((s) => [s.label, s.kind])).toEqual([
      ['Verse 1', 'verse'],
      ['Chorus', 'chorus'],
      ['Bridge', 'bridge'],
    ]);
    expect(sections[2]?.lines).toEqual(['Up', '', 'Down']);
  });
  it('round-trips and keeps ids by label', () => {
    const a = parseSongText(TEXT).sections;
    const b = parseSongText(songSectionsToText(a), a).sections;
    expect(b.map((s) => s.id)).toEqual(a.map((s) => s.id));
    expect(songSectionsToText(b)).toBe(songSectionsToText(a));
  });
  it('treats text without headers as verse 1', () => {
    expect(parseSongText('just words').sections[0]?.label).toBe('Verse 1');
  });
  it('infers kinds', () => {
    expect(inferSectionKind('Refrain')).toBe('chorus');
    expect(inferSectionKind('Pre-Chorus')).toBe('pre-chorus');
    expect(inferSectionKind('Coda')).toBe('other');
  });
});

describe('slides', () => {
  it('balances chunks and honours blank-line breaks', () => {
    expect(splitSection(['1', '2', '3', '4', '5'], 4).map((c) => c.length)).toEqual([3, 2]);
    expect(splitSection(['a', '', 'b'], 4)).toEqual([['a'], ['b']]);
  });
  it('follows the arrangement, repeating sections with unique keys', () => {
    const song = createEmptySong('Test', '2026-01-01T00:00:00Z');
    song.sections = parseSongText(TEXT).sections;
    const order = parseArrangementOrder('V1 C B C', song.sections);
    expect(arrangementLabel(order, song.sections)).toBe('V1 C B C');
    song.arrangements = [{ id: song.defaultArrangementId, name: 'Default', sectionOrder: order }];
    const slides = buildSongSlides(song, { maxLines: 4 });
    expect(slides.map((s) => s.label)).toEqual([
      'Verse 1 (1/2)',
      'Verse 1 (2/2)',
      'Chorus',
      'Bridge (1/2)',
      'Bridge (2/2)',
      'Chorus',
    ]);
    expect(new Set(slides.map((s) => s.key)).size).toBe(slides.length);
  });
});

describe('hymnals', () => {
  it('converts hymns with deterministic ids and chorus after each verse', () => {
    const song = hymnToSong(
      { id: 'h', name: 'H' },
      {
        number: '7',
        title: 'T',
        authors: ['A'],
        year: 1800,
        sections: [
          { kind: 'verse', label: 'Verse 1', lines: ['a'] },
          { kind: 'chorus', label: 'Chorus', lines: ['c'] },
          { kind: 'verse', label: 'Verse 2', lines: ['b'] },
        ],
      },
    );
    expect(song.id).toBe('hymn-h-7');
    expect(song.origin).toBe('hymnal');
    const order = song.arrangements[0]?.sectionOrder.map(
      (id) => song.sections.find((s) => s.id === id)?.label,
    );
    expect(order).toEqual(['Verse 1', 'Chorus', 'Verse 2', 'Chorus']);
    expect(song.copyright).toBe('Public domain (1800)');
  });
});

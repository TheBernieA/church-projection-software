import { describe, expect, it } from 'vitest';
import { createEmptySong } from './hymnal';
import { buildSongSlides } from './slides';
import { parseSongText } from './textFormat';
import { CHORD_RE, parseChordLine, stripChords, transposeChord, transposeLine } from './chords';

describe('chords', () => {
  it('recognises chord symbols, not words', () => {
    for (const c of ['G', 'Am', 'F#m7', 'Bb', 'Csus4', 'Dmaj7', 'G/B', 'Ebadd9', 'C#dim', 'E7b9'])
      expect(CHORD_RE.test(c)).toBe(true);
    for (const w of ['Echo', 'x2', 'Verse', 'H', 'Chorus']) expect(CHORD_RE.test(w)).toBe(false);
  });

  it('parses chords out of a line, at the position they are played', () => {
    expect(parseChordLine('[G]Amazing [D]grace')).toEqual({
      text: 'Amazing grace',
      chords: [
        { pos: 0, chord: 'G' },
        { pos: 8, chord: 'D' },
      ],
    });
    expect(stripChords('[G]Amazing [D/F#]grace [x2]')).toBe('Amazing grace [x2]');
    expect(stripChords('No chords here')).toBe('No chords here');
  });

  it('transposes roots and slash basses, keeping the chord quality', () => {
    expect(transposeChord('G', 2)).toBe('A');
    expect(transposeChord('F#m7', 1)).toBe('Gm7');
    expect(transposeChord('D/F#', 2)).toBe('E/G#');
    // Spellings outside both scales still move.
    expect(transposeChord('Cb', 1)).toBe('C');
    expect(transposeChord('E#m', 2)).toBe('Gm');
    expect(transposeChord('Bb', 2)).toBe('C');
    expect(transposeChord('Bb', 3)).toBe('Db'); // flats stay flat
    expect(transposeChord('C', -1)).toBe('B');
    expect(transposeLine('[G]Amazing [D]grace [x2]', 5)).toBe('[C]Amazing [G]grace [x2]');
  });

  it('the room never sees chords; the stage gets them', () => {
    const song = createEmptySong('Amazing Grace', '2026-01-01T00:00:00Z');
    song.sections = parseSongText('[Verse 1]\n[G]Amazing [D]grace\nhow sweet the sound').sections;
    const [slide] = buildSongSlides(song, { maxLines: 4 });
    expect(slide?.lines).toEqual(['Amazing grace', 'how sweet the sound']);
    expect(slide?.chordLines).toEqual(['[G]Amazing [D]grace', 'how sweet the sound']);
  });

  it('a bracket alone on a line is still a section header', () => {
    expect(parseSongText('[Chorus]\n[C]Praise him').sections[0]?.label).toBe('Chorus');
  });
});

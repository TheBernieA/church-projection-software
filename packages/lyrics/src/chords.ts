import { FLATS, SHARPS } from './constants';

/** A note name: letter plus optional sharp/flat (regex source). */
const NOTE = '[A-G](?:#|b)?';
import { type ChordMark } from './types';
/**
 * Chord charts, ChordPro style: chords sit in brackets inside a lyric line, right before the
 * syllable they're played on — `[G]Amazing [D]grace`. A line that is ONLY a bracket
 * (`[Verse 1]`) stays a section header, so plain lyric files are untouched.
 */

/** A chord symbol: root, optional quality/extensions, optional slash bass (e.g. `F#m7/C#`). */
export const CHORD_RE = new RegExp(
  `^${NOTE}(?:maj|min|dim|aug|sus|add|m|M|°|ø|\\+)?\\d*(?:(?:sus|add|maj|b|#)\\d+)*(?:/${NOTE})?$`,
);
const INLINE = /\[([^\]\s]{1,16})\]/g;

/** Split a line into its lyric text and the chords placed over it. */
export function parseChordLine(line: string): { text: string; chords: ChordMark[] } {
  const chords: ChordMark[] = [];
  let text = '';
  let last = 0;
  for (const m of line.matchAll(INLINE)) {
    const chord = m[1] ?? '';
    if (!CHORD_RE.test(chord)) continue; // e.g. "[x2]" or "[Echo]" stays as written
    text += line.slice(last, m.index);
    chords.push({ pos: text.length, chord });
    last = m.index + m[0].length;
  }
  text += line.slice(last);
  return { text, chords };
}

/** The line as the room sees it: chords removed, spacing tidied. */
export function stripChords(line: string): string {
  const { text, chords } = parseChordLine(line);
  return chords.length ? text.replace(/ {2,}/g, ' ').trimEnd() : line;
}

export const hasChords = (line: string): boolean => parseChordLine(line).chords.length > 0;

function transposeNote(note: string, semitones: number, flats: boolean): string {
  const i = SHARPS.indexOf(note) >= 0 ? SHARPS.indexOf(note) : FLATS.indexOf(note);
  if (i < 0) return note;
  const scale = flats ? FLATS : SHARPS;
  return scale[(((i + semitones) % 12) + 12) % 12] ?? note;
}

/**
 * Move a chord up or down by semitones, keeping its quality and slash bass. Flat chords stay
 * flat-spelled (Bb → C → Db), sharp or natural ones use sharps.
 */
export function transposeChord(chord: string, semitones: number): string {
  if (!semitones || !CHORD_RE.test(chord)) return chord;
  const flats = /^[A-G]b/.test(chord);
  return chord.replace(
    new RegExp(`(^|/)(${NOTE})`, 'g'),
    (_, lead: string, note: string) => `${lead}${transposeNote(note, semitones, flats)}`,
  );
}

/** Transpose every chord in a line, leaving the lyrics alone. */
export function transposeLine(line: string, semitones: number): string {
  if (!semitones) return line;
  return line.replace(INLINE, (whole, chord: string) =>
    CHORD_RE.test(chord) ? `[${transposeChord(chord, semitones)}]` : whole,
  );
}

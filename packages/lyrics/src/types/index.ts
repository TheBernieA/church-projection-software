import type { SongSection } from '@lampstand/core';

export interface ParsedSongText {
  sections: SongSection[];
}

export interface ChordMark {
  /** Character position in the chord-free text where the chord is played. */
  pos: number;
  chord: string;
}

export interface LyricSlide {
  /** Stable within a song: `${sectionId}:${chunkIndex}:${occurrence}`. */
  key: string;
  sectionId: string;
  sectionLabel: string;
  /** e.g. "Chorus (2/2)". */
  label: string;
  lines: string[];
  /** Translation lines for bilingual display, if available. */
  translation?: string[];
  /** The lines with their chords (`[G]Amazing grace`), for the stage display only. */
  chordLines?: string[];
}

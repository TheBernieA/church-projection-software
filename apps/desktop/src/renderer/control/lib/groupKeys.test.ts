import { describe, expect, it } from 'vitest';
import { groupHotkey, groupStarts, slideForHotkey } from './groupKeys';

describe('group hotkeys', () => {
  it('gives each usual section its letter', () => {
    expect(groupHotkey('Verse 1')).toBe('A');
    expect(groupHotkey('Verse 2')).toBe('S');
    expect(groupHotkey('verse')).toBe('A');
    expect(groupHotkey('Chorus 1')).toBe('C');
    expect(groupHotkey('Chorus 2')).toBe('X');
    expect(groupHotkey('Pre-Chorus')).toBe('P');
    expect(groupHotkey('Bridge')).toBe('B');
    expect(groupHotkey('Tag')).toBe('T');
    expect(groupHotkey('Ending')).toBe('E');
    expect(groupHotkey('Welcome')).toBeNull();
    expect(groupHotkey(undefined)).toBeNull();
  });

  const song = ['Verse 1', 'Verse 1', 'Chorus', 'Chorus', 'Verse 2', 'Chorus', 'Bridge'].map(
    (group) => ({ group }),
  );

  it('badges the first slide of each section', () => {
    expect([...groupStarts(song)]).toEqual([
      [0, 'A'],
      [2, 'C'],
      [4, 'S'],
      [5, 'C'],
      [6, 'B'],
    ]);
  });

  it('goes to the next time a section comes round, then back to its first', () => {
    expect(slideForHotkey(song, 'c', -1)).toBe(2);
    expect(slideForHotkey(song, 'C', 2)).toBe(5);
    expect(slideForHotkey(song, 'C', 5)).toBe(2);
    expect(slideForHotkey(song, 'B', 0)).toBe(6);
    expect(slideForHotkey(song, 'T', 0)).toBe(-1);
  });
});

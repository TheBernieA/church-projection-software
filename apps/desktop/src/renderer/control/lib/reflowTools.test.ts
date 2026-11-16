import { describe, expect, it } from 'vitest';
import { blockAt, blockStarts, insertBlock, splitLongBlocks, tidyReflow } from './reflow';

const TEXT = '[Welcome]\nWe are glad\n\n[Connect]\nVisit the desk';

describe('reflow tools', () => {
  it('finds where each slide starts, and which one the caret is in', () => {
    expect(blockStarts(TEXT)).toEqual([0, 23]);
    expect(blockAt(TEXT, 3)).toBe(0);
    expect(blockAt(TEXT, 30)).toBe(1);
    expect(blockAt(TEXT, 22)).toBe(0); // the blank line between belongs to the one above
  });

  it('tidies spaces and extra blank lines', () => {
    expect(tidyReflow('  a  \n\n\n\nb \n')).toBe('a\n\nb');
  });

  it('splits long slides, keeping their title', () => {
    expect(splitLongBlocks('[T]\n1\n2\n3', 2)).toBe('[T]\n1\n2\n\n[T]\n3');
    expect(splitLongBlocks('1\n2', 4)).toBe('1\n2');
  });

  it('inserts a new titled slide at the caret', () => {
    const r = insertBlock('one\ntwo', 4, '[Chorus]');
    expect(r.text).toBe('one\n\n[Chorus]\ntwo');
    expect(r.caret).toBe('one\n\n[Chorus]\n'.length);
  });
});

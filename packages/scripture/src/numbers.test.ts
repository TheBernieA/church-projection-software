import { describe, expect, it } from 'vitest';
import { normalizeSpokenNumbers, readNumberPhrase, wordsToNumber } from './numbers';

describe('wordsToNumber', () => {
  it.each([
    ['one', 1],
    ['nine', 9],
    ['ten', 10],
    ['thirteen', 13],
    ['nineteen', 19],
    ['twenty', 20],
    ['twenty-three', 23],
    ['twenty three', 23],
    ['Twenty-Three', 23],
    ['forty two', 42],
    ['fourty two', 42],
    ['ninety-nine', 99],
    ['a hundred', 100],
    ['hundred', 100],
    ['one hundred', 100],
    ['one hundred and nineteen', 119],
    ['one hundred nineteen', 119],
    ['one hundred and five', 105],
    ['one hundred and fifty', 150],
    ['one hundred seventy-six', 176],
    ['two hundred', 200],
    ['first', 1],
    ['third', 3],
    ['sixteenth', 16],
    ['twentieth', 20],
    ['twenty-first', 21],
    ['hundredth', 100],
    ['one hundredth', 100],
    ['  23 ', 23],
  ] as const)('%s → %d', (text, n) => {
    expect(wordsToNumber(text)).toBe(n);
  });

  it.each([
    '',
    'hello',
    'a',
    'and',
    'three sixteen',
    'twenty twenty',
    'one hundred and',
    'hundredth and five',
    'sixteen three',
    'twenty sixteen',
    'zero',
    'constructor',
    'a ten',
    'twenty three four',
  ])('%j → null', (text) => {
    expect(wordsToNumber(text)).toBeNull();
  });
});

describe('readNumberPhrase', () => {
  it('reads the longest phrase and reports its length', () => {
    expect(readNumberPhrase(['twenty', 'three', 'sixteen'], 0)).toEqual({
      value: 23,
      ordinal: false,
      length: 2,
    });
  });
  it('flags ordinals', () => {
    expect(readNumberPhrase(['second', 'kings'], 0)).toEqual({
      value: 2,
      ordinal: true,
      length: 1,
    });
  });
  it('returns null for non-numbers', () => {
    expect(readNumberPhrase(['john'], 0)).toBeNull();
  });
  it('handles a start offset', () => {
    expect(readNumberPhrase(['psalm', 'one', 'hundred', 'and', 'nineteen'], 1)?.value).toBe(119);
  });
});

describe('normalizeSpokenNumbers', () => {
  it.each([
    ['John three sixteen', 'John 3 16'],
    ['Psalm one hundred and nineteen', 'Psalm 119'],
    ['Psalm twenty-three', 'Psalm 23'],
    ['first John one nine', '1 John 1 9'],
    ['verses four through seven', 'verses 4 through 7'],
    ['I have two children', 'I have 2 children'],
    ['nothing to see here', 'nothing to see here'],
    ['a hundred sheep', '100 sheep'],
    ['a lamb', 'a lamb'],
    ['twenty, three', '20, 3'],
    ['the sixteenth verse', 'the 16 verse'],
    ['one hundred and the rest', '100 and the rest'],
    ['', ''],
  ] as const)('%j → %j', (input, output) => {
    expect(normalizeSpokenNumbers(input)).toBe(output);
  });
});

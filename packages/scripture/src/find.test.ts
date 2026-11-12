import { describe, expect, it } from 'vitest';
import { findReferencesInText } from './find';
import { compact } from './test-helpers';

function refs(text: string, opts?: Parameters<typeof findReferencesInText>[1]): string[] {
  return findReferencesInText(text, opts).map((r) => compact(r.passages));
}

describe('findReferencesInText — positives', () => {
  const cases: readonly (readonly [string, string[]])[] = [
    ["turn with me to John chapter 3 verse 16 and let's read", ['JHN 3:16-3:16']],
    ['turn with me to John three sixteen', ['JHN 3:16-3:16']],
    ['open your Bibles to Romans 8:28', ['ROM 8:28-8:28']],
    ['first Corinthians thirteen four to seven says love is patient', ['1CO 13:4-13:7']],
    ['in Second Kings chapter five we meet Naaman', ['2KI 5:1-5:999']],
    ['Psalm one hundred and nineteen verse one hundred and five', ['PSA 119:105-119:105']],
    ['the twenty third Psalm', []],
    ['Psalm twenty-three is my favourite', ['PSA 23:1-23:999']],
    ['read with me from the gospel of John chapter 1 verse 1', ['JHN 1:1-1:1']],
    ['the book of Acts chapter 2 verse 38', ['ACT 2:38-2:38']],
    ['Jude verse three', ['JUD 1:3-1:3']],
    ['John 3:16 and Romans 5:8', ['JHN 3:16-3:16', 'ROM 5:8-5:8']],
    ['John 3:16, 1 John 4:8', ['JHN 3:16-3:16', '1JN 4:8-4:8']],
    ['John 3:16 and 2 Peter 3:9', ['JHN 3:16-3:16', '2PE 3:9-3:9']],
    ['Romans 8 verses 28 and 29', ['ROM 8:28-8:29']],
    ['Genesis chapter 1 verse 1 through chapter 2 verse 3', ['GEN 1:1-2:3']],
    ['Song of Solomon chapter 2', ['SNG 2:1-2:999']],
    ['song of songs two one', ['SNG 2:1-2:1']],
    ['Mark chapter 16 verse 15', ['MRK 16:15-16:15']],
    ['Job 19:25 says I know my redeemer lives', ['JOB 19:25-19:25']],
    ['Hebrews eleven one now faith is', ['HEB 11:1-11:1']],
    ['Philippians four thirteen', ['PHP 4:13-4:13']],
    ['Revelation chapter twenty one', ['REV 21:1-21:999']],
    ['Revelations 3 20', ['REV 3:20-3:20']],
    ['Ecclesiastes 3 verse 1', ['ECC 3:1-3:1']],
  ];
  it.each(cases)('%s', (text, expected) => {
    expect(refs(text)).toEqual(expected);
  });
});

describe('findReferencesInText — false-positive guards', () => {
  it.each([
    'I have two children',
    'Mark my words, this will happen',
    'I had a job interview on Monday',
    'the acts of kindness we show',
    'numbers are going up this year',
    'do not be judges of one another',
    'his lamentations were loud',
    'it was a revelation to me',
    'the kings of the earth',
    'Is it 3 or 4 people',
    'I am 3 years older',
    'Ex 2 boyfriend',
    'Phil 2 is my friend',
    'First, John said hello',
    'the song was 3 minutes long',
    'that verse is beautiful',
    'chapter 4 of my life',
    'John has 22 cousins',
    'we sang Psalm',
    'I John saw the holy city',
  ])('%s', (text) => {
    expect(refs(text)).toEqual([]);
  });

  it('common-word books with a bare number score low', () => {
    const [r] = findReferencesInText('I gave Mark 2 dollars');
    expect(r?.confidence).toBeLessThan(0.4);
  });

  it('common-word books with "chapter" score normally', () => {
    const [r] = findReferencesInText('Mark chapter 2');
    expect(r?.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('explicit chapter:verse scores higher than a bare chapter', () => {
    const [a] = findReferencesInText('John 3:16');
    const [b] = findReferencesInText('John 3');
    expect(a!.confidence).toBeGreaterThan(b!.confidence);
  });

  it('bare family name is detected but with reduced confidence', () => {
    const [r] = findReferencesInText('Corinthians 13 verse 4');
    expect(compact(r?.passages ?? [])).toBe('1CO 13:4-13:4');
    expect(r?.confidence).toBeLessThan(0.8);
  });
});

describe('findReferencesInText — context', () => {
  const ctx = { book: 'JHN', chapter: 3 } as const;

  it.each([
    ["let's continue to verse 18", 'JHN 3:18-3:18'],
    ['look at verses 20 to 22', 'JHN 3:20-3:22'],
    ['same chapter verse 20', 'JHN 3:20-3:20'],
    ['and in chapter 4 verse 2 he says', 'JHN 4:2-4:2'],
    ['verse sixteen and seventeen', 'JHN 3:16-3:17'],
  ] as const)('%s', (text, expected) => {
    expect(refs(text, { context: ctx })).toEqual([expected]);
  });

  it('context references need a context', () => {
    expect(refs("let's continue to verse 18")).toEqual([]);
  });

  it('a detection becomes the context for later phrases', () => {
    expect(refs('Romans 8:28 is great, and verse 31 too, then verse 38')).toEqual([
      'ROM 8:28-8:28',
      'ROM 8:31-8:31',
      'ROM 8:38-8:38',
    ]);
  });

  it('"verse 16 … and verse 17" across a pause', () => {
    expect(refs('John 3 verse 16. And verse 17 says', {})).toEqual([
      'JHN 3:16-3:16',
      'JHN 3:17-3:17',
    ]);
  });

  it('a bare "verse" without a number is ignored', () => {
    expect(refs('the next verse says', { context: ctx })).toEqual([]);
  });

  it('context chapter-only scores lower than context verse', () => {
    const [a] = findReferencesInText('chapter 4', { context: ctx });
    const [b] = findReferencesInText('verse 4', { context: ctx });
    expect(a!.confidence).toBeLessThan(b!.confidence);
  });
});

describe('findReferencesInText — offsets', () => {
  it('reports exact spans in the original text', () => {
    const text = "turn with me to John chapter 3 verse 16 and let's read";
    const [r] = findReferencesInText(text);
    expect(r?.text).toBe('John chapter 3 verse 16');
    expect(text.slice(r!.start, r!.end)).toBe(r?.text);
  });

  it('spans cover spoken numbers in full', () => {
    const text = 'Psalm one hundred and nineteen verse one hundred and five, amen';
    const [r] = findReferencesInText(text);
    expect(r?.text).toBe('Psalm one hundred and nineteen verse one hundred and five');
  });

  it('spans include "the gospel of" lead-ins', () => {
    const [r] = findReferencesInText('from the gospel of John 3:16 we learn');
    expect(r?.text).toBe('the gospel of John 3:16');
  });

  it('multiple references keep ordered, non-overlapping spans', () => {
    const rs = findReferencesInText('John 3:16 and Romans 5:8 and Ephesians 2:8-9');
    expect(rs.map((r) => r.text)).toEqual(['John 3:16', 'Romans 5:8', 'Ephesians 2:8-9']);
    for (let i = 1; i < rs.length; i++) expect(rs[i]!.start).toBeGreaterThanOrEqual(rs[i - 1]!.end);
  });

  it('works with other languages', () => {
    expect(refs('lisons Jean chapitre 3', { lang: 'fr' })).toEqual(['JHN 3:1-3:999']);
  });

  it('empty text yields nothing', () => {
    expect(findReferencesInText('')).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { SongSchema } from '@lampstand/core';
import { decodeTextFile, mergeChordLine, parseSongFile, songFromImport } from './songImport';

const labels = (s: { sections: { label: string }[] } | null) => s?.sections.map((x) => x.label);

describe('parseSongFile', () => {
  it('reads a SongSelect lyrics download with its credits', () => {
    const txt = [
      'Amazing Grace (My Chains Are Gone)',
      '',
      'Verse 1',
      'Amazing grace how sweet the sound',
      'That saved a wretch like me',
      '',
      'Chorus',
      'My chains are gone',
      'I’ve been set free',
      '',
      'Verse 2',
      '’Twas grace that taught my heart to fear',
      '',
      'CCLI Song # 4768151',
      'Chris Tomlin | John Newton | Louie Giglio',
      '© 2006 sixsteps Music (Admin. by Capitol CMG Publishing)',
      'For use solely with the SongSelect® Terms of Use. All rights reserved. www.ccli.com',
      'CCLI License # 1234567',
    ].join('\r\n');
    const s = parseSongFile('AmazingGrace.txt', txt);
    expect(s?.format).toBe('songselect');
    expect(s?.title).toBe('Amazing Grace (My Chains Are Gone)');
    expect(labels(s)).toEqual(['Verse 1', 'Chorus', 'Verse 2']);
    expect(s?.sections[1]?.kind).toBe('chorus');
    expect(s?.sections[0]?.lines).toEqual([
      'Amazing grace how sweet the sound',
      'That saved a wretch like me',
    ]);
    expect(s?.ccliNumber).toBe('4768151');
    expect(s?.authors).toEqual(['Chris Tomlin', 'John Newton', 'Louie Giglio']);
    expect(s?.copyright).toMatch(/^© 2006 sixsteps/);
    // Licence and terms lines are not words.
    expect(JSON.stringify(s?.sections)).not.toMatch(/CCLI|SongSelect/);
  });

  it('reads a SongSelect .usr file', () => {
    const usr = [
      '[File]',
      'Type=SongSelect Import File',
      'Version=3.0',
      '[S A22025]',
      'Title=Amazing Grace',
      'Author=John Newton',
      'Copyright=Public Domain',
      'Keys=G',
      'Fields=Verse 1/tVerse 2',
      'Words=Amazing grace how sweet the sound/nThat saved a wretch like me/t’Twas grace that taught/nmy heart to fear',
    ].join('\n');
    const s = parseSongFile('song.usr', usr);
    expect(s?.format).toBe('usr');
    expect(s?.title).toBe('Amazing Grace');
    expect(s?.ccliNumber).toBe('22025');
    expect(s?.key).toBe('G');
    expect(labels(s)).toEqual(['Verse 1', 'Verse 2']);
    expect(s?.sections[1]?.lines).toEqual(['’Twas grace that taught', 'my heart to fear']);
  });

  it('reads ChordPro, keeping chords inline and SongSelect comment headers', () => {
    const cho = [
      '{title: Amazing Grace}',
      '{artist: John Newton}',
      '{key: G}',
      '{tempo: 72}',
      '',
      '{comment: Verse 1}',
      '[G]Amazing [G7]grace how [C]sweet the [G]sound',
      '',
      '{start_of_chorus}',
      '[C]My chains are [G]gone',
      '{end_of_chorus}',
      '{start_of_tab}',
      'e|---0---|',
      '{end_of_tab}',
    ].join('\n');
    const s = parseSongFile('grace.cho', cho);
    expect(s?.format).toBe('chordpro');
    expect(s?.title).toBe('Amazing Grace');
    expect(s?.authors).toEqual(['John Newton']);
    expect(s?.key).toBe('G');
    expect(s?.tempo).toBe(72);
    expect(labels(s)).toEqual(['Verse 1', 'Chorus']);
    expect(s?.sections[0]?.lines).toEqual(['[G]Amazing [G7]grace how [C]sweet the [G]sound']);
    expect(JSON.stringify(s)).not.toContain('e|---');
  });

  it('reads ChordPro saved as .txt (as SongSelect sometimes does)', () => {
    const s = parseSongFile('x.txt', '{title: Here}\n{c: Chorus}\n[D]Here I am');
    expect(s?.format).toBe('chordpro');
    expect(labels(s)).toEqual(['Chorus']);
  });

  it('reads OpenLyrics with chords, slides and the verse order', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9">
  <properties>
    <titles><title>Amazing Grace</title></titles>
    <authors><author>John Newton</author></authors>
    <copyright>Public Domain</copyright>
    <ccliNo>22025</ccliNo>
    <tempo type="bpm">90</tempo>
    <verseOrder>v1 c v2 c</verseOrder>
  </properties>
  <lyrics>
    <verse name="v1"><lines><chord name="G"/>Amazing grace how sweet<br/>the sound &amp; more</lines><lines>Second slide</lines></verse>
    <verse name="c"><lines>Chorus line</lines></verse>
    <verse name="v2"><lines>Verse two</lines></verse>
  </lyrics>
</song>`;
    const s = parseSongFile('grace.xml', xml);
    expect(s?.format).toBe('openlyrics');
    expect(s?.title).toBe('Amazing Grace');
    expect(s?.tempo).toBe(90);
    expect(labels(s)).toEqual(['Verse 1', 'Chorus', 'Verse 2']);
    expect(s?.sections[0]?.lines).toEqual([
      '[G]Amazing grace how sweet',
      'the sound & more',
      '',
      'Second slide',
    ]);
    const ids = s?.sections.map((x) => x.id) ?? [];
    expect(s?.order).toEqual([ids[0], ids[1], ids[2], ids[1]]);
  });

  it('reads an OpenSong song, chord lines and numbered verses included', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<song>
  <title>Amazing Grace</title>
  <author>John Newton</author>
  <presentation>V1 C V2</presentation>
  <lyrics>[V]
.G       C
1Amazing grace
2Twas grace
[C]
 Chorus words
; a comment
</lyrics>
</song>`;
    const s = parseSongFile('Amazing Grace', xml);
    expect(s?.format).toBe('opensong');
    expect(labels(s)).toEqual(['Verse 1', 'Verse 2', 'Chorus']);
    expect(s?.sections[0]?.lines).toEqual(['[G]Amazing [C]grace']);
    expect(s?.sections[2]?.lines).toEqual(['Chorus words']);
    expect(s?.order.length).toBe(3);
  });

  it('reads plain text: Lampstand brackets, paragraphs, and chords over words', () => {
    expect(labels(parseSongFile('a.txt', 'My Song\n\n[Verse 1]\nOne\n\n[Chorus]\nTwo'))).toEqual([
      'Verse 1',
      'Chorus',
    ]);
    expect(parseSongFile('a.txt', 'My Song\n\n[Verse 1]\nOne')?.title).toBe('My Song');
    const paras = parseSongFile('Hymn.txt', 'Line one\nLine two\n\nLine three');
    expect(paras?.title).toBe('Hymn');
    expect(labels(paras)).toEqual(['Verse 1', 'Verse 2']);
    const chart = parseSongFile('c.txt', 'Song\n\nVerse 1\nG        D\nAmazing grace');
    expect(chart?.sections[0]?.lines).toEqual(['[G]Amazing g[D]race']);
  });

  it('returns null for files with no words', () => {
    expect(parseSongFile('e.txt', '\n\n')).toBeNull();
    expect(parseSongFile('e.xml', '<html><body/></html>')).toBeNull();
  });

  it('makes a valid Lampstand song', () => {
    const imp = parseSongFile('x.txt', 'T\n\nVerse 1\nWords\n\nCCLI Song # 9\nA | B\n© 2020 X');
    expect(imp).not.toBeNull();
    const song = songFromImport(imp!, '2026-11-21T00:00:00.000Z');
    expect(SongSchema.safeParse(song).success).toBe(true);
    expect(song.origin).toBe('imported');
    expect(song.ccliNumber).toBe('9');
  });
});

describe('mergeChordLine', () => {
  it('places chords at their column, past the end too', () => {
    expect(mergeChordLine('G    D', 'Amazing')).toBe('[G]Amazi[D]ng');
    expect(mergeChordLine('G         C', 'Hi')).toBe('[G]Hi        [C]');
  });
});

describe('decodeTextFile', () => {
  it('reads UTF-8 (with or without a BOM), UTF-16 with a BOM, and Windows-1252', () => {
    expect(decodeTextFile(new TextEncoder().encode('\uFEFF\u2019Twas'))).toBe('\u2019Twas');
    expect(decodeTextFile(new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x19, 0x20]))).toBe('A\u2019');
    expect(decodeTextFile(new Uint8Array([0xfe, 0xff, 0x00, 0x41]))).toBe('A');
    // 0x92 is a curly apostrophe in Windows-1252, and not valid UTF-8 by itself.
    expect(decodeTextFile(new Uint8Array([0x49, 0x92, 0x6d]))).toBe('I\u2019m');
  });
});

import { describe, expect, it } from 'vitest';
import { matchVersion, parseVoiceCommand } from './voiceCommands';

const kind = (t: string, wakeWord?: string) =>
  parseVoiceCommand(t, wakeWord !== undefined ? { wakeWord } : {})?.kind ?? null;

describe('parseVoiceCommand', () => {
  it.each([
    ['Next', 'next'],
    ['next slide please', 'next'],
    ['Okay, next one.', 'next'],
    ['Go back.', 'previous'],
    ['previous slide', 'previous'],
    ['Next song', 'nextItem'],
    ['next verse', 'nextVerse'],
    ['previous verse', 'previousVerse'],
    ['Go live', 'goLive'],
    ['Clear the screen', 'clear'],
    ['go to black', 'black'],
    ['show the logo', 'logo'],
    ['bring it back', 'restore'],
  ])('%s → %s', (text, expected) => {
    expect(kind(text)).toBe(expected);
  });

  it.each([
    'The next thing Paul says is about grace',
    'go back to the beginning of the story with me',
    'we will clear our minds before God',
    'He is the light and there is no darkness, no black at all',
    'Last one',
    '',
    'right',
  ])('preaching is not a command: %s', (text) => {
    expect(kind(text)).toBeNull();
  });

  it('a long sentence is never a command', () => {
    expect(kind('next next next next next next next next next next next')).toBeNull();
  });

  it('with a wake word, only utterances that start with it count', () => {
    expect(kind('Lampstand, next slide', 'Lampstand')).toBe('next');
    expect(kind('Hey Lampstand go back', 'lampstand')).toBe('previous');
    expect(kind('next slide', 'Lampstand')).toBeNull();
    expect(kind('the lampstand is next', 'Lampstand')).toBeNull();
  });

  it('shows a spoken passage', () => {
    const c = parseVoiceCommand('Show John 3:16');
    expect(c?.kind).toBe('show');
    if (c?.kind === 'show')
      expect(c.passages[0]).toEqual({
        start: { book: 'JHN', chapter: 3, verse: 16 },
        end: { book: 'JHN', chapter: 3, verse: 16 },
      });
    const r = parseVoiceCommand('go to romans chapter eight verse twenty eight');
    expect(r?.kind === 'show' && r.passages[0]?.start).toEqual({
      book: 'ROM',
      chapter: 8,
      verse: 28,
    });
  });

  it('a book alone is too vague to show', () => {
    expect(kind('show John')).toBeNull();
  });

  it('switches version by name', () => {
    expect(parseVoiceCommand('switch to KJV')).toEqual({ kind: 'version', name: 'kjv' });
    expect(parseVoiceCommand('use the King James version')).toEqual({
      kind: 'version',
      name: 'king james',
    });
    expect(parseVoiceCommand('switch to the next one')?.kind).not.toBe('version');
  });
});

describe('matchVersion', () => {
  const versions = [
    { id: 'kjv', name: 'King James Version', abbreviation: 'KJV' },
    { id: 'nkjv', name: 'New King James Version', abbreviation: 'NKJV' },
    { id: 'web', name: 'World English Bible', abbreviation: 'WEB' },
  ];
  it('finds a version by abbreviation or name', () => {
    expect(matchVersion('kjv', versions)).toBe('kjv');
    expect(matchVersion('K J V', versions)).toBe('kjv');
    expect(matchVersion('the new king james version', versions)).toBe('nkjv');
    expect(matchVersion('king james', versions)).toBe('kjv');
    expect(matchVersion('world english', versions)).toBe('web');
  });
  it('nothing that fits is nothing', () => {
    expect(matchVersion('message', versions)).toBeNull();
    expect(matchVersion('', versions)).toBeNull();
  });
});

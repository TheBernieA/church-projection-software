import type { PassageRef } from '@lampstand/core';
import { parseReference } from '@lampstand/scripture';

/** What a spoken command asks for. The control window maps each to the same action as a click. */
export type VoiceCommand =
  | { kind: 'next' }
  | { kind: 'previous' }
  | { kind: 'nextItem' }
  | { kind: 'previousItem' }
  | { kind: 'nextVerse' }
  | { kind: 'previousVerse' }
  | { kind: 'goLive' }
  | { kind: 'clear' }
  | { kind: 'black' }
  | { kind: 'logo' }
  | { kind: 'restore' }
  | { kind: 'show'; passages: PassageRef[] }
  | { kind: 'version'; name: string };

export type VoiceCommandKind = VoiceCommand['kind'];

export interface VoiceCommandOptions {
  /**
   * A word the command must start with ("Lampstand, next"). Empty: none, and then only an
   * utterance that is nothing but a command counts.
   */
  readonly wakeWord?: string;
  /** Alias language for book names in "show John 3:16". */
  readonly lang?: string;
}

/**
 * Words people put around a command that change nothing ("okay next slide please"). Removed
 * before matching, never inside a reference.
 */
const FILLERS = new Set([
  'please',
  'okay',
  'ok',
  'alright',
  'right',
  'um',
  'uh',
  'erm',
  'so',
  'now',
  'and',
  'then',
  'just',
  'can',
  'could',
  'you',
  'lets',
  'let',
  'us',
  'the',
  'a',
]);

/** Exact phrases (after fillers are gone), by command. Longest first wins. */
const PHRASES: Record<Exclude<VoiceCommandKind, 'show' | 'version'>, readonly string[]> = {
  next: ['next', 'next slide', 'next one', 'go next', 'go forward', 'forward', 'advance'],
  previous: [
    'previous',
    'previous slide',
    'previous one',
    'back',
    'go back',
    'back one',
    'one back',
  ],
  nextItem: ['next song', 'next item', 'next hymn', 'next reading'],
  previousItem: ['previous song', 'previous item', 'previous hymn', 'previous reading'],
  nextVerse: ['next verse', 'following verse', 'verse after'],
  previousVerse: ['previous verse', 'verse before'],
  goLive: ['go live', 'show it', 'take it', 'take it live', 'put it up'],
  clear: ['clear', 'clear screen', 'clear slide', 'clear it', 'take it down', 'take it off'],
  black: ['black', 'black screen', 'go black', 'go to black', 'blackout'],
  logo: ['logo', 'show logo', 'logo screen', 'go to logo'],
  restore: ['bring it back', 'restore', 'put it back'],
};

const LOOKUP: ReadonlyMap<string, VoiceCommandKind> = new Map(
  Object.entries(PHRASES).flatMap(([kind, list]) =>
    list.map((p) => [p, kind as VoiceCommandKind] as const),
  ),
);

/** Verbs that start "show John 3:16" / "switch to KJV". */
const SHOW_VERBS = ['show', 'show me', 'go to', 'turn to', 'open', 'display', 'put up'];
const VERSION_VERBS = ['switch to', 'change to', 'use', 'show in', 'read from'];
const VERSION_SUFFIX = new Set(['version', 'translation', 'bible']);

/** Longest utterance (in words, fillers included) still taken as a command. */
const MAX_WORDS = 10;

/** Lower case, apostrophes dropped ("let's" → "lets"), anything else non-alphanumeric a space. */
export function normalizeUtterance(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^\p{L}\p{N}:]+/gu, ' ')
    .trim();
}

function stripFillers(words: readonly string[]): string[] {
  let a = 0;
  let b = words.length;
  // Only from the ends: "go to the next" keeps its inner words for matching.
  while (a < b && FILLERS.has(words[a] ?? '')) a += 1;
  while (b > a && FILLERS.has(words[b - 1] ?? '')) b -= 1;
  return words.slice(a, b).filter((w) => w !== 'please');
}

function afterVerb(phrase: string, verbs: readonly string[]): string | null {
  for (const v of verbs) {
    if (phrase === v) return null;
    if (phrase.startsWith(`${v} `)) return phrase.slice(v.length + 1);
  }
  return null;
}

/**
 * The command a whole utterance is, or null. Strict on purpose: preaching that merely contains
 * "next" or "go back" is not a command, so the utterance must be the command and nothing else
 * (fillers aside), and with a wake word set it must start with it.
 */
export function parseVoiceCommand(
  text: string,
  opts: VoiceCommandOptions = {},
): VoiceCommand | null {
  let words = normalizeUtterance(text).split(' ').filter(Boolean);
  if (words.length === 0 || words.length > MAX_WORDS) return null;
  const wake = normalizeUtterance(opts.wakeWord ?? '');
  if (wake) {
    const wakeWords = wake.split(' ');
    const at = words.findIndex((_, i) => wakeWords.every((w, j) => words[i + j] === w));
    // The wake word starts the utterance (a "hey" or "okay" before it is fine).
    if (at < 0 || !words.slice(0, at).every((w) => FILLERS.has(w) || w === 'hey')) return null;
    words = words.slice(at + wakeWords.length);
  }
  const phrase = stripFillers(words).join(' ');
  if (!phrase) return null;

  // Fillers inside a fixed phrase don't matter either ("show the logo", "go to the next one").
  const loose = phrase
    .split(' ')
    .filter((w) => !FILLERS.has(w))
    .join(' ');
  const kind = LOOKUP.get(phrase) ?? LOOKUP.get(loose);
  if (kind && kind !== 'show' && kind !== 'version') return { kind };

  const version = afterVerb(phrase, VERSION_VERBS);
  if (version) {
    const parts = version.split(' ').filter((w) => !FILLERS.has(w));
    while (parts.length > 1 && VERSION_SUFFIX.has(parts[parts.length - 1] ?? '')) parts.pop();
    const name = parts.join(' ');
    // "use the next one" etc. is not a version name.
    if (name && !LOOKUP.has(name) && parts.length <= 4) return { kind: 'version', name };
  }

  const ref = afterVerb(phrase, SHOW_VERBS);
  if (ref) {
    const best = parseReference(ref, opts.lang !== undefined ? { lang: opts.lang } : {})[0];
    // A book alone ("show John") is too vague to put on screen.
    if (best && best.confidence >= 0.8 && best.passages.length > 0)
      return { kind: 'show', passages: best.passages };
  }
  return null;
}

/** Every phrase that works, for the help text (command kind → examples). */
export function voiceCommandExamples(): Record<string, readonly string[]> {
  return {
    ...PHRASES,
    show: ['show John 3:16', 'go to Romans 8 verse 28'],
    version: ['switch to KJV', 'use the NIV'],
  };
}

/** A Bible version as far as matching a spoken name needs it. */
export interface NamedVersion {
  readonly id: string;
  readonly name: string;
  readonly abbreviation: string;
}

/**
 * The installed version a spoken name means: "KJV", "K J V", "king james", "the new
 * international version" → its id; null when none fits (or several fit equally).
 */
export function matchVersion(spoken: string, versions: readonly NamedVersion[]): string | null {
  const said = normalizeUtterance(spoken).replace(/\b(the|version|translation|bible)\b/g, ' ');
  const squashed = said.replace(/\s+/g, '');
  const words = said.split(/\s+/).filter(Boolean);
  if (!squashed) return null;
  let best: { id: string; score: number } | null = null;
  let tie = false;
  for (const v of versions) {
    const abbr = normalizeUtterance(v.abbreviation).replace(/\s+/g, '');
    const id = normalizeUtterance(v.id).replace(/\s+/g, '');
    const name = normalizeUtterance(v.name).replace(/\b(the|version|translation|bible)\b/g, ' ');
    const nameWords = name.split(/\s+/).filter(Boolean);
    let score = 0;
    if (squashed === abbr || squashed === id) score = 1;
    else if (name.replace(/\s+/g, '') === squashed) score = 0.95;
    else if (words.length && words.every((w) => nameWords.includes(w)))
      score = 0.6 + 0.3 * (words.length / Math.max(1, nameWords.length));
    if (score === 0) continue;
    if (!best || score > best.score) {
      best = { id: v.id, score };
      tie = false;
    } else if (score === best.score) tie = true;
  }
  return best && !tie ? best.id : null;
}

/** Where "next" / "go back" goes from the slide on screen. */
export type StepTarget = 'slide' | 'verse';

/**
 * "Next" on scripture that isn't in the playlist (a verse put up by voice, by listening or from
 * the Bible) runs on through the chapter: past its last slide comes the next verse, before its
 * first the verse before. Everything else steps slides as the monitor's arrows do (a playlist
 * item's last slide leads to the next item).
 */
export function stepTarget(on: {
  readonly scripture: boolean;
  readonly inPlaylist: boolean;
  readonly index: number;
  readonly slides: number;
  readonly delta: 1 | -1;
}): StepTarget {
  const next = on.index + on.delta;
  const pastEnd = next < 0 || next >= on.slides;
  return on.scripture && !on.inPlaylist && pastEnd ? 'verse' : 'slide';
}

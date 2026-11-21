import { newId, type Song, type SongSection } from '@lampstand/core';
import { CHORD_RE } from './chords';
import { inferSectionKind, parseSongText } from './textFormat';

/**
 * Song files from other software, read into Lampstand songs:
 *
 * - SongSelect (CCLI) lyrics downloads: the plain-text file (title, sections, then the
 *   "CCLI Song #" credits) and the older .usr file.
 * - ChordPro (.cho, .chordpro, .chopro, .crd; SongSelect's chord sheets come this way too).
 * - OpenLyrics XML (OpenLP, and others that export it) and OpenSong songs.
 * - Plain text: Lampstand's own `[Verse 1]` format, a title over paragraphs, and chord charts
 *   with the chords on their own line above the words.
 */

export type SongFileFormat = 'songselect' | 'usr' | 'chordpro' | 'openlyrics' | 'opensong' | 'text';

export interface ImportedSong {
  format: SongFileFormat;
  title: string;
  authors: string[];
  copyright?: string;
  ccliNumber?: string;
  key?: string;
  tempo?: number;
  sections: SongSection[];
  /** The order the sections are sung in, as section ids (empty: as written). */
  order: string[];
  /** The words' language (BCP-47), when the file says. */
  language?: string;
  /** Translations by language: each section's lines, under the same id as the section. */
  translations?: Record<string, SongSection[]>;
}

/** File extensions the importer reads (for the open dialog). */
export const SONG_FILE_EXTENSIONS = [
  'txt',
  'usr',
  'cho',
  'chordpro',
  'chopro',
  'crd',
  'xml',
  'song',
] as const;

const MAX_LINE = 500;
const MAX_LINES = 200;
const MAX_SECTIONS = 100;

const SECTION_WORD =
  '(?:verse|chorus|refrain|pre[\\s-]?chorus|bridge|tag|intro|outro|ending|interlude|instrumental|vamp|turnaround|misc(?:ellaneous)?|coda|stanza|post[\\s-]?chorus)';
/** A line that is a section's name by itself: "Verse 1", "Chorus 2", "Bridge (x2)". */
const LABEL_LINE = new RegExp(
  `^\\s*(${SECTION_WORD}(?:\\s*\\d+[a-z]?)?)\\s*(?:\\([^)]{0,30}\\))?\\s*:?\\s*$`,
  'i',
);

const titleCase = (s: string): string =>
  s.replace(/\b([a-z])([a-z]*)/gi, (_m, a: string, b: string) => a.toUpperCase() + b.toLowerCase());

/** "v1" → "Verse 1", "C" → "Chorus", "pc2" → "Pre-Chorus 2" (OpenLyrics / OpenSong names). */
export function expandSectionName(name: string): string {
  const m = /^\s*([a-z]+)\s*(\d*[a-z]?)\s*$/i.exec(name);
  if (!m) return name.trim();
  const short: Record<string, string> = {
    v: 'Verse',
    c: 'Chorus',
    b: 'Bridge',
    p: 'Pre-Chorus',
    pc: 'Pre-Chorus',
    t: 'Tag',
    i: 'Intro',
    o: 'Outro',
    e: 'Ending',
    r: 'Refrain',
  };
  const word = short[(m[1] ?? '').toLowerCase()];
  if (!word) return titleCase(name.trim());
  return m[2] ? `${word} ${m[2]}` : word;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Is this line only chords ("G   D/F#  Em7   C")? */
function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  return (
    tokens.length > 0 &&
    tokens.every((t) => CHORD_RE.test(t) || /^[|/(x\d)-]+$/.test(t)) &&
    tokens.some((t) => CHORD_RE.test(t))
  );
}

/** Chords on their own line over the words, written into the words as `[G]Amazing`. */
export function mergeChordLine(chords: string, words: string): string {
  const marks: { pos: number; chord: string }[] = [];
  for (const m of chords.matchAll(/\S+/g))
    if (CHORD_RE.test(m[0])) marks.push({ pos: m.index, chord: m[0] });
  let out = words.padEnd(marks.length ? (marks[marks.length - 1]?.pos ?? 0) : 0);
  for (const { pos, chord } of [...marks].reverse())
    out = `${out.slice(0, pos)}[${chord}]${out.slice(pos)}`;
  return out.trimEnd();
}

/** Turn chord-over-words pairs into inline chords; a chord line with no words under it stays. */
function inlineChords(lines: string[], isChords: (l: string) => boolean = isChordLine): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const next = lines[i + 1];
    if (isChords(line) && next !== undefined && next.trim() && !isChords(next)) {
      out.push(mergeChordLine(line, next));
      i++;
    } else if (isChords(line)) {
      out.push(
        line
          .trim()
          .split(/\s+/)
          .filter((t) => CHORD_RE.test(t))
          .map((c) => `[${c}]`)
          .join(' '),
      );
    } else out.push(line);
  }
  return out;
}

/** A section with a fresh id, its kind from its name, its lines tidied and within limits. */
function section(label: string, lines: string[]): SongSection {
  const clean = lines.map((l) => l.replace(/\t/g, ' ').trimEnd().slice(0, MAX_LINE));
  while (clean.length && !clean[0]?.trim()) clean.shift();
  while (clean.length && !clean[clean.length - 1]?.trim()) clean.pop();
  const tidy = clean.filter((l, i, a) => l.trim() || a[i - 1]?.trim());
  const name = label.trim().slice(0, 60) || 'Verse';
  return {
    id: newId(),
    kind: inferSectionKind(name),
    label: name,
    lines: tidy.slice(0, MAX_LINES),
  };
}

/** Two sections both called "Chorus" in one file: the second becomes "Chorus 2". */
function uniqueLabels(sections: SongSection[]): SongSection[] {
  const seen = new Map<string, number>();
  for (const s of sections) {
    const key = s.label.toLowerCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n > 1) s.label = `${s.label} ${n}`.slice(0, 60);
  }
  return sections;
}

const nonEmpty = (sections: SongSection[]): SongSection[] =>
  uniqueLabels(sections.filter((s) => s.lines.some((l) => l.trim()))).slice(0, MAX_SECTIONS);

const splitAuthors = (s: string): string[] =>
  s
    .split(/\s*[|;]\s*|\s*,\s*(?=\S)|\s+and\s+|\s*&\s*/i)
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 20);

// ---------- SongSelect plain text, and plain text in general ----------

/** SongSelect's credits at the end: "CCLI Song # 123", writers, ©, terms, licence number. */
function readCredits(lines: string[]): { body: string[]; credits: Partial<ImportedSong> } {
  const at = lines.findIndex((l) => /^\s*CCLI\s+Song\s*#/i.test(l));
  if (at < 0) return { body: lines, credits: {} };
  const credits: Partial<ImportedSong> = {};
  const tail = lines
    .slice(at)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const l of tail) {
    const ccli = /^CCLI\s+Song\s*#\s*(\d+)/i.exec(l);
    if (ccli) credits.ccliNumber = ccli[1];
    else if (/^(©|\(c\)|copyright)/i.test(l)) credits.copyright = l.slice(0, 500);
    else if (/^(for use solely|ccli licen[cs]e|note:|all rights reserved|www\.)/i.test(l)) continue;
    else if (!credits.authors) credits.authors = splitAuthors(l);
  }
  return { body: lines.slice(0, at), credits };
}

function parsePlainText(text: string, fileTitle: string): ImportedSong {
  const all = text.replace(/\r\n?/g, '\n').split('\n');
  const { body, credits } = readCredits(all);
  const format: SongFileFormat = credits.ccliNumber ? 'songselect' : 'text';

  // Lampstand's own format: [Verse 1] headers.
  if (
    body.some((l) => /^\s*\[[^\]]{1,60}\]\s*$/.test(l) && !CHORD_RE.test(l.trim().slice(1, -1)))
  ) {
    let title = fileTitle;
    const firstHeader = body.findIndex((l) => /^\s*\[[^\]]{1,60}\]\s*$/.test(l));
    const before = body.slice(0, firstHeader).filter((l) => l.trim());
    if (before.length === 1 && before[0]) title = before[0].trim();
    const rest = before.length === 1 ? body.slice(firstHeader) : body;
    const parsed = parseSongText(inlineChords(rest).join('\n')).sections;
    return { format, title, authors: [], ...credits, sections: nonEmpty(parsed), order: [] };
  }

  // A title on the first line, then a blank line.
  let start = 0;
  while (start < body.length && !body[start]?.trim()) start++;
  let title = fileTitle;
  const first = body[start]?.trim() ?? '';
  if (
    first &&
    !LABEL_LINE.test(first) &&
    !body[start + 1]?.trim() &&
    body.slice(start + 1).some((l) => l.trim())
  ) {
    title = first;
    start++;
  }
  const lines = inlineChords(body.slice(start));

  const sections: SongSection[] = [];
  const hasLabels = lines.some((l) => LABEL_LINE.test(l));
  if (hasLabels) {
    let label: string | null = null;
    let buf: string[] = [];
    const flush = (): void => {
      if (label !== null || buf.some((l) => l.trim()))
        sections.push(section(label ?? 'Verse 1', buf));
      buf = [];
    };
    for (const l of lines) {
      const m = LABEL_LINE.exec(l);
      if (m?.[1]) {
        flush();
        label = titleCase(m[1].replace(/\s+/g, ' '));
      } else buf.push(l);
    }
    flush();
  } else {
    // No section names: each paragraph is a verse.
    let buf: string[] = [];
    let n = 0;
    const flush = (): void => {
      if (buf.some((l) => l.trim())) sections.push(section(`Verse ${++n}`, buf));
      buf = [];
    };
    for (const l of lines) {
      if (!l.trim()) flush();
      else buf.push(l);
    }
    flush();
  }
  return { format, title, authors: [], ...credits, sections: nonEmpty(sections), order: [] };
}

// ---------- SongSelect .usr ----------

function parseUsr(text: string, fileTitle: string): ImportedSong {
  const fields = new Map<string, string>();
  let ccliNumber: string | undefined;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const header = /^\s*\[S\s+A?(\d+)\]/i.exec(raw);
    if (header) ccliNumber = header[1];
    const kv = /^([A-Za-z]+)=(.*)$/.exec(raw);
    if (kv?.[1]) fields.set(kv[1].toLowerCase(), kv[2] ?? '');
  }
  const names = (fields.get('fields') ?? '').split('/t');
  const words = (fields.get('words') ?? '').split('/t');
  const sections = words.map((w, i) =>
    section(titleCase((names[i] ?? '').trim()) || `Verse ${i + 1}`, inlineChords(w.split('/n'))),
  );
  const keys = fields.get('keys')?.split(/[\s,/]+/)[0];
  return {
    format: 'usr',
    title: fields.get('title')?.trim() || fileTitle,
    authors: splitAuthors(fields.get('author') ?? ''),
    ...(fields.get('copyright')?.trim()
      ? { copyright: fields.get('copyright')?.trim().slice(0, 500) }
      : {}),
    ...(ccliNumber ? { ccliNumber } : {}),
    ...(keys && /^[A-G][#b]?m?$/.test(keys) ? { key: keys } : {}),
    sections: nonEmpty(sections),
    order: [],
  };
}

// ---------- ChordPro ----------

const CHORDPRO_START: [RegExp, string][] = [
  [/^(start_of_chorus|soc)$/, 'Chorus'],
  [/^(start_of_verse|sov)$/, 'Verse'],
  [/^(start_of_bridge|sob)$/, 'Bridge'],
  [/^start_of_tab|sot$/, ''],
  [/^start_of_grid|sog$/, ''],
];

/** A ChordPro directive line, `{name: value}` or `{name}` (read without a regex: lines can be long). */
function directive(line: string): { name: string; value: string } | null {
  const t = line.trim();
  if (!t.startsWith('{') || !t.endsWith('}')) return null;
  const inner = t.slice(1, -1).trim();
  const cut = inner.search(/[:\s]/);
  const name = (cut < 0 ? inner : inner.slice(0, cut)).toLowerCase();
  if (!/^[a-z_]{1,40}$/.test(name)) return null;
  return { name, value: cut < 0 ? '' : inner.slice(cut + 1).trim() };
}

function parseChordPro(text: string, fileTitle: string): ImportedSong {
  const meta: Partial<ImportedSong> & { authors: string[] } = { authors: [] };
  const sections: SongSection[] = [];
  let label: string | null = null;
  let buf: string[] = [];
  let skipping = false;
  let verses = 0;
  const flush = (): void => {
    if (buf.some((l) => l.trim())) sections.push(section(label ?? `Verse ${++verses}`, buf));
    buf = [];
    label = null;
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (/^\s*#/.test(line)) continue;
    const d = directive(line);
    if (d) {
      const { name, value } = d;
      if (name === 'title' || name === 't') meta.title = value;
      else if (['artist', 'composer', 'lyricist', 'author'].includes(name))
        meta.authors.push(...splitAuthors(value));
      else if (name === 'copyright' || name === '(c)') meta.copyright = value.slice(0, 500);
      else if (name === 'ccli' || name === 'ccli_song_number')
        meta.ccliNumber = value.replace(/\D/g, '').slice(0, 20);
      else if (name === 'key' && /^[A-G][#b]?m?$/.test(value)) meta.key = value;
      else if (name === 'tempo' && Number(value) >= 20 && Number(value) <= 300)
        meta.tempo = Math.round(Number(value));
      else if (/^end_of_|^eo[cvbtg]$/.test(name)) {
        if (!skipping) flush();
        skipping = false;
      } else {
        const start = CHORDPRO_START.find(([re]) => re.test(name));
        if (start) {
          flush();
          if (!start[1]) skipping = true;
          else label = value || (start[1] === 'Verse' ? `Verse ${++verses}` : start[1]);
        } else if (/^(c|comment|ci|comment_italic|cb|comment_box)$/.test(name)) {
          // SongSelect writes its section names as comments: {comment: Verse 1}.
          const m = LABEL_LINE.exec(value);
          if (m?.[1]) {
            flush();
            label = titleCase(m[1].replace(/\s+/g, ' '));
          }
        }
      }
      continue;
    }
    if (skipping) continue;
    const m = LABEL_LINE.exec(line);
    if (m?.[1] && !buf.some((l) => l.trim())) {
      label = titleCase(m[1].replace(/\s+/g, ' '));
      continue;
    }
    if (m?.[1]) {
      flush();
      label = titleCase(m[1].replace(/\s+/g, ' '));
      continue;
    }
    // A blank line ends an unnamed paragraph; inside a named section it breaks the slide.
    if (!line.trim() && label === null) {
      flush();
      continue;
    }
    buf.push(line);
  }
  flush();
  // CCLI credits written as plain lines at the end of a SongSelect chord sheet.
  for (const s of sections) {
    const { body, credits } = readCredits(s.lines);
    if (credits.ccliNumber) {
      s.lines = body;
      meta.ccliNumber ??= credits.ccliNumber;
      meta.copyright ??= credits.copyright;
      if (!meta.authors.length && credits.authors) meta.authors = credits.authors;
    }
  }
  return {
    ...meta,
    format: 'chordpro',
    title: meta.title || fileTitle,
    authors: [...new Set(meta.authors)].slice(0, 20),
    sections: nonEmpty(sections.map((s) => section(s.label, s.lines))),
    order: [],
  };
}

// ---------- OpenLyrics and OpenSong (XML) ----------

const tag = (xml: string, name: string): string | undefined => {
  // `name` is always one of this file's own tag names; the pattern is linear (no nesting).
  // eslint-disable-next-line security/detect-non-literal-regexp
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  return m?.[1] === undefined ? undefined : decodeEntities(m[1].replace(/<[^>]+>/g, '')).trim();
};

function parseOpenLyrics(xml: string, fileTitle: string): ImportedSong {
  // eslint-disable-next-line security/detect-unsafe-regex -- linear: [^>]* stops at '>'
  const authors = [...xml.matchAll(/<author(?:\s[^>]*)?>([\s\S]*?)<\/author>/gi)].map((m) =>
    decodeEntities((m[1] ?? '').replace(/<[^>]+>/g, '')).trim(),
  );
  const sections: SongSection[] = [];
  const byName = new Map<string, string>();
  // A verse may come in several languages (`lang="en"`): the first verse's language is the
  // words; the others are translations, matched to the words by the verse's name.
  let mainLang: string | undefined;
  const others: { name: string; lang: string; lines: string[] }[] = [];
  for (const v of xml.matchAll(/<verse\s+([^>]*)>([\s\S]*?)<\/verse>/gi)) {
    const attrs = v[1] ?? '';
    const name = /name\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? `v${sections.length + 1}`;
    const lang = /\blang\s*=\s*"([^"]{1,35})"/i.exec(attrs)?.[1]?.trim();
    if (/\btranslit\s*=/i.test(attrs)) continue; // the same words in another script
    const lines: string[] = [];
    // eslint-disable-next-line security/detect-unsafe-regex -- linear: [^>]* stops at '>'
    for (const l of (v[2] ?? '').matchAll(/<lines(?:\s[^>]*)?>([\s\S]*?)<\/lines>/gi)) {
      if (lines.length) lines.push(''); // each <lines> is its own slide
      const body = (l[1] ?? '')
        // Chords: <chord name="G"/> (0.9) or <chord root="G" structure="m"/>; kept inline.
        .replace(/<chord\s+[^>]*?(?:name|root)\s*=\s*"([^"]+)"[^>]*\/?>(?:<\/chord>)?/gi, '[$1]')
        .replace(/<\/chord>/gi, '')
        .replace(/<comment>[\s\S]*?<\/comment>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '');
      lines.push(
        ...decodeEntities(body)
          .split('\n')
          .map((x) => x.trim()),
      );
    }
    if (sections.length === 0 && others.length === 0) mainLang = lang;
    if (lang && lang !== mainLang) {
      others.push({ name: name.toLowerCase(), lang, lines });
      continue;
    }
    const s = section(expandSectionName(name), lines);
    if (!byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), s.id);
    sections.push(s);
  }
  const kept = nonEmpty(sections);
  const translations: Record<string, SongSection[]> = {};
  for (const o of others) {
    const main = kept.find((k) => k.id === byName.get(o.name));
    if (!main) continue;
    const lines = section(main.label, o.lines).lines;
    if (!lines.some((l) => l.trim())) continue;
    (translations[o.lang] ??= []).push({ ...main, lines });
  }
  const orderText = tag(xml, 'verseOrder') ?? '';
  const order = orderText
    .split(/\s+/)
    .map((n) => byName.get(n.toLowerCase()))
    .filter((id): id is string => !!id && kept.some((s) => s.id === id));
  const tempo = Number(tag(xml, 'tempo'));
  const key = tag(xml, 'key');
  const ccli = tag(xml, 'ccliNo');
  const copyright = tag(xml, 'copyright');
  return {
    format: 'openlyrics',
    ...(mainLang ? { language: mainLang } : {}),
    ...(Object.keys(translations).length ? { translations } : {}),
    title: tag(xml, 'title') || fileTitle,
    authors: authors.filter(Boolean).slice(0, 20),
    ...(copyright ? { copyright: copyright.slice(0, 500) } : {}),
    ...(ccli ? { ccliNumber: ccli.replace(/\D/g, '').slice(0, 20) } : {}),
    ...(key && /^[A-G][#b]?m?$/.test(key) ? { key } : {}),
    ...(tempo >= 20 && tempo <= 300 ? { tempo: Math.round(tempo) } : {}),
    sections: kept,
    order,
  };
}

function parseOpenSong(xml: string, fileTitle: string): ImportedSong {
  const lyrics = tag(xml, 'lyrics') ?? '';
  const sections: SongSection[] = [];
  const byName = new Map<string, string>();
  let name: string | null = null;
  let buf: string[] = [];
  // OpenSong puts several verses in one block with numbered lines ("1 Amazing…", "2 'Twas…").
  const flush = (): void => {
    const numbered = buf.some((l) => /^\d/.test(l));
    if (numbered) {
      const groups = new Map<string, string[]>();
      let chords: string | null = null;
      for (const l of buf) {
        if (l.startsWith('.')) chords = l.slice(1);
        const m = /^(\d)(.*)$/.exec(l);
        if (!m?.[1]) continue;
        const words = m[2] ?? '';
        const list = groups.get(m[1]) ?? [];
        list.push(chords !== null ? mergeChordLine(chords, words) : words);
        groups.set(m[1], list);
      }
      const base = (name ?? 'V').replace(/\d+$/, '');
      for (const [n, lines] of groups) {
        const s = section(expandSectionName(`${base}${n}`), lines);
        byName.set(`${base}${n}`.toLowerCase(), s.id);
        sections.push(s);
      }
    } else if (buf.some((l) => l.trim())) {
      const lines = inlineChords(
        buf.map((l) => (l.startsWith('.') ? `\u0001${l.slice(1)}` : l.replace(/^ /, ''))),
        (l) => l.startsWith('\u0001'),
      ).map((l) => l.replaceAll('\u0001', '').replace(/\|\|?/g, ''));
      const s = section(expandSectionName(name ?? 'V1'), lines);
      byName.set((name ?? 'V1').toLowerCase(), s.id);
      sections.push(s);
    }
    buf = [];
  };
  for (const raw of lyrics.split(/\r?\n/)) {
    const h = /^\s*\[([^\]]{1,20})\]\s*$/.exec(raw);
    if (h?.[1]) {
      flush();
      name = h[1].trim();
      continue;
    }
    if (raw.startsWith(';')) continue;
    if (/^\s*\|\|?\s*$/.test(raw)) {
      buf.push('');
      continue;
    }
    buf.push(raw);
  }
  flush();
  const kept = nonEmpty(sections);
  const order = (tag(xml, 'presentation') ?? '')
    .split(/\s+/)
    .map((n) => byName.get(n.toLowerCase()))
    .filter((id): id is string => !!id && kept.some((s) => s.id === id));
  const key = tag(xml, 'key');
  const ccli = tag(xml, 'ccli');
  const copyright = tag(xml, 'copyright');
  return {
    format: 'opensong',
    title: tag(xml, 'title') || fileTitle,
    authors: splitAuthors(tag(xml, 'author') ?? ''),
    ...(copyright ? { copyright: copyright.slice(0, 500) } : {}),
    ...(ccli ? { ccliNumber: ccli.replace(/\D/g, '').slice(0, 20) } : {}),
    ...(key && /^[A-G][#b]?m?$/.test(key) ? { key } : {}),
    sections: kept,
    order,
  };
}

// ---------- Entry points ----------

/**
 * Read a song file. `fileName` gives the fallback title and, with the contents, the format.
 * Null: nothing that looks like a song (no words).
 */
export function parseSongFile(fileName: string, text: string): ImportedSong | null {
  const body = text.replace(/^\uFEFF/, '');
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? '';
  const fileTitle =
    fileName
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_]+/g, ' ')
      .trim()
      .slice(0, 200) || 'Imported song';
  const head = body.trimStart();
  let song: ImportedSong;
  if (ext === 'usr' || /^\[File\]/i.test(head)) song = parseUsr(body, fileTitle);
  else if (head.startsWith('<')) {
    if (/<song\b[^>]*openlyrics|<verse\s+[^>]*name=/i.test(head))
      song = parseOpenLyrics(body, fileTitle);
    else if (/<song\b/i.test(head) && /<lyrics\b/i.test(head))
      song = parseOpenSong(body, fileTitle);
    else return null;
  } else if (
    ['cho', 'chordpro', 'chopro', 'crd'].includes(ext) ||
    /^\s*\{\s*(title|t|start_of_\w+|soc|sov|c|comment)\s*[:}]/im.test(body)
  )
    song = parseChordPro(body, fileTitle);
  else song = parsePlainText(body, fileTitle);
  song.title = song.title.replace(/\s+/g, ' ').trim().slice(0, 200) || fileTitle;
  return song.sections.length ? song : null;
}

/** A Lampstand song made from an imported one (saved as 'imported'). */
export function songFromImport(imp: ImportedSong, now: string): Song {
  const arrangementId = newId();
  return {
    id: newId(),
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    title: imp.title,
    alternateTitles: [],
    authors: imp.authors.map((a) => a.slice(0, 200)),
    ...(imp.copyright ? { copyright: imp.copyright } : {}),
    ...(imp.ccliNumber ? { ccliNumber: imp.ccliNumber } : {}),
    ...(imp.key ? { key: imp.key } : {}),
    ...(imp.tempo ? { tempo: imp.tempo } : {}),
    sections: imp.sections,
    arrangements: [{ id: arrangementId, name: 'Default', sectionOrder: imp.order.slice(0, 200) }],
    defaultArrangementId: arrangementId,
    tags: [],
    ...(imp.language ? { language: imp.language.slice(0, 35) } : {}),
    // Translations that came with the words are shown under them (a playlist item can still
    // choose another, or none).
    ...(imp.translations && Object.keys(imp.translations).length
      ? {
          translations: imp.translations,
          defaultTranslation: Object.keys(imp.translations)[0],
        }
      : {}),
    origin: 'imported',
  };
}

/**
 * Text from a file whose encoding isn't stated: UTF-16 with its byte-order mark (older
 * SongSelect and Windows exports), UTF-8, or, when that isn't valid UTF-8, Windows-1252.
 */
export function decodeTextFile(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    let out = '';
    for (const b of bytes)
      out += b >= 0x80 && b <= 0x9f ? (CP1252[b - 0x80] ?? '') : String.fromCharCode(b);
    return out;
  }
}

/** Windows-1252's 0x80–0x9F (curly quotes, dashes, …): the rest matches Latin-1. */
const CP1252 = [
  '\u20AC',
  '',
  '\u201A',
  '\u0192',
  '\u201E',
  '\u2026',
  '\u2020',
  '\u2021',
  '\u02C6',
  '\u2030',
  '\u0160',
  '\u2039',
  '\u0152',
  '',
  '\u017D',
  '',
  '',
  '\u2018',
  '\u2019',
  '\u201C',
  '\u201D',
  '\u2022',
  '\u2013',
  '\u2014',
  '\u02DC',
  '\u2122',
  '\u0161',
  '\u203A',
  '\u0153',
  '',
  '\u017E',
  '\u0178',
];

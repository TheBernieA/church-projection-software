import { newId, type SectionKind, type SongSection } from '@lampstand/core';

const HEADER = /^\s*\[([^\]]{1,60})\]\s*$/;

const KIND_PATTERNS: [RegExp, SectionKind][] = [
  [/^pre[\s-]?chorus/i, 'pre-chorus'],
  [/^(chorus|refrain|ch\b)/i, 'chorus'],
  [/^(verse|v\b|v\d|stanza)/i, 'verse'],
  [/^bridge/i, 'bridge'],
  [/^tag/i, 'tag'],
  [/^intro/i, 'intro'],
  [/^outro/i, 'outro'],
  [/^ending/i, 'ending'],
];

/** Guess a section kind from its label ("Verse 2" → verse, "Refrain" → chorus). */
export function inferSectionKind(label: string): SectionKind {
  for (const [re, kind] of KIND_PATTERNS) if (re.test(label.trim())) return kind;
  return 'other';
}

export interface ParsedSongText {
  sections: SongSection[];
}

/**
 * Parse the plain-text song editor format (§9.1):
 *
 *     [Verse 1]
 *     Amazing grace how sweet the sound
 *
 * A blank line inside a section is kept as an empty string — it forces a slide break.
 * Text before the first header goes into an implicit "Verse 1".
 * Existing section ids are reused by label so arrangements survive edits.
 */
export function parseSongText(text: string, existing: SongSection[] = []): ParsedSongText {
  const byLabel = new Map(existing.map((s) => [s.label.toLowerCase(), s.id]));
  const sections: SongSection[] = [];
  let current: SongSection | null = null;
  const used = new Set<string>();

  const start = (label: string): SongSection => {
    let id = byLabel.get(label.toLowerCase());
    if (!id || used.has(id)) id = newId();
    used.add(id);
    const s: SongSection = { id, kind: inferSectionKind(label), label, lines: [] };
    sections.push(s);
    return s;
  };

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const header = HEADER.exec(raw);
    if (header?.[1]) {
      current = start(header[1].trim());
      continue;
    }
    const line = raw.trimEnd();
    if (!current) {
      if (!line.trim()) continue;
      current = start('Verse 1');
    }
    current.lines.push(line);
  }
  for (const s of sections) {
    // Trim leading/trailing blank lines and collapse repeated blanks.
    while (s.lines.length && !s.lines[0]?.trim()) s.lines.shift();
    while (s.lines.length && !s.lines[s.lines.length - 1]?.trim()) s.lines.pop();
    s.lines = s.lines.filter((l, i, arr) => l.trim() || arr[i - 1]?.trim());
  }
  return { sections: sections.filter((s) => s.lines.length > 0) };
}

/** Inverse of {@link parseSongText}. */
export function songSectionsToText(sections: SongSection[]): string {
  return sections.map((s) => `[${s.label}]\n${s.lines.join('\n')}`).join('\n\n');
}

/** Parse "V1 C V2 C B C" or "Verse 1, Chorus" into section ids. Unknown tokens are skipped. */
export function parseArrangementOrder(order: string, sections: SongSection[]): string[] {
  const tokens = order
    .split(/[,\s]+(?=[A-Za-z])|,/)
    .map((t) => t.trim())
    .filter(Boolean);
  const ids: string[] = [];
  for (const t of tokens) {
    const lower = t.toLowerCase();
    const exact = sections.find((s) => s.label.toLowerCase() === lower);
    if (exact) {
      ids.push(exact.id);
      continue;
    }
    const m = /^([a-z-]+?)\s*(\d*)$/i.exec(t);
    if (!m) continue;
    const abbrev = (m[1] ?? '').toLowerCase();
    const num = m[2] ?? '';
    const match = sections.find((s) => {
      const label = s.label.toLowerCase();
      const initials = label
        .split(/[\s-]+/)
        .filter((w) => !/^\d+$/.test(w))
        .map((w) => w[0])
        .join('');
      const labelNum = /(\d+)\s*$/.exec(label)?.[1] ?? '';
      return (initials === abbrev || label.startsWith(abbrev)) && labelNum === num;
    });
    if (match) ids.push(match.id);
  }
  return ids;
}

/** Short arrangement label like "V1 C V2 C B". */
export function arrangementLabel(order: string[], sections: SongSection[]): string {
  return order
    .map((id) => sections.find((s) => s.id === id))
    .filter((s): s is SongSection => !!s)
    .map((s) => {
      const num = /(\d+)\s*$/.exec(s.label)?.[1] ?? '';
      const initials = s.label
        .replace(/\d+\s*$/, '')
        .trim()
        .split(/[\s-]+/)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('');
      return `${initials}${num}`;
    })
    .join(' ');
}

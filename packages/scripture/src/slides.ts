import { parseBibleMarkup, stripBibleMarkup, type TextBlock, type VerseRef } from '@lampstand/core';

export interface VersionText {
  id: string;
  abbreviation: string;
  direction: 'ltr' | 'rtl';
  language: string;
  /** Raw verse text with markup, or undefined if missing in this version. */
  verse(ref: VerseRef): string | undefined;
}

export interface ScriptureSlide {
  key: string;
  verses: VerseRef[];
  /** Part index when one long verse is split over several slides. */
  part?: { index: number; count: number };
  blocks: TextBlock[];
}

const BREAKS = [/(?<=[.!?;:])\s+/, /(?<=,)\s+/, /\s+/];

/**
 * Split long text into chunks ≤ maxChars at sentence, then clause, then word boundaries —
 * never mid-word (§7.2).
 */
export function splitText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  for (let i = 0; i < BREAKS.length; i++) {
    const re = BREAKS[i];
    if (!re) continue;
    const pieces = text.split(re).filter(Boolean);
    if (pieces.length < 2) continue;
    const packed: string[] = [];
    let cur = '';
    for (const p of pieces) {
      if (cur && cur.length + 1 + p.length > maxChars) {
        packed.push(cur);
        cur = p;
      } else cur = cur ? `${cur} ${p}` : p;
    }
    if (cur) packed.push(cur);
    const isLast = i === BREAKS.length - 1;
    // A packed part only exceeds the budget if it is a single piece: retry it with finer breaks.
    return packed.flatMap((p) => (p.length > maxChars && !isLast ? splitText(p, maxChars) : [p]));
  }
  return [text];
}

const plainLen = (s: string): number => stripBibleMarkup(s).length;

/** Group verses into slides: "one verse per slide" or "fit as many as possible" (§7.2). */
export function buildScriptureSlides(
  verses: VerseRef[],
  versions: VersionText[],
  opts: { mode: 'one' | 'fit'; maxChars: number; keyPrefix: string },
): ScriptureSlide[] {
  if (!versions.length) return [];
  const multi = versions.length > 1;
  // Each version shares the canvas, so the budget is split between them.
  const budget = Math.max(60, Math.floor(opts.maxChars / versions.length));
  const primary = versions[0];
  if (!primary) return [];
  const slides: ScriptureSlide[] = [];
  let group: VerseRef[] = [];
  let groupLen = 0;

  const blocksFor = (refs: VerseRef[], showNumbers: boolean): TextBlock[] =>
    versions.map((v) => {
      const spans = refs.flatMap((r, i) => {
        const raw = v.verse(r) ?? '';
        const parsed = parseBibleMarkup(raw);
        const lead = i > 0 ? [{ text: ' ' }] : [];
        return showNumbers
          ? [...lead, { text: String(r.verse), style: 'verse-number' as const }, ...parsed]
          : [...lead, ...parsed];
      });
      const b: TextBlock = { spans, dir: v.direction, lang: v.language };
      if (multi) b.label = v.abbreviation;
      return b;
    });

  const flush = (): void => {
    if (!group.length) return;
    const first = group[0];
    const last = group[group.length - 1];
    if (!first || !last) return;
    slides.push({
      key: `${opts.keyPrefix}:${first.book}.${first.chapter}.${first.verse}-${last.chapter}.${last.verse}`,
      verses: group,
      blocks: blocksFor(group, group.length > 1 || versions.length === 1),
    });
    group = [];
    groupLen = 0;
  };

  for (const ref of verses) {
    const len = Math.max(...versions.map((v) => plainLen(v.verse(ref) ?? '')));
    if (len > budget * 1.25) {
      // One verse too long for a slide: split it into parts (primary version only drives breaks).
      flush();
      const parts = versions.map((v) => splitText(stripBibleMarkup(v.verse(ref) ?? ''), budget));
      const count = Math.max(...parts.map((p) => p.length));
      for (let i = 0; i < count; i++) {
        slides.push({
          key: `${opts.keyPrefix}:${ref.book}.${ref.chapter}.${ref.verse}:p${i}`,
          verses: [ref],
          part: { index: i, count },
          blocks: versions.map((v, vi) => {
            const spans = [
              ...(i === 0 ? [{ text: String(ref.verse), style: 'verse-number' as const }] : []),
              { text: parts[vi]?.[i] ?? '' },
            ];
            const b: TextBlock = { spans, dir: v.direction, lang: v.language };
            if (multi) b.label = v.abbreviation;
            return b;
          }),
        });
      }
      continue;
    }
    if (opts.mode === 'one' || (group.length && groupLen + len > budget)) flush();
    group.push(ref);
    groupLen += len;
  }
  flush();
  return slides;
}

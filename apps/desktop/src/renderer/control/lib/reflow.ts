import { newId, type TextSlide } from '@lampstand/core';
import { splitSection } from '@lampstand/lyrics';

/**
 * Reflow text for text presentations: one block per slide, blocks separated by a blank line,
 * an optional "[Title]" first line. Songs use the lyrics text format instead
 * (@lampstand/lyrics), which follows the same rules.
 */
export function slidesToReflow(slides: TextSlide[]): string {
  return slides
    .map((s) => {
      const body = s.body.replace(/\n{2,}/g, '\n'); // a blank line would split the slide
      return s.title?.trim() ? `[${s.title.trim()}]${body ? `\n${body}` : ''}` : body;
    })
    .filter((b) => b.trim())
    .join('\n\n');
}

/**
 * Parse reflow text back into slides. Slides keep their id and notes by position, so editing
 * text never loses speaker notes or breaks the live cursor.
 */
export function reflowToSlides(text: string, existing: TextSlide[] = []): TextSlide[] {
  const blocks = text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map((b) => b.replace(/^\n+|\s+$/g, ''))
    .filter((b) => b.trim());
  return blocks.map((block, i) => {
    const lines = block.split('\n');
    const header = /^\s*\[(.*)\]\s*$/.exec(lines[0] ?? '');
    const title = header?.[1]?.trim() ?? '';
    const body = (header ? lines.slice(1) : lines).join('\n').trim();
    const prev = existing[i];
    const slide: TextSlide = { id: prev?.id ?? newId(), body };
    if (title) slide.title = title;
    if (prev?.notes) slide.notes = prev.notes;
    return slide;
  });
}

/** Where each block (slide, or song section) starts in reflow text, as character offsets. */
export function blockStarts(text: string): number[] {
  const starts: number[] = [];
  let inBlock = false;
  let lineStart = 0;
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i];
    if (ch === '\n' || ch === undefined) {
      const line = text.slice(lineStart, i);
      if (line.trim()) {
        if (!inBlock) starts.push(lineStart);
        inBlock = true;
      } else inBlock = false;
      lineStart = i + 1;
    }
  }
  return starts;
}

/** Which block the caret is in (the one before it, on a blank line between two). */
export function blockAt(text: string, caret: number): number {
  const starts = blockStarts(text);
  let at = 0;
  starts.forEach((s, i) => {
    if (s <= caret) at = i;
  });
  return at;
}

/** Tidy reflow text: no trailing spaces, at most one blank line between blocks, no edges. */
export function tidyReflow(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Split blocks with more than `maxLines` lines of words into several, each keeping the block's
 * [Title] line, so no slide overflows.
 */
export function splitLongBlocks(text: string, maxLines: number): string {
  return tidyReflow(text)
    .split(/\n[ \t]*\n+/)
    .flatMap((block) => {
      const lines = block.split('\n');
      const header = /^\s*\[.*\]\s*$/.test(lines[0] ?? '') ? lines[0] : null;
      const body = header ? lines.slice(1) : lines;
      if (body.length <= maxLines) return [block];
      // Balanced like the song's own slides (5 lines at 4 a slide: 3 + 2).
      return splitSection(body, maxLines).map((chunk) =>
        header ? `${header}\n${chunk.join('\n')}` : chunk.join('\n'),
      );
    })
    .join('\n\n');
}

/**
 * Insert a new block at the caret: a blank line to end the current one, then `header` (e.g.
 * "[Chorus]") on its own line. Returns the new text and where the caret goes (after it).
 */
export function insertBlock(
  text: string,
  caret: number,
  header: string,
): { text: string; caret: number } {
  const before = text.slice(0, caret).replace(/\s+$/, '');
  const after = text.slice(caret).replace(/^\s+/, '');
  const head = header ? `${header}\n` : '';
  const lead = before ? `${before}\n\n` : '';
  const next = `${lead}${head}${after ? after : ''}`;
  return { text: next, caret: lead.length + head.length };
}

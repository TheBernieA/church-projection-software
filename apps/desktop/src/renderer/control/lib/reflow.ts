import { newId, type TextSlide } from '@lampstand/core';

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

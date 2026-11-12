import type { Span } from './schemas/scene';

const TAG = /<(\/?)(wj|add|nd)>/g;

/**
 * Parse the tiny Bible markup (`<wj>`, `<add>`, `<nd>`) into spans. Anything else is kept as
 * literal text — this never produces HTML (§17.1).
 */
export function parseBibleMarkup(input: string): Span[] {
  const spans: Span[] = [];
  const stack: Span['style'][] = [];
  let last = 0;
  const push = (text: string): void => {
    if (!text) return;
    const style = stack[stack.length - 1];
    const prev = spans[spans.length - 1];
    if (prev && prev.style === style) prev.text += text;
    else spans.push(style ? { text, style } : { text });
  };
  for (const m of input.matchAll(TAG)) {
    push(input.slice(last, m.index));
    last = m.index + m[0].length;
    const closing = m[1] === '/';
    const tag = m[2] as 'wj' | 'add' | 'nd';
    if (closing) {
      const idx = stack.lastIndexOf(tag);
      if (idx >= 0) stack.splice(idx, 1);
    } else stack.push(tag);
  }
  push(input.slice(last));
  return spans;
}

/** Strip markup to plain text (search indexes, detection). */
export function stripBibleMarkup(input: string): string {
  return input.replace(TAG, '');
}

/**
 * Reading Bible API replies into a chapter's verses (`verses[v - 1]` is verse v). Pure: no
 * network, so every provider's format is unit-tested from sample replies.
 */

/** Spaces and line breaks (poetry, paragraphs) collapsed: a verse is one line on a slide. */
const tidy = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * A chapter as one text with bracketed verse numbers: "[1] In the beginning… [2] The earth…"
 * (ESV's and API.Bible's plain text). Text before the first number (a heading) is dropped.
 */
export function versesFromBracketed(text: string): string[] {
  const out: string[] = [];
  const parts = text.split(/\[(\d{1,3})\]/);
  // parts: [before, n1, text1, n2, text2, …]
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const n = Number(parts[i]);
    const t = tidy(parts[i + 1] ?? '');
    if (n >= 1 && n <= 200) out[n - 1] = out[n - 1] ? `${out[n - 1]} ${t}` : t;
  }
  return fill(out);
}

/** A list of verse objects ({ verse: 16, text: "For God so loved…" }). */
export function versesFromList(list: unknown, textField = 'text', numberField = 'verse'): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  list.forEach((item: unknown, i) => {
    if (typeof item === 'string') {
      out[i] = tidy(item);
      return;
    }
    if (!item || typeof item !== 'object') return;
    const rec = item as Record<string, unknown>;
    const text = rec[textField];
    if (typeof text !== 'string') return;
    const n = Number(rec[numberField]);
    const at = Number.isInteger(n) && n >= 1 && n <= 200 ? n - 1 : i;
    out[at] = out[at] ? `${out[at]} ${tidy(text)}` : tidy(text);
  });
  return fill(out);
}

/** Holes (a verse the source leaves out, like Acts 8:37 in some versions) become ''. */
function fill(out: string[]): string[] {
  return Array.from({ length: out.length }, (_, i) => out[i] ?? '');
}

/** A value by dot path ("data.content", "passages.0"); '' is the whole value. */
export function atPath(value: unknown, path: string): unknown {
  if (!path.trim()) return value;
  let cur: unknown = value;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** A custom API's chapter address, its placeholders filled in (each part URL-encoded). */
export function fillTemplate(
  template: string,
  v: { book: string; bookNumber: number; bookName: string; chapter: number; key: string },
): string {
  return template
    .replaceAll('{book}', encodeURIComponent(v.book))
    .replaceAll('{bookNumber}', String(v.bookNumber))
    .replaceAll('{bookName}', encodeURIComponent(v.bookName))
    .replaceAll('{chapter}', String(v.chapter))
    .replaceAll('{key}', encodeURIComponent(v.key));
}

/**
 * Is this address one a custom API may use? https anywhere; plain http only to this computer
 * (a local server), so a key never crosses the network unencrypted.
 */
export function isAllowedApiUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.username || u.password) return false;
    if (u.protocol === 'https:') return true;
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

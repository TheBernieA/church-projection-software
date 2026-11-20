import { safeUnzip } from '../modules/zip';
import { type ImportedDeck } from '../types';
import { MAX_IMPORT_SLIDES, PPTX_LIMITS } from '../constants';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Decode the XML entities that appear in text runs. */
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, e: string) => {
    if (!e.startsWith('#')) return ENTITIES[e] ?? whole;
    const code = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    // An out-of-range reference stays as written rather than failing the whole file.
    return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

/** One attribute of an XML start tag (fixed pattern; attribute names are ours, not input). */
function attr(tag: string, name: string): string | undefined {
  for (const m of tag.matchAll(/\s([\w:]+)="([^"]*)"/g)) if (m[1] === name) return m[2];
  return undefined;
}

/** Text of one shape: a line per paragraph (`<a:p>`), `<a:br/>` as a line break. */
function shapeText(shape: string): string {
  const paragraphs: string[] = [];
  for (const p of shape.matchAll(/<a:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/a:p>)/g)) {
    const inner = (p[1] ?? '').replace(/<a:br\b[^>]*\/>/g, '<a:t>\n</a:t>');
    const runs = [...inner.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decode(m[1] ?? ''));
    paragraphs.push(runs.join(''));
  }
  return paragraphs
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface Shape {
  placeholder?: string;
  text: string;
}

function shapes(xml: string): Shape[] {
  return [...xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)].map((m) => ({
    placeholder:
      attr(/<p:ph\b[^>]*>/.exec(m[0])?.[0] ?? '', 'type') ??
      (/<p:ph\b/.test(m[0]) ? 'body' : undefined),
    text: shapeText(m[0]),
  }));
}

/** Relationship id → target path, resolved against the part's folder. */
function relationships(
  rels: string | undefined,
  base: string,
): Map<string, { type: string; target: string }> {
  const out = new Map<string, { type: string; target: string }>();
  for (const m of (rels ?? '').matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (!id || !target) continue;
    const parts = `${base}/${target}`.split('/');
    const resolved: string[] = [];
    for (const p of parts) {
      if (p === '..') resolved.pop();
      else if (p && p !== '.') resolved.push(p);
    }
    out.set(id, { type: attr(m[0], 'Type') ?? '', target: resolved.join('/') });
  }
  return out;
}

const NOT_CONTENT = new Set(['sldNum', 'dt', 'ftr', 'hdr', 'sldImg']);

/**
 * Read the text of a .pptx: slide order from the presentation, title from the title
 * placeholder, everything else as body text, plus speaker notes. Pictures are counted, not
 * imported. Bounded XML scanning (no external parser) over an unzip with zip-bomb guards.
 */
export function parsePptx(data: Uint8Array): ImportedDeck {
  const files = safeUnzip(data, PPTX_LIMITS);
  const text = (name: string): string | undefined => {
    const f = files.get(name);
    return f ? new TextDecoder().decode(f) : undefined;
  };
  const presentation = text('ppt/presentation.xml');
  if (!presentation) throw new Error('This file is not a PowerPoint presentation.');
  const rels = relationships(text('ppt/_rels/presentation.xml.rels'), 'ppt');
  const order = [...presentation.matchAll(/<p:sldId\b[^>]*>/g)]
    .map((m) => rels.get(attr(m[0], 'r:id') ?? '')?.target)
    .filter((t): t is string => !!t)
    .slice(0, MAX_IMPORT_SLIDES);

  let slidesWithPictures = 0;
  const slides = order.map((path) => {
    const xml = text(path) ?? '';
    if (/<p:pic\b/.test(xml)) slidesWithPictures += 1;
    const all = shapes(xml).filter((s) => s.text && !NOT_CONTENT.has(s.placeholder ?? ''));
    const isTitle = (s: Shape): boolean =>
      s.placeholder === 'title' || s.placeholder === 'ctrTitle';
    const folder = path.slice(0, path.lastIndexOf('/'));
    const file = path.slice(path.lastIndexOf('/') + 1);
    const slideRels = relationships(text(`${folder}/_rels/${file}.rels`), folder);
    const notesPath = [...slideRels.values()].find((r) => r.type.endsWith('/notesSlide'))?.target;
    const notes = notesPath
      ? shapes(text(notesPath) ?? '')
          .filter((s) => s.placeholder === 'body')
          .map((s) => s.text)
          .join('\n')
      : '';
    return {
      title: all
        .filter(isTitle)
        .map((s) => s.text)
        .join(' ')
        .slice(0, 200),
      body: all
        .filter((s) => !isTitle(s))
        .map((s) => s.text)
        .join('\n\n')
        .slice(0, 4000),
      notes: notes.slice(0, 4000),
    };
  });
  return { slides, slidesWithPictures };
}

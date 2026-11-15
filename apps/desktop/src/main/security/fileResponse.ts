import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import { type ByteRange } from '../types';
import { MIME_TYPES } from '../constants';

/**
 * Parse an HTTP `Range` header against a file size. Returns null for "whole file", 'invalid'
 * for an unsatisfiable range. Only the first range of a multi-range request is honoured.
 */
export function parseRange(header: string | null, size: number): ByteRange {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid';
  let start: number;
  let end: number;
  if (m[1] === '') {
    // Suffix range: the last N bytes.
    const n = Number(m[2]);
    if (n === 0) return 'invalid';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}

/**
 * Serve a local file with proper byte-range support. `<video>` needs `206 Partial Content`
 * (with Content-Range / Accept-Ranges) to seek; without it, a long clip can only play from the
 * start. (`net.fetch` on file:// answers ranges with a bare 200, which breaks seeking.)
 */
export async function fileResponse(file: string, rangeHeader: string | null): Promise<Response> {
  let size: number;
  try {
    const st = await stat(file);
    if (!st.isFile()) return new Response('Not found', { status: 404 });
    size = st.size;
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const headers = new Headers({
    'Content-Type': MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
  });
  const range = parseRange(rangeHeader, size);
  if (range === 'invalid') {
    headers.set('Content-Range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  headers.set('Content-Length', String(size === 0 ? 0 : end - start + 1));
  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  const body =
    size === 0
      ? null
      : (Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array>);
  return new Response(body, { status: range ? 206 : 200, headers });
}

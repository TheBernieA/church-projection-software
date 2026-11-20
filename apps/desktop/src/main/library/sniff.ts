import { type Sniffed } from '../types';

const ascii = (b: Uint8Array, start: number, len: number): string =>
  String.fromCharCode(...b.subarray(start, start + len));

/** Identify a file by magic bytes, never by extension alone (§17.3). */
export function sniffMedia(head: Uint8Array): Sniffed | null {
  if (head.length < 12) return null;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
    return { kind: 'image', mime: 'image/jpeg', ext: 'jpg' };
  if (head[0] === 0x89 && ascii(head, 1, 3) === 'PNG')
    return { kind: 'image', mime: 'image/png', ext: 'png' };
  if (ascii(head, 0, 4) === 'GIF8') return { kind: 'image', mime: 'image/gif', ext: 'gif' };
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WEBP')
    return { kind: 'image', mime: 'image/webp', ext: 'webp' };
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WAVE')
    return { kind: 'audio', mime: 'audio/wav', ext: 'wav' };
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3)
    return { kind: 'video', mime: 'video/webm', ext: 'webm' };
  if (ascii(head, 4, 4) === 'ftyp') {
    const brand = ascii(head, 8, 4);
    if (brand === 'qt  ') return { kind: 'video', mime: 'video/quicktime', ext: 'mov' };
    if (brand.startsWith('M4A')) return { kind: 'audio', mime: 'audio/mp4', ext: 'm4a' };
    if (/^(heic|heix|mif1|msf1)/.test(brand)) return null; // HEIC → convert first (not yet supported)
    return { kind: 'video', mime: 'video/mp4', ext: 'mp4' };
  }
  if (ascii(head, 0, 3) === 'ID3' || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0))
    return { kind: 'audio', mime: 'audio/mpeg', ext: 'mp3' };
  return null;
}

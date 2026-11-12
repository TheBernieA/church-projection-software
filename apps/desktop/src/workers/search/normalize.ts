import { stripBibleMarkup } from '@lampstand/core';

/** Normalize text for search and quote matching: lowercase, no punctuation/markup. */
export function normalizeText(s: string): string {
  return stripBibleMarkup(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

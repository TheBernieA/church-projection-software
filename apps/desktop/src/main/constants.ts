import { join } from 'node:path';
import type { ZipLimits } from './types';

/** Limits, names and lookup tables shared across the main process. */

// Logging
export const LOG_MAX_BYTES = 5 * 1024 * 1024;
export const LOG_MAX_FILES = 5;

// Library backups
export const BACKUP_DATA_DIRS = [
  'songs',
  'services',
  'themes',
  'media-playlists',
  join('media', '.meta'),
];
export const KEEP_BACKUPS = 14;

// Media import
export const MAX_IMAGE_BYTES = 200 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 16 * 1024 * 1024 * 1024;

// Slide import
/** Slide decks bigger than this are refused before reading (PDFs are rendered in memory). */
export const MAX_DECK_BYTES = 200 * 1024 * 1024;
export const MAX_IMPORT_SLIDES = 500;

/** Only the XML parts are unpacked; pictures and media inside the deck are skipped. */
export const PPTX_LIMITS: ZipLimits = {
  maxFiles: 3000,
  maxTotalBytes: 128 * 1024 * 1024,
  maxFileBytes: 16 * 1024 * 1024,
  maxRatio: 200,
  include: (name) =>
    name === 'ppt/presentation.xml' ||
    name === 'ppt/_rels/presentation.xml.rels' ||
    /^ppt\/(slides|notesSlides)\/(_rels\/)?[\w.-]+\.xml(\.rels)?$/.test(name),
};

// Bible/hymnal packages
export const MODULE_LIMITS: ZipLimits = {
  maxFiles: 300,
  maxTotalBytes: 64 * 1024 * 1024,
  maxFileBytes: 8 * 1024 * 1024,
  maxRatio: 200,
  // Linear: segments are separated by a literal '/'; names are capped at 260 chars first.
  // eslint-disable-next-line security/detect-unsafe-regex
  allowedPath: /^[A-Za-z0-9_\-.]+(\/[A-Za-z0-9_\-.]+)*$/,
};

// Protocols
export const APP_SCHEME = 'app';
export const MEDIA_SCHEME = 'lampstand-media';

/** Content types by file extension: the built app (app://) and library media. */
export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.ogv': 'video/ogg',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
};

// Web pages on slides
/** In-memory session (no `persist:`): pages never share cookies or storage with the app. */
export const WEB_PARTITION = 'lampstand-web';

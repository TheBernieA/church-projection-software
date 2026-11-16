import { z } from 'zod';
import { EntityMetaSchema, IdSchema } from './common';

export const MediaKindSchema = z.enum(['image', 'video', 'audio']);
export type MediaKind = z.infer<typeof MediaKindSchema>;

/** Library media record. `fileName` is relative to the library media folder — never absolute. */
export const MediaItemSchema = EntityMetaSchema.extend({
  name: z.string().min(1).max(260),
  kind: MediaKindSchema,
  fileName: z
    .string()
    .regex(/^[A-Za-z0-9._-]+$/)
    .max(200),
  mimeType: z.string().max(100),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  durationSec: z.number().optional(),
  hasThumbnail: z.boolean().default(false),
  isBackground: z.boolean().default(false),
  tags: z.array(z.string().max(60)).max(50).default([]),
});
export type MediaItem = z.infer<typeof MediaItemSchema>;
export const MEDIA_SCHEMA_VERSION = 1;

/**
 * A media playlist: the operator's own grouping of library media ("Sunday loops", "Christmas"),
 * in their chosen order. Media can be in several playlists; deleting a playlist never deletes media.
 */
export const MediaPlaylistSchema = EntityMetaSchema.extend({
  name: z.string().min(1).max(120),
  mediaIds: z.array(IdSchema).max(5000).default([]),
});
export type MediaPlaylist = z.infer<typeof MediaPlaylistSchema>;
export const MEDIA_PLAYLIST_SCHEMA_VERSION = 1;

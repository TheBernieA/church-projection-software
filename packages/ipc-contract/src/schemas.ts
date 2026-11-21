import { z } from 'zod';
import { BookIdSchema, OutputRoleSchema } from '@lampstand/core';
import type { QueryName } from './channels';

/**
 * Every IPC channel is declared here (§17.2). Preloads expose one named function per entry —
 * never `ipcRenderer` or a generic `invoke(channel)`. Main validates every payload with these
 * schemas and checks which window type sent it.
 */

export const CommandEnvelopeSchema = z.object({
  type: z.string().min(1).max(80),
  payload: z.unknown(),
  source: z.enum(['ui', 'shortcut']).default('ui'),
});
export type CommandEnvelope = z.input<typeof CommandEnvelopeSchema>;

/** Request schemas for control-window queries/actions. */
export const QuerySchemas = {
  'app.info': z.undefined(),
  'live.get': z.undefined(),
  'settings.get': z.undefined(),
  'songs.list': z.undefined(),
  'services.list': z.undefined(),
  'services.get': z.object({ id: z.string().max(64) }),
  'themes.list': z.undefined(),
  'media.list': z.undefined(),
  'mediaPlaylists.list': z.undefined(),
  'bible.versions': z.undefined(),
  'bible.chapter': z.object({
    versionId: z.string().max(32),
    book: BookIdSchema,
    chapter: z.number().int().min(1).max(200),
  }),
  'bible.verseCounts': z.object({ versionId: z.string().max(32) }),
  'bible.bookNames': z.object({ versionId: z.string().max(32) }),
  'search.query': z.object({
    text: z.string().max(200),
    limit: z.number().int().min(1).max(100).default(30),
    versionId: z.string().max(32).optional(),
  }),
  'displays.list': z.undefined(),
  'history.state': z.undefined(),
  'media.import': z.object({ asBackground: z.boolean().default(false) }),
  'library.export': z.undefined(),
  'library.import': z.undefined(),
  'library.backupNow': z.undefined(),
  'audit.recent': z.undefined(),
  'notices.missed': z.undefined(),
  'modules.list': z.undefined(),
  'modules.install': z.undefined(),
  'slides.import': z.undefined(),
  /** Pick song files (SongSelect, ChordPro, OpenLyrics, OpenSong, text); their text comes back. */
  'songs.importFiles': z.undefined(),
  /** Store generated image bytes (e.g. rendered PDF pages) as a library picture. */
  'media.importBytes': z.object({
    name: z.string().min(1).max(200),
    data: z.instanceof(Uint8Array).refine((d) => d.byteLength <= 30 * 1024 * 1024, 'too large'),
  }),
  /** Camera/microphone permission: read it, ask the OS for it, or open its privacy settings. */
  'devices.access': z.object({
    kind: z.enum(['camera', 'microphone']),
    action: z.enum(['status', 'ask', 'open']).default('status'),
  }),
  'stream.status': z.undefined(),
  'ndi.status': z.undefined(),
  /** Which destinations have a stream key saved (never the keys themselves). */
  'stream.keys': z.undefined(),
  'recording.chooseFolder': z.undefined(),
  /** Show the recordings folder (or one recording) in Finder / Explorer. */
  'recording.reveal': z.object({ path: z.string().max(2000).nullable() }),
} as const satisfies Record<QueryName, z.ZodType>;

export type QueryArgs<K extends QueryName> = z.input<(typeof QuerySchemas)[K]>;

export const DisplayAssignSchema = z.object({
  displayId: z.string().max(64),
  role: OutputRoleSchema,
});

/** A mix's levels, sent by the window that makes it (peak and RMS, linear). */
const Level = z.tuple([z.number().min(0).max(64), z.number().min(0).max(64)]);
export const MeterReportSchema = z.object({
  bus: z.enum(['room', 'stream']),
  channels: z.record(z.string().max(64), Level),
  level: Level,
  /** The mix, left and right (for stereo meters). */
  sides: z.tuple([Level, Level]),
});
export type MeterReport = z.infer<typeof MeterReportSchema>;

/**
 * Channel and query names, with no Zod or schema code: the sandboxed preloads import only
 * this, so they stay a few kilobytes instead of bundling every schema.
 */

/** Every control-window query (main validates each one with `QuerySchemas`). */
export const QUERY_NAMES = [
  'app.info',
  'live.get',
  'settings.get',
  'songs.list',
  'services.list',
  'services.get',
  'themes.list',
  'media.list',
  'mediaPlaylists.list',
  'bible.versions',
  'bible.chapter',
  'bible.verseCounts',
  'search.query',
  'displays.list',
  'history.state',
  'media.import',
  'library.export',
  'library.import',
  'library.backupNow',
  'audit.recent',
  'modules.list',
  'modules.install',
  'slides.import',
  'media.importBytes',
  'devices.access',
] as const;
export type QueryName = (typeof QUERY_NAMES)[number];

/** Channel names. Prefixes make the window-type permission check simple in main. */
export const Channels = {
  command: 'ctl:command',
  undo: 'ctl:undo',
  redo: 'ctl:redo',
  query: (name: QueryName) => `ctl:q:${name}` as const,
  // Output/stage window handshake (read-only windows).
  outputReady: 'out:ready',
  // main → renderer events
  evLive: 'ev:live',
  evRepo: 'ev:repo',
  evDisplays: 'ev:displays',
  evHistory: 'ev:history',
  evNotice: 'ev:notice',
  evOutputInfo: 'ev:output-info',
  /** Application menu items (Edit › Undo / Redo) for the control window. */
  evMenu: 'ev:menu',
} as const;

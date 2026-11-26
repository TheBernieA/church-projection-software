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
  'bible.bookNames',
  'search.query',
  'displays.list',
  'history.state',
  'media.import',
  'library.export',
  'library.import',
  'library.backupNow',
  'audit.recent',
  'notices.missed',
  'modules.list',
  'modules.install',
  'slides.import',
  'songs.importFiles',
  'onlineBible.status',
  'onlineBible.probe',
  'onlineBible.catalog',
  'media.importBytes',
  'devices.access',
  'stream.status',
  'stream.keys',
  'recording.chooseFolder',
  'recording.reveal',
  'ndi.status',
] as const;
export type QueryName = (typeof QUERY_NAMES)[number];

/** Channel names. Prefixes make the window-type permission check simple in main. */
export const Channels = {
  command: 'ctl:command',
  /** control → main: a Live console is watching the stream picture ({fps, ready}). */
  streamWatch: 'ctl:stream-watch',
  undo: 'ctl:undo',
  redo: 'ctl:redo',
  query: (name: QueryName) => `ctl:q:${name}` as const,
  // Output/stage window handshake (read-only windows).
  outputReady: 'out:ready',
  // Stream window (the livestream picture): its handshake and its sound.
  streamReady: 'stream:ready',
  streamAudio: 'stream:audio',
  /** stream window → main: an encoded H.264 chunk (GPU pipeline). */
  streamVideo: 'stream:video',
  /** stream window → main: what its hardware encoder can do, its stats, or an error. */
  streamEncoder: 'stream:encoder',
  /** main → stream window: start (or stop, null) hardware encoding; or ask for a keyframe. */
  evEncode: 'ev:encode',
  /** main → stream window: what to draw and mix. */
  evStreamConfig: 'ev:stream-config',
  /** output / stream window → main: its mix's levels (about 15 a second). */
  meters: 'mix:meters',
  /** main → control: mix levels, for the mixer's meters. */
  evMeters: 'ev:meters',
  /** main → control: NDI status (runtime, receivers per feed). */
  evNdi: 'ev:ndi',
  /** main → control: the Live console window opened or closed. */
  evLiveConsole: 'ev:live-console',
  /** Cameras is open in a window of its own (true) or docked in the main window (false). */
  evCamerasWindow: 'ev:cameras-window',
  /** main → control: the stream picture (JPEG bytes) while a Live console watches. */
  evStreamPreview: 'ev:stream-preview',
  /** main → control: livestream / recording status. */
  evStream: 'ev:stream',
  /** control → main: an OSC message to the desk (Settings › Control surfaces' send-to address). */
  oscSend: 'osc:send',
  /** control → main: the OSC listener's status. */
  oscStatus: 'osc:status',
  /** main → control: OSC messages that arrived. */
  evOsc: 'ev:osc',
  /** main → control: the OSC listener started, stopped or failed. */
  evOscStatus: 'ev:osc-status',
  // main → renderer events
  evLive: 'ev:live',
  evRepo: 'ev:repo',
  evDisplays: 'ev:displays',
  evNotice: 'ev:notice',
  evOutputInfo: 'ev:output-info',
  /** Application menu items (Edit › Undo / Redo) for the control window. */
  evMenu: 'ev:menu',
} as const;

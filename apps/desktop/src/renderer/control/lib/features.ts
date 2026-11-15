/**
 * Every feature Lampstand has or plans, inspired by the breadth of pro presentation software.
 * One source of truth for: "Soon" badges and disabled controls, placeholder panels for
 * unbuilt tools, and Settings → Features (the roadmap). Flip `status` to 'available' when a
 * feature ships and every surface updates.
 */
export type FeatureStatus = 'available' | 'soon';

export type FeatureCategory =
  | 'presentations'
  | 'library'
  | 'bible'
  | 'media'
  | 'audio'
  | 'layers'
  | 'screens'
  | 'stage'
  | 'timers'
  | 'messages'
  | 'automation'
  | 'capture'
  | 'integrations';

export interface Feature {
  id: string;
  name: string;
  category: FeatureCategory;
  description: string;
  status: FeatureStatus;
}

export const FEATURE_CATEGORIES: { id: FeatureCategory; name: string }[] = [
  { id: 'presentations', name: 'Presentations & editing' },
  { id: 'library', name: 'Library & playlists' },
  { id: 'bible', name: 'Bible' },
  { id: 'media', name: 'Media' },
  { id: 'audio', name: 'Audio' },
  { id: 'layers', name: 'Layers, props & looks' },
  { id: 'screens', name: 'Screens & outputs' },
  { id: 'stage', name: 'Stage display' },
  { id: 'timers', name: 'Timers & clocks' },
  { id: 'messages', name: 'Messages' },
  { id: 'automation', name: 'Automation & control' },
  { id: 'capture', name: 'Capture & streaming' },
  { id: 'integrations', name: 'Remote & integrations' },
];

const f = (
  id: string,
  category: FeatureCategory,
  name: string,
  description: string,
  status: FeatureStatus = 'available',
): Feature => ({ id, name, category, description, status });

export const FEATURES: Feature[] = [
  // Presentations & editing
  f(
    'slide-groups',
    'presentations',
    'Colour-coded slide groups',
    'Verse, chorus, bridge… each group gets its own colour in the slide grid, so you can find your place at a glance.',
  ),
  f(
    'reflow',
    'presentations',
    'Reflow editor',
    'Edit a whole song or presentation as one block of text; blank lines split slides and [Verse 1] headers start groups.',
  ),
  f(
    'quick-edit',
    'presentations',
    'Quick Edit',
    'Right-click any slide to fix a typo without leaving the show.',
  ),
  f(
    'themes',
    'presentations',
    'Themes',
    'Reusable text and background styling; change a theme and every slide using it updates.',
  ),
  f(
    'transitions',
    'presentations',
    'Slide transitions',
    'Cut, fade and other transitions between slides, set per theme.',
  ),
  f(
    'live-editing',
    'presentations',
    'Live editing',
    'Edit slides and media before or during the service without interrupting the screen.',
  ),
  f(
    'arrangements',
    'presentations',
    'Arrangements',
    'Reorder or repeat verse and chorus groups to build different song arrangements.',
    'soon',
  ),
  f(
    'objects',
    'presentations',
    'Custom objects & shapes',
    'Place shapes, text boxes, media and live video anywhere on a slide.',
    'soon',
  ),
  f(
    'effects',
    'presentations',
    'Text & background effects',
    'Blur, glow, colour filters and fills on text and backgrounds.',
    'soon',
  ),
  f(
    'chords',
    'presentations',
    'Chord charts',
    'Keep chords with lyrics and show them to the band on the stage display.',
    'soon',
  ),
  f(
    'import-slides',
    'presentations',
    'PowerPoint, Keynote & PDF import',
    'Bring existing slide decks in as presentations.',
    'soon',
  ),

  // Library & playlists
  f(
    'library',
    'library',
    'Library',
    'Songs, hymns, presentations and media in one searchable library.',
  ),
  f(
    'playlists',
    'library',
    'Playlists',
    'Order everything for a service into a playlist, with section headers.',
  ),
  f('templates', 'library', 'Playlist templates', 'Start each week from a saved service template.'),
  f(
    'quick-search',
    'library',
    'Quick Search',
    'Press ⌘K to find any song, verse or item and send it to preview or the screen.',
  ),
  f(
    'calendar',
    'library',
    'Calendar scheduling',
    'Schedule looping or lobby content ahead of time.',
    'soon',
  ),
  f('cloud', 'library', 'Cloud sync', 'Share one library across your team and computers.', 'soon'),

  // Bible
  f(
    'bible-lookup',
    'bible',
    'Scripture lookup',
    'Type "jn 3 16" anywhere to find and show a passage.',
  ),
  f(
    'bible-mode',
    'bible',
    'Bible workspace',
    'Browse books, chapters and verses full size and send them to the playlist or the screen.',
  ),
  f(
    'bible-packages',
    'bible',
    'Installable translations',
    'Add Bible translations from package files.',
  ),
  f(
    'bible-parallel',
    'bible',
    'Parallel translations',
    'Show up to four translations side by side.',
  ),

  // Media
  f(
    'media-bin',
    'media',
    'Media bin',
    'Images and videos ready to show full screen or as backgrounds.',
  ),
  f(
    'video-transport',
    'media',
    'Video controls',
    'Play, pause, scrub, loop, mute and volume, in sync on every screen.',
  ),
  f('freeze', 'media', 'Freeze', 'Hold the current frame on screen while you change things.'),
  f(
    'video-input',
    'media',
    'Video inputs & cameras',
    'Bring a camera or capture card into slides and onto screens.',
    'soon',
  ),
  f(
    'stock-media',
    'media',
    'Stock media library',
    'Browse ready-made motion backgrounds and countdowns.',
    'soon',
  ),
  f(
    'masks',
    'media',
    'Custom masks',
    'Hide parts of the screen or shape the output for creative stages.',
    'soon',
  ),

  // Audio
  f(
    'audio-video',
    'audio',
    'Video sound',
    'Per-video mute and volume; sound plays from exactly one place.',
  ),
  f(
    'audio-bin',
    'audio',
    'Audio bin & playlists',
    'Walk-in music and sound cues, with playlists and fades.',
    'soon',
  ),
  f(
    'audio-input',
    'audio',
    'Audio inputs',
    'Route a microphone or mixer feed alongside video.',
    'soon',
  ),

  // Layers, props & looks
  f(
    'clear-groups',
    'layers',
    'Clear layers',
    'Clear slide, media, background, messages or props on their own, or everything at once.',
  ),
  f(
    'props',
    'layers',
    'Props',
    'Overlay a logo, image, video or text on top of everything with one click.',
  ),
  f('logo', 'layers', 'Logo screen', 'Cover the screen with your church name, image or video.'),
  f('off-air', 'layers', 'Off-air screen', 'What the projector shows when nothing is live.'),
  f(
    'announcements-layer',
    'layers',
    'Announcements layer',
    'Run looping announcements on their own layer alongside the main presentation.',
    'soon',
  ),
  f(
    'looks',
    'layers',
    'Looks',
    'Choose which layers appear on each screen, and switch between saved combinations.',
    'soon',
  ),

  // Screens & outputs
  f(
    'multi-screen',
    'screens',
    'Multiple screens',
    'Projectors, TVs and stage monitors, each assigned a role.',
  ),
  f('window-mode', 'screens', 'Window mode', 'Outputs as windows for rehearsal or window capture.'),
  f(
    'hot-plug',
    'screens',
    'Hot-plug displays',
    'Screens are remembered and re-assigned when plugged back in.',
  ),
  f('test-pattern', 'screens', 'Test pattern', 'Line up projectors with a built-in test pattern.'),
  f(
    'edge-blend',
    'screens',
    'Edge blending',
    'Blend several projectors into one wide canvas.',
    'soon',
  ),
  f(
    'ndi',
    'screens',
    'NDI output',
    'Send outputs over the network to streaming and video gear.',
    'soon',
  ),
  f('sdi', 'screens', 'SDI output', 'Output to broadcast switchers through capture cards.', 'soon'),
  f(
    'alpha-key',
    'screens',
    'Alpha key / key & fill',
    'Clean lyric graphics for a video switcher.',
    'soon',
  ),
  f(
    'multiview',
    'screens',
    'Operator multi-view',
    'See every input and output on one screen.',
    'soon',
  ),

  // Stage display
  f(
    'stage-current-next',
    'stage',
    'Current & next',
    'Shows the team what is on screen and what comes next.',
  ),
  f(
    'stage-clock',
    'stage',
    'Clock & timers on stage',
    'Time of day and running timers on the stage display.',
  ),
  f('stage-messages', 'stage', 'Stage messages', 'Messages only the team on stage can see.'),
  f(
    'stage-layouts',
    'stage',
    'Custom stage layouts',
    'Design your own stage screens and switch between them.',
    'soon',
  ),

  // Timers & clocks
  f(
    'countdown-slides',
    'timers',
    'Countdown slides',
    'A countdown to service start, right in the playlist.',
  ),
  f(
    'timers',
    'timers',
    'Timers',
    'Countdowns, countdown-to-time and elapsed timers you can start, stop and reset.',
  ),
  f(
    'video-countdowns',
    'timers',
    'Video countdowns',
    'Countdown videos synced to the start time.',
    'soon',
  ),

  // Messages
  f(
    'audience-messages',
    'messages',
    'Audience messages',
    'Reusable messages with fill-in fields, like "Parent of {number}", shown as a ticker or lower third.',
  ),
  f(
    'lower-thirds',
    'messages',
    'Lower thirds & ticker',
    'Speaker names and scrolling notices over everything else.',
  ),

  // Automation & control
  f(
    'shortcuts',
    'automation',
    'Keyboard shortcuts',
    'Every live action on the keyboard, and you can change them.',
  ),
  f('undo', 'automation', 'Undo & redo', 'Step back through playlist and slide edits.'),
  f(
    'macros',
    'automation',
    'Macros',
    'One click runs several actions: clear, change background, start a timer…',
    'soon',
  ),
  f(
    'slide-actions',
    'automation',
    'Slide actions',
    'Attach actions to a slide, like starting a video or switching a stage layout.',
    'soon',
  ),
  f(
    'timeline',
    'automation',
    'Timeline',
    'Record slide timings against audio and play them back automatically.',
    'soon',
  ),
  f(
    'midi-dmx',
    'automation',
    'MIDI & DMX',
    'Trigger slides from a sound desk or lighting console.',
    'soon',
  ),
  f('stream-deck', 'automation', 'Stream Deck', 'Run the show from physical buttons.', 'soon'),
  f(
    'api',
    'automation',
    'Control API',
    'Control Lampstand from other software on the network.',
    'soon',
  ),
  f(
    'network-link',
    'automation',
    'Network link',
    'Keep several computers in step for more outputs and backup.',
    'soon',
  ),

  // Capture & streaming
  f('record', 'capture', 'Record', 'Record the output to a video file.', 'soon'),
  f(
    'stream',
    'capture',
    'Stream',
    'Stream the output straight to YouTube, Facebook or any RTMP service.',
    'soon',
  ),

  // Remote & integrations
  f('ccli', 'integrations', 'CCLI licence on slides', 'Your licence number on song credits.'),
  f(
    'remote',
    'integrations',
    'Remote control app',
    'Run slides from a phone or tablet anywhere in the room.',
    'soon',
  ),
  f(
    'songselect',
    'integrations',
    'SongSelect & CCLI reporting',
    'Import songs from SongSelect and report usage automatically.',
    'soon',
  ),
  f(
    'planning-center',
    'integrations',
    'Planning Center',
    'Sync playlists with your Planning Center service plan.',
    'soon',
  ),
];

const byId = new Map(FEATURES.map((x) => [x.id, x]));

export function feature(id: string): Feature {
  const x = byId.get(id);
  if (!x) throw new Error(`Unknown feature: ${id}`);
  return x;
}

export const isSoon = (id: string): boolean => feature(id).status === 'soon';

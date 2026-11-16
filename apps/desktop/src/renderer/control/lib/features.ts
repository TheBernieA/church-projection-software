import i18n from '../i18n';
import { type Feature, type FeatureCategory, type FeatureStatus } from '../types';
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
  ),
  f(
    'objects',
    'presentations',
    'Custom objects & shapes',
    'Place shapes, text boxes, media and live video anywhere on a slide.',
  ),
  f(
    'effects',
    'presentations',
    'Text & background effects',
    'Blur, glow, colour filters and fills on text and backgrounds.',
  ),
  f(
    'chords',
    'presentations',
    'Chord charts',
    'Keep chords with lyrics, transpose them, and show them to the band on the stage display.',
  ),
  f(
    'import-slides',
    'presentations',
    'PowerPoint & PDF import',
    'Bring PowerPoint decks in as editable text slides, or PDFs as one picture per page. From Keynote, export to PDF or PowerPoint first.',
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
    'Put any camera or capture card the computer sees on screen, live: media bin › Video input. (NDI is listed separately.)',
  ),
  f(
    'stock-media',
    'media',
    'Stock media library',
    'Ready-made motion backgrounds by occasion and countdowns, drawn by Lampstand itself (offline, licence-free): media bin › Stock media.',
  ),
  f(
    'masks',
    'media',
    'Custom masks',
    'Hide parts of the screen or shape the output for creative stages.',
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
  ),
  f('audio-input', 'audio', 'Audio inputs', 'Route a microphone or mixer feed alongside video.'),

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
    'Run looping announcements on their own layer alongside the main presentation: the megaphone on an announcements or slides item; Looks can send it to lobby screens only.',
  ),
  f(
    'text-format',
    'presentations',
    'Text formatting',
    'Change the font, size, bold/italic, colour and alignment of a playlist item’s slides from the toolbar’s Text button, on top of its theme.',
  ),
  f(
    'looks',
    'layers',
    'Looks',
    'Choose which layers appear on each screen, and switch between saved combinations: Looks in the toolbar, made in Settings › Screens.',
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
  f('video-countdowns', 'timers', 'Video countdowns', 'Countdown videos synced to the start time.'),

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
    'Stream the output straight to YouTube, Facebook, Resi or any RTMP service.',
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
  // Further features (each listed under its category on the Features page).
  f(
    'live-previews',
    'screens',
    'Live screen previews',
    'See exactly what each screen is showing, right in the control window.',
  ),
  f(
    'speaker-notes',
    'stage',
    'Speaker notes on stage',
    'Notes on a slide show on the stage display, never to the room.',
  ),
  f(
    'bilingual',
    'presentations',
    'Bilingual lyrics',
    'Show a song in two languages at once, line by line.',
  ),
  f(
    'web-content',
    'presentations',
    'Web pages on slides',
    'Show a live web page, like a giving page or a feed, on a slide.',
  ),
  f(
    'song-import',
    'library',
    'Song file import',
    'Bring songs in from OpenLyrics, ProPresenter, EasyWorship and plain-text files.',
    'soon',
  ),
  f(
    'group-hotkeys',
    'automation',
    'Group hotkeys',
    'Jump straight to the chorus or bridge with a single key, wherever you are in the song.',
    'soon',
  ),
  f(
    'media-cues',
    'media',
    'Media playback options',
    'Start and end points, fades, what happens when a video ends (stop, loop or go to the next item), and whether it plays as soon as it goes live: “Playback options” on a video in the playlist.',
  ),
  f(
    'media-recent',
    'media',
    'Recently used',
    'The pictures, videos and audio you showed lately, at the top of the media sidebar.',
    'soon',
  ),
  f(
    'media-multiselect',
    'media',
    'Select several',
    'Pick many tiles at once to add them to a playlist, star them or delete them together.',
    'soon',
  ),
  f(
    'media-tags',
    'media',
    'Tags & smart collections',
    'Label media (Christmas, youth, walk-in) and keep collections that fill themselves by tag.',
    'soon',
  ),
  f(
    'media-relink',
    'media',
    'Replace or relink file',
    'Swap a clip for a new version everywhere it is used, or find a file that moved.',
    'soon',
  ),
  f(
    'media-optimise',
    'media',
    'Optimise for playback',
    'Convert heavy or unusual videos to a smooth, projector-friendly format in the background.',
    'soon',
  ),
  f(
    'playlist-folders',
    'media',
    'Playlist folders',
    'Group media playlists into folders (per series, season or ministry).',
    'soon',
  ),
  f(
    'media-favourites',
    'media',
    'Favourites',
    'Star pictures, videos and audio and find them all in the Favourites view of the media bin.',
  ),
  f(
    'media-playlists',
    'media',
    'Media playlists',
    'Group pictures and videos into your own playlists in the media bin: drag media onto a playlist, reorder it, and import straight into it.',
  ),
  f(
    'message-tokens',
    'messages',
    'Live clocks in messages',
    'Put a running timer or the time of day inside a message, e.g. "Service starts in {timer}".',
    'soon',
  ),
  f(
    'custom-clear-groups',
    'layers',
    'Custom clear groups',
    'One button that clears exactly the layers you choose, e.g. slide and props but not the background: Settings › Presenting › Clear groups, used from the “…” beside the monitor.',
  ),
  f(
    'syphon',
    'screens',
    'Syphon output',
    'Share outputs with other apps on the same Mac, like OBS.',
    'soon',
  ),
  f(
    'output-adjust',
    'screens',
    'Screen adjustments',
    'Keystone, corner pinning, scaling and colour correction for each screen.',
    'soon',
  ),
  f(
    'timecode',
    'automation',
    'Timecode',
    'Follow timecode from audio or video gear to fire slides on time.',
    'soon',
  ),
  f(
    'playback-markers',
    'automation',
    'Playback markers',
    'Markers on a video that trigger actions or stage messages at set moments.',
    'soon',
  ),
  f(
    'multitracks',
    'integrations',
    'MultiTracks',
    'Import lyrics, chord charts and cues from MultiTracks.',
    'soon',
  ),
  f(
    'stage-app',
    'integrations',
    'Stage app',
    'Show the stage display on a phone or tablet for musicians.',
    'soon',
  ),
];

const byId = new Map(FEATURES.map((x) => [x.id, x]));

export function feature(id: string): Feature {
  const x = byId.get(id);
  if (!x) throw new Error(`Unknown feature: ${id}`);
  return x;
}

/** Tooltip for a planned item: what it will do (from this catalogue). */
export function soonTitle(id: string): string {
  const f = feature(id);
  return `${i18n.t('soon.tooltip', { name: f.name })}. ${f.description}`;
}

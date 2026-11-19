import type {
  BackgroundLayer,
  StreamSettings,
  BibleVersionInfo,
  BookId,
  ContentLayer,
  LiveState,
  MediaItem,
  MediaLayer,
  ServiceItem,
  ServicePlan,
  Settings,
  SlideObject,
  Song,
  Theme,
  WebLayer,
  MediaPlaylist,
} from '@lampstand/core';
import type {
  DisplayInfo,
  Notice,
  ServiceSummary,
  NdiStatus,
  StreamStatus,
} from '@lampstand/ipc-contract';

/** Types shared across the control window. */

/** A service item of one kind, e.g. `ItemOf<'song'>`. */
export type ItemOf<K extends ServiceItem['kind']> = Extract<ServiceItem, { kind: K }>;
export type SongItem = ItemOf<'song'>;
export type PresentationItem = ItemOf<'presentation'>;
/** Items made of text slides (presentations and announcements). */
export type TextItem = ItemOf<'presentation' | 'announcements'>;
export type CountdownItem = ItemOf<'countdown'>;
export type WebItem = ItemOf<'web'>;

/** A prop (Props bin) and an audience message template, as saved in settings. */
export type Prop = Settings['props'][number];
export type Message = Settings['messages'][number];

export type SettingsPageId =
  | 'general'
  | 'scripture'
  | 'songs'
  | 'presenting'
  | 'screens'
  | 'video'
  | 'audio'
  | 'streaming'
  | 'ndi'
  | 'surfaces'
  | 'packages'
  | 'library'
  | 'about'
  | 'connections'
  | 'features'
  | 'guide';

/** Left-sidebar library source. */
export type LibraryTab = 'songs' | 'hymns';

/** The workspace in the centre pane (toolbar mode tabs). */
export type Mode = 'show' | 'edit' | 'reflow' | 'bible' | 'themes' | 'stage';

/** Media bin (under the slides) categories. */
/** What the media bin shows: a library view, a media playlist (see binPlaylistId), or a planned source. */
export type BinTab =
  | 'media'
  | 'favourites'
  | 'images'
  | 'videos'
  | 'audio'
  | 'backgrounds'
  | 'playlist'
  | 'video-input'
  | 'audio-input'
  | 'stock-media';
/** Show-controls tabs (under the output monitor). */
export type ControlsTab = 'audio' | 'stage' | 'timers' | 'messages' | 'props' | 'macros';

export type DialogName =
  | 'quick'
  | 'outputs'
  | 'settings'
  | 'shortcuts'
  | 'song'
  | 'theme'
  | 'services'
  | 'perf'
  | 'playback'
  | null;

export interface Toast {
  id: number;
  level: Notice['level'];
  text: string;
}

/** Where the operator is: the item + slide that is live (for next/previous). */
export interface Cursor {
  itemId: string;
  index: number;
}

export interface ControlState {
  live: LiveState | null;
  settings: Settings | null;
  songs: Song[];
  themes: Theme[];
  media: MediaItem[];
  mediaPlaylists: MediaPlaylist[];
  versions: BibleVersionInfo[];
  verseCounts: Record<string, Partial<Record<BookId, number[]>>>;
  /** Each version's own book names (none for English). */
  bookNames: Record<string, Partial<Record<BookId, string>>>;
  chapters: Record<string, string[]>;
  services: ServiceSummary[];
  service: ServicePlan | null;
  displays: DisplayInfo[];
  /** Livestream / recording status (from main). */
  stream: StreamStatus | null;
  ndi: NdiStatus | null;
  /** Item shown in the slide grid: from the service, or ad-hoc from the library/quick bar. */
  selectedItemId: string | null;
  adhoc: ServiceItem | null;
  previewCursor: Cursor | null;
  /** Slide selected for editing in the inspector. */
  editCursor: Cursor | null;
  /** Object selected on the canvas editor (text box, shape, picture), if any. */
  editObjectId: string | null;
  liveCursor: Cursor | null;
  libraryTab: LibraryTab;
  /** What the left sidebar lists below its outline: a library's songs, or the open playlist. */
  sidebarView: 'library' | 'playlist';
  mode: Mode;
  binTab: BinTab;
  /** The media playlist open in the bin (when binTab is 'playlist'). */
  binPlaylistId: string | null;
  /** The item looping on the announcements layer, if any. */
  announceItemId: string | null;
  /** The audio playlist open in the Audio tab (null: all audio). */
  audioPlaylistId: string | null;
  controlsTab: ControlsTab;
  binOpen: boolean;
  /** The Mixer, docked along the bottom (toolbar's Mixer button). */
  mixerOpen: boolean;
  /** The Live console: hidden, docked beside the output, or in its own window. */
  liveConsole: 'closed' | 'docked' | 'window';
  /**
   * The screens sent to the stream (the monitor's Send to stream): the stream's picture before,
   * to put back, and the one sent (so a scene picked meanwhile ends it).
   */
  streamTakeover: { previous: StreamSettings['picture']; sent: StreamSettings['picture'] } | null;
  /** The toolbar's Text bar (formatting for the selected item) is showing. */
  textBarOpen: boolean;
  /** Open page of the Settings window (remembered between openings). */
  settingsPage: SettingsPageId;
  dialog: DialogName;
  editingSongId: string | null;
  /** The media cue whose playback options are open. */
  playbackItemId: string | null;
  editingThemeId: string | null;
  /** The theme being edited is built in: the editor works on a copy, saved as a new theme. */
  editingThemeCopy: boolean;
  history: { canUndo: boolean; canRedo: boolean };
  toasts: Toast[];
  /** A service edit is waiting to be saved (status bar shows "Saving…"). */
  saving: boolean;
  set: (p: Partial<ControlState>) => void;
}

export interface EditOptions {
  /**
   * Typing: group rapid edits into one save (and one undo step) after a short pause.
   * Everything else (add, drop, move, delete…) is saved immediately as its own undo step.
   */
  typing?: boolean;
}

export type SlideAction =
  | { kind: 'content'; content: ContentLayer; background: BackgroundLayer | null }
  | { kind: 'media'; media: MediaLayer }
  | { kind: 'background'; background: BackgroundLayer }
  | { kind: 'web'; web: WebLayer };

export interface PresentableSlide {
  key: string;
  label: string;
  /** Section group for colour-coding (Verse/Chorus…). */
  group?: string;
  action: SlideAction;
  /** It has a background of its own (not the item's): its thumbnail shows it. */
  ownBackground?: boolean;
  /** Countdown duration resolved at go-live time. */
  countdownSec?: number;
  /** A count-to-time countdown ("HH:MM"): its target is worked out when it goes live. */
  countdownClock?: string;
  /** A countdown video, synced to end on zero when the slide goes live. */
  countdownVideo?: { mediaId: string; hideTimer: boolean };
}

export interface SlideContext {
  songs: Song[];
  themes: Theme[];
  media: MediaItem[];
  settings: Settings | null;
  versions: BibleVersionInfo[];
  verseCounts: Record<string, Partial<Record<BookId, number[]>>>;
  bookNames: Record<string, Partial<Record<BookId, string>>>;
  chapters: Record<string, string[]>;
}

export interface ItemSlides {
  slides: PresentableSlide[];
  /** Chapters that must be loaded before slides can be built. */
  missing: { versionId: string; book: BookId; chapter: number }[];
}

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

export type ShortcutAction =
  | 'goLive'
  | 'next'
  | 'previous'
  | 'clearContent'
  | 'clearMedia'
  | 'clearBackground'
  | 'clearOverlays'
  | 'clearAll'
  | 'black'
  | 'logo'
  | 'freeze'
  | 'panic'
  | 'quickBar'
  | 'undo'
  | 'redo'
  | 'cheatSheet'
  | 'perfHud'
  | 'mediaToggle'
  | 'settings'
  | 'switcherCut'
  | 'switcherAuto';

export type ObjectKind = SlideObject['kind'];

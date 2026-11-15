import type {
  BackgroundLayer,
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
} from '@lampstand/core';
import type { DisplayInfo, Notice, ServiceSummary } from '@lampstand/ipc-contract';

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

/** Bottom bin tabs. Audio, video input and macros are "Coming soon". */
export type BinTab =
  'media' | 'backgrounds' | 'props' | 'messages' | 'timers' | 'audio' | 'video-input' | 'macros';

export type DialogName =
  'quick' | 'outputs' | 'settings' | 'shortcuts' | 'song' | 'theme' | 'services' | 'perf' | null;

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
  versions: BibleVersionInfo[];
  verseCounts: Record<string, Partial<Record<BookId, number[]>>>;
  chapters: Record<string, string[]>;
  services: ServiceSummary[];
  service: ServicePlan | null;
  displays: DisplayInfo[];
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
  mode: Mode;
  binTab: BinTab;
  binOpen: boolean;
  /** Open page of the Settings window (remembered between openings). */
  settingsPage: SettingsPageId;
  dialog: DialogName;
  editingSongId: string | null;
  editingThemeId: string | null;
  history: { canUndo: boolean; canRedo: boolean };
  toasts: Toast[];
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
  /** Countdown duration resolved at go-live time. */
  countdownSec?: number;
}

export interface SlideContext {
  songs: Song[];
  themes: Theme[];
  media: MediaItem[];
  settings: Settings | null;
  versions: BibleVersionInfo[];
  verseCounts: Record<string, Partial<Record<BookId, number[]>>>;
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
  | 'mediaToggle';

export type ObjectKind = SlideObject['kind'];

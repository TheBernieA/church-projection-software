import {
  Archive,
  Cast,
  BookOpen,
  Compass,
  Map as MapIcon,
  MonitorPlay,
  Music,
  Package,
  Plug,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  SquareDashed,
  Video,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import { defaultSettings, type Settings } from '@lampstand/core';
import { type SettingsPageId } from '../../types';

/** The sidebar's sections, in order; each lists its pages. */
export const SETTINGS_SECTIONS: { id: string; pages: SettingsPageId[] }[] = [
  { id: 'workspace', pages: ['general', 'presenting', 'scripture', 'songs'] },
  { id: 'screens', pages: ['screens', 'video', 'ndi'] },
  { id: 'sound', pages: ['audio', 'streaming'] },
  { id: 'system', pages: ['packages', 'library', 'connections', 'about'] },
  { id: 'help', pages: ['guide', 'features'] },
];

export const PAGE_ICONS: Record<SettingsPageId, LucideIcon> = {
  general: SlidersHorizontal,
  presenting: MonitorPlay,
  scripture: BookOpen,
  songs: Music,
  screens: SquareDashed,
  video: Video,
  ndi: Cast,
  audio: Volume2,
  streaming: Radio,
  packages: Package,
  library: Archive,
  connections: Plug,
  about: ShieldCheck,
  guide: Compass,
  features: MapIcon,
};

/** Every page in sidebar order (↑/↓ walks this list). */
export const PAGE_ORDER: SettingsPageId[] = SETTINGS_SECTIONS.flatMap((s) => s.pages);

/**
 * "Reset this page": the patch that puts a page's preferences back to their defaults. Only
 * preferences: things you made (destinations, Looks, masks, clear groups) are kept.
 */
export const PAGE_RESET: Partial<
  Record<SettingsPageId, (s: Settings, d: Settings) => Partial<Settings>>
> = {
  general: (_, d) => ({ uiTheme: d.uiTheme, textScale: d.textScale }),
  scripture: (_, d) => ({ defaultBibleVersion: d.defaultBibleVersion, scripture: d.scripture }),
  songs: (_, d) => ({ lyrics: d.lyrics }),
  presenting: (s, d) => ({
    logo: { ...d.logo, text: s.logo.text },
    offAir: d.offAir,
    liveEditingKinds: d.liveEditingKinds,
  }),
  screens: (_, d) => ({ maskFor: d.maskFor }),
  video: (_, d) => ({
    mediaAutoplay: d.mediaAutoplay,
    keepCameraUnderWords: d.keepCameraUnderWords,
  }),
  audio: (s, d) => ({ audio: { ...d.audio, roomOutput: s.audio.roomOutput } }),
  streaming: (s, d) => ({ stream: { ...d.stream, destinations: s.stream.destinations } }),
};

export const resetPatch = (page: SettingsPageId, s: Settings): Partial<Settings> | null =>
  PAGE_RESET[page]?.(s, defaultSettings()) ?? null;

/**
 * Settings search: each entry is a row or card title (its i18n key, exactly as the page shows
 * it, so search can scroll to it) plus extra words people might type for it.
 */
export interface SearchEntry {
  page: SettingsPageId;
  label: string;
  keywords?: string;
}

export const SEARCH_INDEX: SearchEntry[] = [
  { page: 'general', label: 'settings.uiTheme', keywords: 'dark light appearance colour' },
  { page: 'general', label: 'settings.textScale', keywords: 'font zoom size bigger' },
  { page: 'scripture', label: 'settings.defaultVersion', keywords: 'bible translation kjv' },
  { page: 'scripture', label: 'settings.versesPerSlide', keywords: 'verse split' },
  { page: 'scripture', label: 'settings.maxChars', keywords: 'characters length' },
  { page: 'songs', label: 'settings.maxLines', keywords: 'lyrics lines split' },
  { page: 'songs', label: 'settings.ccli', keywords: 'licence license copyright' },
  { page: 'presenting', label: 'settings.logo.title', keywords: 'church name brand' },
  { page: 'presenting', label: 'settings.logo.name', keywords: 'church' },
  { page: 'presenting', label: 'settings.logo.tagline' },
  { page: 'presenting', label: 'settings.offAir.title', keywords: 'standby nothing live idle' },
  { page: 'presenting', label: 'clearGroups.title', keywords: 'clear layers button' },
  { page: 'presenting', label: 'settings.liveEditing', keywords: 'preview first click' },
  { page: 'screens', label: 'masks.use', keywords: 'mask edge blend' },
  { page: 'screens', label: 'looks.title', keywords: 'look layers screen' },
  { page: 'screens', label: 'masks.title', keywords: 'shape crop corners' },
  { page: 'video', label: 'settings.videoPlayback', keywords: 'autoplay video clip' },
  { page: 'video', label: 'inputs.switchTitle', keywords: 'camera capture card switch' },
  { page: 'video', label: 'switcher.click', keywords: 'switcher preview program cut auto pip' },
  { page: 'audio', label: 'mixer.title', keywords: 'mixer fader eq compressor limiter solo' },
  { page: 'audio', label: 'audioSettings.roomOutput', keywords: 'speaker sound device output' },
  { page: 'audio', label: 'audioSettings.fade', keywords: 'fade out seconds' },
  { page: 'audio', label: 'audioSettings.tracks', keywords: 'music playlist' },
  { page: 'audio', label: 'audio.listenOn', keywords: 'headphones preview cue' },
  { page: 'audio', label: 'audioSettings.inputs', keywords: 'microphone mic level' },
  {
    page: 'streaming',
    label: 'streaming.destinations',
    keywords: 'stream key rtmp youtube facebook live',
  },
  { page: 'streaming', label: 'streaming.picture', keywords: 'lower third camera words' },
  { page: 'streaming', label: 'streaming.sound', keywords: 'microphone mix audio' },
  { page: 'streaming', label: 'streaming.quality', keywords: 'bitrate resolution fps encoder' },
  { page: 'streaming', label: 'streaming.recording', keywords: 'record mp4 folder file' },
  { page: 'packages', label: 'settings.pages.packages', keywords: 'install bible hymnal module' },
  { page: 'library', label: 'settings.backups', keywords: 'backup restore' },
  { page: 'library', label: 'settings.moveLibrary', keywords: 'export import move computer' },
  { page: 'connections', label: 'connections.control', keywords: 'remote phone tablet' },
  { page: 'connections', label: 'connections.network', keywords: 'network' },
  { page: 'ndi', label: 'ndi.feeds', keywords: 'ndi network vmix obs key alpha feed' },
  { page: 'about', label: 'settings.version', keywords: 'about update licence' },
  { page: 'guide', label: 'guide.allKeys', keywords: 'keyboard shortcuts keys' },
  { page: 'features', label: 'settings.pages.features', keywords: 'roadmap coming soon' },
];

export interface SearchHit {
  page: SettingsPageId;
  /** The translated label (what the page shows; also how search finds it on the page). */
  label: string;
}

/**
 * Settings that match a query: every word must appear in the label, its page's name or help,
 * or its keywords. Pages whose name matches come first.
 */
export function searchSettings(query: string, t: (key: string) => string, max = 12): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const pageHits: SearchHit[] = [];
  const rowHits: SearchHit[] = [];
  for (const page of PAGE_ORDER) {
    const name = t(`settings.pages.${page}`);
    if (words.every((w) => name.toLowerCase().includes(w))) pageHits.push({ page, label: name });
  }
  for (const e of SEARCH_INDEX) {
    const label = t(e.label);
    const hay = [label, t(`settings.pages.${e.page}`), e.keywords ?? ''].join(' ').toLowerCase();
    if (words.every((w) => hay.includes(w)) && !pageHits.some((p) => p.label === label))
      rowHits.push({ page: e.page, label });
  }
  return [...pageHits, ...rowHits].slice(0, max);
}

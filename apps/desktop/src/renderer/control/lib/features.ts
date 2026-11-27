import i18n from '../i18n';
import { type Feature, type FeatureCategory, type FeatureStatus } from '../types';

/** The catalogue's sections, in order (their names are in the locale, `featureCategories.*`). */
export const FEATURE_CATEGORIES: { id: FeatureCategory; readonly name: string }[] = (
  [
    'presentations',
    'library',
    'bible',
    'media',
    'audio',
    'layers',
    'screens',
    'stage',
    'timers',
    'messages',
    'automation',
    'capture',
    'assistant',
    'integrations',
  ] as const
).map((id) => ({
  id,
  get name() {
    return i18n.t(`featureCategories.${id}`);
  },
}));

/** A feature: its words come from the locale (`features.<id>.name` / `.description`). */
const f = (
  id: string,
  category: FeatureCategory,
  status: FeatureStatus = 'available',
): Feature => ({
  id,
  category,
  status,
  get name() {
    return i18n.t(`features.${id}.name`);
  },
  get description() {
    return i18n.t(`features.${id}.description`);
  },
});

export const FEATURES: Feature[] = [
  f('slide-groups', 'presentations'),
  f('reflow', 'presentations'),
  f('quick-edit', 'presentations'),
  f('themes', 'presentations'),
  f('transitions', 'presentations'),
  f('live-editing', 'presentations'),
  f('arrangements', 'presentations'),
  f('objects', 'presentations'),
  f('effects', 'presentations'),
  f('chords', 'presentations'),
  f('import-slides', 'presentations'),
  f('library', 'library'),
  f('playlists', 'library'),
  f('templates', 'library'),
  f('quick-search', 'library'),
  f('calendar', 'library', 'soon'),
  f('cloud', 'library', 'soon'),
  f('bible-lookup', 'bible'),
  f('bible-mode', 'bible'),
  f('bible-packages', 'bible'),
  f('bible-parallel', 'bible'),
  f('media-bin', 'media'),
  f('video-transport', 'media'),
  f('freeze', 'media'),
  f('video-input', 'media'),
  f('camera-control', 'media'),
  f('stock-media', 'media'),
  f('masks', 'media'),
  f('audio-video', 'audio'),
  f('audio-bin', 'audio'),
  f('audio-input', 'audio'),
  f('mixer', 'audio'),
  f('channel-eq', 'audio'),
  f('processing-presets', 'audio'),
  f('desk-link', 'audio'),
  f('clear-groups', 'layers'),
  f('props', 'layers'),
  f('logo', 'layers'),
  f('off-air', 'layers'),
  f('announcements-layer', 'layers'),
  f('text-format', 'presentations'),
  f('looks', 'layers'),
  f('multi-screen', 'screens'),
  f('window-mode', 'screens'),
  f('hot-plug', 'screens'),
  f('test-pattern', 'screens'),
  f('edge-blend', 'screens'),
  f('ndi', 'screens'),
  f('sdi', 'screens', 'soon'),
  f('alpha-key', 'screens'),
  f('multiview', 'screens'),
  f('stage-current-next', 'stage'),
  f('stage-clock', 'stage'),
  f('stage-messages', 'stage'),
  f('stage-layouts', 'stage'),
  f('countdown-slides', 'timers'),
  f('timers', 'timers'),
  f('video-countdowns', 'timers'),
  f('audience-messages', 'messages'),
  f('lower-thirds', 'messages'),
  f('shortcuts', 'automation'),
  f('undo', 'automation'),
  f('macros', 'automation', 'soon'),
  f('slide-actions', 'automation', 'soon'),
  f('timeline', 'automation', 'soon'),
  f('midi-osc', 'automation'),
  f('dmx', 'automation', 'soon'),
  f('stream-deck', 'automation', 'soon'),
  f('api', 'automation', 'soon'),
  f('network-link', 'automation', 'soon'),
  f('record', 'capture'),
  f('stream', 'capture'),
  f('direct-link', 'capture'),
  f('lower-third-mode', 'capture'),
  f('live-console', 'capture'),
  f('ccli', 'integrations'),
  f('remote', 'integrations', 'soon'),
  f('songselect', 'integrations', 'soon'),
  f('planning-center', 'integrations', 'soon'),
  f('live-previews', 'screens'),
  f('speaker-notes', 'stage'),
  f('bilingual', 'presentations'),
  f('web-content', 'presentations'),
  f('song-import', 'library'),
  f('group-hotkeys', 'automation', 'available'),
  f('media-cues', 'media'),
  f('media-recent', 'media', 'soon'),
  f('media-multiselect', 'media', 'soon'),
  f('media-tags', 'media', 'soon'),
  f('media-relink', 'media', 'soon'),
  f('media-optimise', 'media', 'soon'),
  f('playlist-folders', 'media', 'soon'),
  f('media-favourites', 'media'),
  f('media-playlists', 'media'),
  f('message-tokens', 'messages', 'soon'),
  f('custom-clear-groups', 'layers'),
  f('syphon', 'screens', 'soon'),
  f('output-adjust', 'screens'),
  f('timecode', 'automation', 'soon'),
  f('playback-markers', 'automation', 'soon'),
  f('multitracks', 'integrations', 'soon'),
  f('stage-app', 'integrations', 'soon'),
  f('ai-planner', 'assistant'),
  f('ai-lyrics', 'assistant'),
  f('scripture-listening', 'assistant'),
  f('voice-commands', 'assistant'),
  f('live-transcript', 'assistant'),
  f('quoted-verses', 'assistant', 'soon'),
  f('live-captions', 'assistant', 'soon'),
  f('sermon-points', 'assistant', 'soon'),
  f('sermon-notes', 'assistant', 'soon'),
  f('lyric-follow', 'assistant', 'soon'),
  f('song-suggestions', 'assistant', 'soon'),
  f('operator-chat', 'assistant', 'soon'),
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

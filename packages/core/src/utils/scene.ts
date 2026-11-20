import type { Masks, Overlay, Scene } from '../schemas/scene';
import type { Look, LookLayer, ScreenMask, Settings } from '../schemas/settings';
import type { Theme } from '../schemas/theme';

export const EMPTY_MASKS: Masks = { black: false, logo: false, freeze: false };
export const EMPTY_SCENE: Scene = {
  background: null,
  media: null,
  content: null,
  overlays: [],
  masks: EMPTY_MASKS,
};

/** Build a scene from just the layers you care about; everything else is empty. */
export function makeScene(layers: Partial<Scene> = {}): Scene {
  return { ...EMPTY_SCENE, ...layers };
}

/** Text or media on screen — what the operator thinks of as "live". */
export function sceneHasContent(scene: Scene): boolean {
  return !!(scene.content || scene.media || scene.web || scene.announcement || scene.input);
}

/** Anything at all on screen, including a background. */
export function sceneIsVisible(scene: Scene): boolean {
  return sceneHasContent(scene) || !!scene.background;
}

/** Which clear group an overlay belongs to. */
export function overlayGroup(o: Overlay): 'messages' | 'props' {
  return o.kind === 'ticker' || o.kind === 'lower-third' ? 'messages' : 'props';
}

/**
 * What a screen shows under a Look: only the layers it lists (the web page counts as the slide).
 * Masks (black, logo, freeze) always apply.
 */
export function applyLook(scene: Scene, layers: readonly LookLayer[] | null | undefined): Scene {
  if (!layers) return scene;
  const on = (l: LookLayer): boolean => layers.includes(l);
  return {
    ...scene,
    background: on('background') ? scene.background : null,
    media: on('media') ? scene.media : null,
    input: on('media') ? (scene.input ?? null) : null,
    content: on('content') ? scene.content : null,
    web: on('content') ? (scene.web ?? null) : null,
    announcement: on('announcements') ? (scene.announcement ?? null) : null,
    overlays: scene.overlays.filter((o) => on(overlayGroup(o))),
  };
}

/**
 * A scene with its words drawn in another theme (lower-third mode: the same words, along the
 * bottom). Everything else is untouched; no theme leaves the scene as it is.
 */
export function withWordsTheme(scene: Scene, theme: Theme | null | undefined): Scene {
  if (!theme || !scene.content) return scene;
  return { ...scene, content: { ...scene.content, theme } };
}

/** A theme with its words (and reference) put left, centre or right. */
export function themeAligned(theme: Theme, align: 'left' | 'center' | 'right'): Theme {
  return {
    ...theme,
    text: { ...theme.text, align },
    reference: { ...theme.reference, align },
  };
}

/** Where a theme puts its words across the picture (justified counts as left). */
export const themeAlignOf = (theme: Theme): 'left' | 'center' | 'right' =>
  theme.text.align === 'right' ? 'right' : theme.text.align === 'center' ? 'center' : 'left';

/** The kinds of slide a theme can be chosen for. */
export type ThemeKind = 'scripture' | 'lyrics' | 'text';
/** Themes by kind of slide (looked up from their ids), for one output. */
export type ResolvedKindThemes = Partial<Record<ThemeKind, Theme>>;

/** Which theme choice a slide falls under (countdowns and the rest count as text). */
const themeKindOf = (kind: string): ThemeKind =>
  kind === 'scripture' || kind === 'lyrics' ? kind : 'text';

/** An output's chosen theme for each kind of slide, looked up by id (missing ones left out). */
export function resolveKindThemes(
  ids: Partial<Record<ThemeKind, string | undefined>>,
  themes: readonly Theme[],
): ResolvedKindThemes {
  const out: ResolvedKindThemes = {};
  for (const kind of ['scripture', 'lyrics', 'text'] as const) {
    const id = ids[kind];
    const theme = id ? themes.find((t) => t.id === id) : undefined;
    if (theme) out[kind] = theme;
  }
  return out;
}

/** A scene with its words in this output's theme for that kind of slide, if it has one. */
export function withKindThemes(scene: Scene, themes: ResolvedKindThemes | null | undefined): Scene {
  const theme = themes && scene.content ? themes[themeKindOf(scene.content.kind)] : undefined;
  return theme ? withWordsTheme(scene, theme) : scene;
}

/** The flat colour behind a key feed (what the video mixer removes). */
export const KEY_COLORS = { green: '#00B140', blue: '#0047BB', black: '#000000' } as const;

/**
 * A scene as a key feed for a video mixer: the words, messages and props only, over a flat
 * colour. Pictures, video and cameras are left out (the mixer has its own).
 */
export function keyFeedScene(scene: Scene, mode: keyof typeof KEY_COLORS): Scene {
  return {
    ...scene,
    background: { ref: { kind: 'color', color: KEY_COLORS[mode] } },
    media: null,
    input: null,
    inputNext: null,
    pip: null,
    web: null,
  };
}

/** The layers a Look shows on a kind of screen (null: no Look applies, everything shows). */
export function lookLayersFor(look: Look | null | undefined, role: string): LookLayer[] | null {
  return look && (role === 'main' || role === 'secondary') ? look[role] : null;
}

/** The screen mask a kind of screen uses (the stage display is never masked). */
export function maskForRole(settings: Settings, role: string): ScreenMask | null {
  if (role !== 'main' && role !== 'secondary') return null;
  const id = settings.maskFor[role];
  return (id && settings.screenMasks.find((m) => m.id === id)) || null;
}

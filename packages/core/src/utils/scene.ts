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

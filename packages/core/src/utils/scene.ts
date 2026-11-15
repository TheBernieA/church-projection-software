import type { Masks, Overlay, Scene } from '../schemas/scene';

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
  return !!(scene.content || scene.media || scene.web);
}

/** Anything at all on screen, including a background. */
export function sceneIsVisible(scene: Scene): boolean {
  return sceneHasContent(scene) || !!scene.background;
}

/** Which clear group an overlay belongs to. */
export function overlayGroup(o: Overlay): 'messages' | 'props' {
  return o.kind === 'ticker' || o.kind === 'lower-third' ? 'messages' : 'props';
}

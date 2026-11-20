import { useMemo } from 'react';
import {
  applyLook,
  keyFeedScene,
  lookLayersFor,
  makeScene,
  maskForRole,
  resolveKindThemes,
  withKindThemes,
  withScreenWords,
  withWordsTheme,
  type Scene,
  type ScreenMask,
} from '@lampstand/core';
import { useStore } from './store';

/**
 * What each screen shows, worked out the way its output window does, for the monitors and the
 * multi-view (so what the operator sees matches the room).
 */

/** The audience screens: Program, in the lower third's theme when it's on, under the Look. */
export function useAudienceScene(): Scene | null {
  const live = useStore((s) => s.live);
  // The words as the audience screens draw them (Words on the screens: size, alignment).
  const scale = useStore((s) => s.settings?.wordsScale ?? 1);
  const align = useStore((s) => s.settings?.wordsAlign ?? 'theme');
  return useMemo(
    () =>
      live
        ? applyLook(
            withScreenWords(withWordsTheme(live.program, live.lowerThird), { scale, align }),
            lookLayersFor(live.look, 'main'),
          )
        : null,
    [live, scale, align],
  );
}

/** Preview: what's waiting (on the background on screen when it has none of its own). */
export function usePreviewScene(): Scene | null {
  const live = useStore((s) => s.live);
  return useMemo(
    () =>
      live
        ? makeScene({
            background: live.preview.background ?? live.program.background,
            content: live.preview.content,
            media: live.preview.media ?? null,
            web: live.preview.web ?? null,
          })
        : null,
    [live],
  );
}

/** The next slide, on the background on screen (as the stage display has it). */
export function useNextScene(): Scene | null {
  const live = useStore((s) => s.live);
  return useMemo(
    () =>
      live ? makeScene({ background: live.program.background, content: live.next ?? null }) : null,
    [live],
  );
}

/**
 * The alternate (HDMI) output: its own themes for each kind of slide, under the Look's
 * secondary layers, and as a key feed (words over a flat colour) when it's set to be one.
 */
export function useAlternateScene(): Scene | null {
  const live = useStore((s) => s.live);
  const ids = useStore((s) => s.settings?.outputThemes.alternate);
  const key = useStore((s) => s.settings?.keyFeed.mode ?? 'off');
  const themes = useStore((s) => s.themes);
  return useMemo(() => {
    if (!live) return null;
    const own = resolveKindThemes(ids ?? {}, themes);
    const scene = applyLook(
      withKindThemes(withWordsTheme(live.program, live.lowerThird), own),
      lookLayersFor(live.look, 'secondary'),
    );
    return key === 'off' ? scene : keyFeedScene(scene, key);
  }, [live, ids, key, themes]);
}

/** The mask a kind of screen uses (Settings › Screens), so a monitor shows its shape. */
export const useScreenMask = (role: 'main' | 'secondary'): ScreenMask | null =>
  useStore((s) => (s.settings ? maskForRole(s.settings, role) : null));

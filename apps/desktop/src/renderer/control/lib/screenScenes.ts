import {
  themeAligned,
  themeAlignOf,
  type LiveState,
  type SwitcherAction,
  type Theme,
} from '@lampstand/core';
import type { SceneChoice } from '../components/scenes/SceneStrip';
import { setLowerThird } from './actions';
import { cmd } from './api';
import { inputLayerFor } from './inputs';
import { remembered } from './prefs';
import { lowerThirdThemes } from './slides';
import { attempt, useStore } from './store';

/**
 * Scenes on the screens: a scene is made of what the screens already have, the video switcher's
 * camera on Program, its picture-in-picture (in a corner, or side by side), and the lower third.
 * So the projector, its monitors and the stream's "Main screen" all show it with no new layer.
 */

export const LT_THEME_KEY = 'lampstand.lowerThird.theme';
export const LT_ALIGN_KEY = 'lampstand.lowerThird.align';
export type Align = 'left' | 'center' | 'right';

/** The lower third to switch on: the theme and position used last, else the first one there is. */
export function rememberedLowerThird(themes: Theme[]): Theme | null {
  const choices = lowerThirdThemes(themes);
  const theme = choices.find((th) => th.id === remembered(LT_THEME_KEY)) ?? choices[0];
  if (!theme) return null;
  const a = remembered(LT_ALIGN_KEY);
  return themeAligned(
    theme,
    a === 'left' || a === 'center' || a === 'right' ? a : themeAlignOf(theme),
  );
}

/** Is this scene the one on the screens now? */
export function screenSceneOn(c: SceneChoice, live: LiveState | null): boolean {
  if (!live) return false;
  const p = c.patch;
  const input = live.program.input?.deviceId ?? null;
  const pip = live.program.pip ?? null;
  if ((p.words === 'lowerThird') !== !!live.lowerThird) return false;
  switch (p.background) {
    case 'camera':
      return input === p.camera && !pip;
    case 'layout':
      return (
        input === p.camera &&
        !!pip &&
        pip.deviceId === p.secondCamera &&
        !!pip.side === (p.layout === 'sideBySide')
      );
    case 'program':
    case 'switcher':
    case 'black':
      return !input && !pip;
  }
}

const switcher = (a: SwitcherAction) =>
  attempt(() => cmd('live.switcher', a, 'ui'), 'errors.input');

/**
 * Put a scene on the screens: its camera on Program (with the switcher's transition), its second
 * camera in the corner or alongside (or none), and the lower third on or off.
 */
export async function applyScreenScene(
  c: SceneChoice,
  devices: { deviceId: string; label: string }[],
): Promise<void> {
  const s = useStore.getState();
  const live = s.live;
  const settings = s.settings?.switcher;
  const device = (id: string | null | undefined) => devices.find((d) => d.deviceId === id) ?? null;
  const p = c.patch;
  const first = p.background === 'program' ? null : device(p.camera);
  const second = p.background === 'layout' ? device(p.secondCamera) : null;
  if ((live?.program.input?.deviceId ?? null) !== (first?.deviceId ?? null))
    await switcher({
      action: 'take',
      input: first ? inputLayerFor(first) : null,
      ...(settings?.transition ? { transition: settings.transition } : {}),
    });
  const corner = settings?.pip ?? { corner: 'tr' as const, size: 0.3 };
  const pip = second
    ? {
        ...inputLayerFor(second),
        ...(p.layout === 'sideBySide' ? { corner: corner.corner, size: 0.5, side: true } : corner),
      }
    : null;
  if (pip || live?.program.pip) await switcher({ action: 'pip', pip });
  const wantLowerThird = p.words === 'lowerThird';
  if (wantLowerThird !== !!live?.lowerThird)
    await setLowerThird(wantLowerThird ? rememberedLowerThird(s.themes) : null);
}

import type { SwitcherAction } from '@lampstand/core';
import { cmd } from './api';
import { useEffect } from 'react';
import {
  inputLayerFor,
  useCameraSettingsVersion,
  useInputDevices,
  type InputDevice,
} from './inputs';
import { attempt, useStore } from './store';

/**
 * The video switcher, from the control window: Preview, Cut, Auto, the T-bar and
 * picture-in-picture (Media › Video input, and keys 1–9, C and T).
 */
const send = (a: SwitcherAction, source: 'ui' | 'shortcut' = 'ui'): Promise<unknown> =>
  attempt(() => cmd('live.switcher', a, source), 'errors.input');

const settings = () => useStore.getState().settings?.switcher;

export const previewSource = (device: InputDevice | null): Promise<unknown> =>
  send({ action: 'preview', input: device ? inputLayerFor(device) : null });

export const cut = (source?: 'ui' | 'shortcut'): Promise<unknown> =>
  send({ action: 'cut' }, source);

export const auto = (source?: 'ui' | 'shortcut'): Promise<unknown> =>
  send(
    { action: 'auto', transition: settings()?.transition ?? { kind: 'fade', durationMs: 600 } },
    source,
  );

/** A camera straight to Program, with the Auto transition (or a cut). */
export const take = (
  device: InputDevice | null,
  withTransition = true,
  source?: 'ui' | 'shortcut',
): Promise<unknown> => {
  const transition = settings()?.transition;
  return send(
    {
      action: 'take',
      input: device ? inputLayerFor(device) : null,
      ...(withTransition && transition ? { transition } : {}),
    },
    source,
  );
};

/** Clicking a camera: Preview first, or straight on screen (Settings › Video). */
export const clickSource = (device: InputDevice): Promise<unknown> =>
  settings()?.click === 'program' ? take(device) : previewSource(device);

let tbarTimer: ReturnType<typeof setTimeout> | null = null;
let tbarPos = 0;
/** The T-bar moved: sent at most every 40 ms (the last position always goes). */
export function tbar(pos: number): void {
  tbarPos = pos;
  tbarTimer ??= setTimeout(() => {
    tbarTimer = null;
    void send({ action: 'tbar', pos: tbarPos });
  }, 40);
}
export function tbarRelease(): void {
  if (tbarTimer) clearTimeout(tbarTimer);
  tbarTimer = null;
  void send({ action: 'tbar', pos: tbarPos }).then(() => send({ action: 'tbarRelease' }));
}

/** Picture-in-picture: this camera in the corner from Settings (or none). */
export const setPip = (device: InputDevice | null): Promise<unknown> => {
  const p = settings()?.pip ?? { corner: 'br' as const, size: 0.3 };
  return send({ action: 'pip', pip: device ? { ...inputLayerFor(device), ...p } : null });
};

/** The cameras the switcher offers, in order (for keys 1–9), kept current by the app. */
let sources: InputDevice[] = [];
export const switcherSource = (n: number): InputDevice | null => sources[n - 1] ?? null;

/** Keep the numbered cameras current (the same list and order as Media › Video input). */
export function useSwitcherSources(): void {
  const all = useInputDevices('videoinput');
  const saved = useCameraSettingsVersion();
  useEffect(() => {
    sources = (all ?? []).filter((d) => !saved[d.deviceId]?.hidden);
  }, [all, saved]);
}

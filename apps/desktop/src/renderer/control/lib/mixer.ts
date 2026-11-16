import { applyMixerAction, type MixerAction } from '@lampstand/core';
import { cmd } from './api';
import { attempt, useStore } from './store';

/** A mixer command (add an input, mute, route…), sent at once. */
export const mixerCmd = (a: MixerAction): Promise<unknown> =>
  attempt(() => cmd('live.mixer', a), 'errors.mixer');

type Live = Extract<MixerAction, { action: 'channel' | 'bus' }>;
const pending = new Map<string, Live>();
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * A level that moves continuously (a fader being dragged, an EQ knob): shown here at once,
 * sent at most every 40 ms (the last value always goes), so dragging never floods the windows.
 */
export function mixerLive(a: Live): void {
  const s = useStore.getState();
  if (s.live) useStore.setState({ live: { ...s.live, mixer: applyMixerAction(s.live.mixer, a) } });
  const key = a.action === 'bus' ? `bus:${a.bus}` : `ch:${a.id}`;
  const prev = pending.get(key);
  pending.set(key, prev ? ({ ...a, patch: { ...prev.patch, ...a.patch } }) : a);
  timer ??= setTimeout(() => {
    timer = null;
    const all = [...pending.values()];
    pending.clear();
    for (const x of all) void mixerCmd(x);
  }, 40);
}

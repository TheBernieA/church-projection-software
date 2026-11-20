import type { Mixer } from '@lampstand/core';
import i18n from '../i18n';
import { mixerCmd } from './mixer';
import { toast, useStore } from './store';
import { channelName } from './utils';

/** Turned down further than this, a level is put back to normal (0 dB) when going live. */
const TOO_LOW_DB = -6;

/** What would keep the stream's audience from hearing anything, and the fix for each. */
export type SoundFix =
  | { kind: 'unmuteStream' }
  | { kind: 'streamUp' }
  | { kind: 'sendInput'; id: string; name: string }
  | { kind: 'addMic'; deviceId: string; name: string }
  | { kind: 'inputUp'; id: string; name: string };

/**
 * Before going live: what in the mixer would leave the stream silent. The stream mix muted or
 * turned right down; no mic or desk sent to it (send the first input there is, else add the
 * computer's mic); an input sent to it but turned right down. Pure, so it's easy to check.
 */
export function soundFixes(mixer: Mixer, mics: { deviceId: string; label: string }[]): SoundFix[] {
  const fixes: SoundFix[] = [];
  if (mixer.stream.mute) fixes.push({ kind: 'unmuteStream' });
  if (mixer.stream.gainDb < TOO_LOW_DB) fixes.push({ kind: 'streamUp' });
  const inputs = mixer.channels.filter((c) => c.kind === 'input');
  const heard = inputs.filter((c) => c.stream && !c.mute);
  if (heard.length === 0) {
    const first = inputs[0];
    const mic = mics.find((d) => d.deviceId === 'default') ?? mics[0];
    if (first) fixes.push({ kind: 'sendInput', id: first.id, name: first.name });
    else if (mic) fixes.push({ kind: 'addMic', deviceId: mic.deviceId, name: mic.label });
  }
  for (const c of heard)
    if (c.gainDb < TOO_LOW_DB) fixes.push({ kind: 'inputUp', id: c.id, name: c.name });
  return fixes;
}

/** The mics this computer has (the ones not left out in Audio inputs › Choose). */
async function mics(): Promise<{ deviceId: string; label: string }[]> {
  const hidden = new Set(useStore.getState().settings?.hiddenAudioInputs ?? []);
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all
      .filter((d) => d.kind === 'audioinput' && d.deviceId && !hidden.has(d.deviceId))
      .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Microphone' }));
  } catch {
    return [];
  }
}

/**
 * Going live: make sure the stream's audience will hear something (the stream mix unmuted and
 * up, a mic or the desk sent to it and up). Says what it changed, if anything.
 */
export async function prepareStreamSound(): Promise<void> {
  const mixer = useStore.getState().live?.mixer;
  if (!mixer) return;
  const fixes = soundFixes(mixer, await mics());
  if (fixes.length === 0) return;
  const stream: { mute?: boolean; gainDb?: number } = {};
  for (const f of fixes) {
    if (f.kind === 'unmuteStream') stream.mute = false;
    if (f.kind === 'streamUp') stream.gainDb = 0;
    if (f.kind === 'sendInput')
      await mixerCmd({ action: 'channel', id: f.id, patch: { stream: true, mute: false } });
    if (f.kind === 'addMic')
      await mixerCmd({
        action: 'add',
        deviceId: f.deviceId,
        name: channelName(f.name),
        stream: true,
        room: false, // the room hears the speaker already: playing it again would echo
      });
    if (f.kind === 'inputUp') await mixerCmd({ action: 'channel', id: f.id, patch: { gainDb: 0 } });
  }
  if (Object.keys(stream).length) await mixerCmd({ action: 'bus', bus: 'stream', patch: stream });
  toast(
    i18n.t('live.soundReady', {
      changes: fixes
        .map((f) => i18n.t(`live.soundFix.${f.kind}`, { name: 'name' in f ? f.name : '' }))
        .join(', '),
    }),
  );
}

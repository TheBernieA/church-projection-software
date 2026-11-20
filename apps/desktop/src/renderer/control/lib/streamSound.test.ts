import { describe, expect, it, vi } from 'vitest';
import { applyMixerAction, initialLiveState, type Mixer } from '@lampstand/core';

vi.mock('./mixer', () => ({ mixerCmd: vi.fn() }));
vi.mock('./store', () => ({ toast: vi.fn(), useStore: { getState: () => ({}) } }));
vi.mock('../i18n', () => ({ default: { t: (k: string) => k } }));
const { soundFixes } = await import('./streamSound');

const base = (): Mixer => initialLiveState().mixer;
const mic = { deviceId: 'default', label: 'Built-in Microphone' };

describe('going live: the audience will hear something', () => {
  it('a muted, turned-down stream with nothing sent to it: unmute, turn up, add the mic', () => {
    const m = applyMixerAction(base(), {
      action: 'bus',
      bus: 'stream',
      patch: { mute: true, gainDb: -30 },
    });
    expect(soundFixes(m, [mic]).map((f) => f.kind)).toEqual(['unmuteStream', 'streamUp', 'addMic']);
  });
  it('an input on the mixer but not on the stream: send it (no new mic)', () => {
    const m = applyMixerAction(base(), {
      action: 'add',
      deviceId: 'desk',
      name: 'Desk',
      stream: false,
    });
    const fixes = soundFixes(m, [mic]);
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toMatchObject({ kind: 'sendInput', name: 'Desk' });
  });
  it('a mic on the stream but turned right down: back to 0 dB; all fine: nothing to do', () => {
    let m = applyMixerAction(base(), { action: 'add', deviceId: 'd', name: 'Mic', stream: true });
    const id = m.channels.find((c) => c.kind === 'input')?.id ?? '';
    expect(soundFixes(m, [mic])).toEqual([]);
    m = applyMixerAction(m, { action: 'channel', id, patch: { gainDb: -24 } });
    expect(soundFixes(m, [mic])).toEqual([{ kind: 'inputUp', id, name: 'Mic' }]);
  });
});

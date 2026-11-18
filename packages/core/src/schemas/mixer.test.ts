import { describe, expect, it } from 'vitest';
import {
  applyMixerAction,
  dbToGain,
  defaultMixer,
  MixerActionSchema,
  formatDb,
  gainToDb,
  mixerFromSettings,
  sendGain,
} from './mixer';
import { defaultSettings } from './settings';

describe('mixer', () => {
  it('converts dB and gain both ways', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-60)).toBe(0);
    expect(dbToGain(6)).toBeCloseTo(1.995, 3);
    expect(gainToDb(1)).toBe(0);
    expect(gainToDb(0.5)).toBeCloseTo(-6.02, 2);
    expect(gainToDb(0)).toBe(-Infinity);
    expect(formatDb(-60)).toBe('−∞');
    expect(formatDb(3)).toBe('+3.0 dB');
    expect(formatDb(-12.5)).toBe('−12.5 dB');
    expect(formatDb(0)).toBe('0.0 dB');
  });

  it('starts with tracks and video, to the room and the stream', () => {
    const m = defaultMixer();
    expect(m.channels.map((c) => c.id)).toEqual(['tracks', 'video']);
    expect(m.channels.every((c) => c.room && c.stream)).toBe(true);
    expect(m.room.limiter).toBe(true);
  });

  it('is made from the older stream sound settings', () => {
    const s = defaultSettings();
    expect(mixerFromSettings(s)).toEqual(defaultMixer());
    s.stream.sound = { room: true, roomGain: 0.5, mics: [{ deviceId: 'mic-a', gain: 2 }] };
    const m = mixerFromSettings(s);
    expect(m.stream.gainDb).toBeCloseTo(-6.02, 2);
    const mic = m.channels[2];
    expect(mic).toMatchObject({ kind: 'input', deviceId: 'mic-a', room: false, stream: true });
    expect(mic?.gainDb).toBeCloseTo(6.02, 2);
    // A saved mixer wins.
    expect(mixerFromSettings({ ...s, mixer: defaultMixer() })).toEqual(defaultMixer());
  });

  it('adds, edits, moves, solos and removes inputs', () => {
    let m = defaultMixer();
    m = applyMixerAction(m, { action: 'add', deviceId: 'dev1', name: 'Pulpit' });
    m = applyMixerAction(m, { action: 'add', deviceId: 'dev1', name: 'Pulpit again' });
    const [a, b] = m.channels.slice(2);
    expect(a?.id).not.toBe(b?.id);
    expect(a).toMatchObject({ name: 'Pulpit', room: false, stream: true });
    m = applyMixerAction(m, {
      action: 'channel',
      id: a?.id ?? '',
      patch: { gainDb: -6, eq: { low: 3 }, comp: { on: true } },
    });
    const edited = m.channels[2];
    expect(edited?.eq).toEqual({ low: 3, mid: 0, high: 0 });
    expect(edited?.comp.on).toBe(true);
    expect(edited?.comp.ratio).toBe(3);
    m = applyMixerAction(m, { action: 'move', id: a?.id ?? '', to: 0 });
    expect(m.channels[0]?.id).toBe(a?.id);
    m = applyMixerAction(m, { action: 'channel', id: 'tracks', patch: { solo: true } });
    m = applyMixerAction(m, { action: 'soloClear' });
    expect(m.channels.some((c) => c.solo)).toBe(false);
    // Tracks and video are always there.
    m = applyMixerAction(m, { action: 'remove', id: 'tracks' });
    expect(m.channels.some((c) => c.id === 'tracks')).toBe(true);
    m = applyMixerAction(m, { action: 'remove', id: a?.id ?? '' });
    expect(m.channels).toHaveLength(3);
  });

  it('a partial EQ or compressor change leaves the other settings alone', () => {
    const a = MixerActionSchema.parse({ action: 'channel', id: 'a', patch: { eq: { low: 3 } } });
    expect(a).toEqual({ action: 'channel', id: 'a', patch: { eq: { low: 3 } } });
    let m = applyMixerAction(defaultMixer(), {
      action: 'channel',
      id: 'tracks',
      patch: { eq: { mid: -4 } },
    });
    m = applyMixerAction(
      m,
      MixerActionSchema.parse({ action: 'channel', id: 'tracks', patch: { eq: { low: 3 } } }),
    );
    expect(m.channels[0]?.eq).toEqual({ low: 3, mid: -4, high: 0 });
  });

  it('resets levels and processing but keeps inputs and routing', () => {
    let m = applyMixerAction(defaultMixer(), { action: 'add', deviceId: 'd', name: 'Mic' });
    const id = m.channels[2]?.id ?? '';
    m = applyMixerAction(m, {
      action: 'channel',
      id,
      patch: { gainDb: 6, stream: true, hpf: true },
    });
    m = applyMixerAction(m, { action: 'bus', bus: 'stream', patch: { delayMs: 120 } });
    m = applyMixerAction(m, { action: 'reset' });
    expect(m.channels[2]).toMatchObject({ gainDb: 0, hpf: false, stream: true, deviceId: 'd' });
    expect(m.stream.delayMs).toBe(0);
  });

  it('sends by routing, mute and solo', () => {
    const c = { ...defaultMixer().channels[0]!, gainDb: -6, stream: false };
    expect(sendGain(c, 'room')).toBeCloseTo(0.501, 3);
    expect(sendGain(c, 'stream')).toBe(0);
    expect(sendGain({ ...c, mute: true }, 'room')).toBe(0);
    expect(sendGain(c, 'cue')).toBe(0);
    expect(sendGain({ ...c, solo: true, mute: true }, 'cue')).toBeCloseTo(0.501, 3);
  });
});

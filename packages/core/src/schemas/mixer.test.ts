import { describe, expect, it } from 'vitest';
import {
  applyMixerAction,
  dbToGain,
  defaultMixer,
  dynamicsResetPatch,
  eqResetPatch,
  MixerActionSchema,
  MixerChannelSchema,
  MixerSchema,
  PRESETS,
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
      patch: { gainDb: -6, eq: { bands: { '0': { db: 3 } } }, comp: { on: true } },
    });
    const edited = m.channels[2];
    expect(edited?.eq.on).toBe(true);
    expect(edited?.eq.bands[0]).toEqual({ type: 'lowShelf', on: true, hz: 100, db: 3, q: 0.7 });
    expect(edited?.eq.bands[2]).toMatchObject({ db: 0, hz: 800 });
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
    const patch = { eq: { bands: { '0': { db: 3 } } } };
    const a = MixerActionSchema.parse({ action: 'channel', id: 'a', patch });
    expect(a).toEqual({ action: 'channel', id: 'a', patch });
    let m = applyMixerAction(defaultMixer(), {
      action: 'channel',
      id: 'tracks',
      patch: { eq: { bands: { '2': { db: -4, q: 2 } } } },
    });
    m = applyMixerAction(m, MixerActionSchema.parse({ action: 'channel', id: 'tracks', patch }));
    m = applyMixerAction(m, {
      action: 'channel',
      id: 'tracks',
      patch: { eq: { bands: { '2': { hz: 1200 } } } },
    });
    const eq = m.channels[0]?.eq;
    expect(eq?.bands.map((b) => b.db)).toEqual([3, 0, -4, 0, 0, 0]);
    expect(eq?.bands[2]).toMatchObject({ hz: 1200, q: 2, type: 'bell' });
    expect(eq?.bands[0]?.hz).toBe(100);
  });

  it('refuses EQ settings out of range, and a band number that does not exist', () => {
    const bad = (eq: unknown) =>
      MixerActionSchema.safeParse({ action: 'channel', id: 'a', patch: { eq } }).success;
    expect(bad({ bands: { '0': { db: 24 } } })).toBe(false);
    expect(bad({ bands: { '6': { db: 1 } } })).toBe(false);
    expect(bad({ bands: { '1': { hz: 5 } } })).toBe(false);
    expect(bad({ bands: { '1': { type: 'comb' } } })).toBe(false);
    expect(bad({ bands: { '1': { type: 'notch', q: 8 } } })).toBe(true);
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

  describe('pro controls', () => {
    const withMic = () =>
      applyMixerAction(defaultMixer(), { action: 'add', deviceId: 'dev1', name: 'Pulpit' });
    const micId = (m: ReturnType<typeof defaultMixer>) => m.channels[2]?.id ?? '';

    it('a mixer saved before them loads unchanged, with everything new off or neutral', () => {
      const old = {
        channels: [
          {
            id: 'in-a',
            kind: 'input',
            deviceId: 'a',
            name: 'Pulpit',
            gainDb: -3,
            hpf: true,
            eq: { low: 2, mid: 0, high: 1 },
            comp: { on: true, thresholdDb: -20, ratio: 4, makeupDb: 3 },
          },
        ],
        room: { gainDb: 0 },
        stream: { delayMs: 120 },
      };
      const m = MixerSchema.parse(old);
      const c = m.channels[0];
      expect(c).toMatchObject({
        trimDb: 0,
        invert: false,
        delayMs: 0,
        denoise: false,
        gate: { on: false },
        hpfHz: 80,
        duck: { on: false },
        ducksOthers: true,
        locked: false,
      });
      // The old fixed EQ's bands, moved into the bands that do the same, so it sounds the same.
      expect(c?.eq.on).toBe(true);
      expect(c?.eq.bands).toHaveLength(6);
      expect(c?.eq.bands[0]).toEqual({ type: 'lowShelf', on: true, hz: 120, db: 2, q: 0.7 });
      expect(c?.eq.bands[2]).toEqual({ type: 'bell', on: true, hz: 1000, db: 0, q: 0.9 });
      expect(c?.eq.bands[5]).toEqual({ type: 'highShelf', on: true, hz: 8000, db: 1, q: 0.7 });
      expect([1, 3, 4].map((i) => c?.eq.bands[i]?.db)).toEqual([0, 0, 0]);
      expect(c).toMatchObject({ hpfSlope: 12, lpf: false });
      expect(c?.comp).toMatchObject({ thresholdDb: -20, ratio: 4, attackMs: 5, releaseMs: 150 });
      expect(m.stream).toMatchObject({ delayMs: 120, limiter: true, ceilingDb: -1.5 });
    });

    it('changes one setting of a section and keeps the rest', () => {
      let m = withMic();
      const id = micId(m);
      m = applyMixerAction(m, { action: 'channel', id, patch: { gate: { on: true } } });
      m = applyMixerAction(m, { action: 'channel', id, patch: { duck: { amountDb: 20 } } });
      m = applyMixerAction(m, {
        action: 'channel',
        id,
        patch: { eq: { bands: { '2': { hz: 3000 } } } },
      });
      m = applyMixerAction(m, { action: 'channel', id, patch: { comp: { attackMs: 20 } } });
      const c = m.channels[2];
      expect(c?.gate).toEqual({ on: true, thresholdDb: -50 });
      expect(c?.duck).toEqual({ on: false, amountDb: 20, thresholdDb: -40 });
      expect(c?.eq.bands[2]?.hz).toBe(3000);
      expect(c?.eq.bands[0]?.hz).toBe(100);
      expect(c?.comp).toMatchObject({ attackMs: 20, releaseMs: 150, thresholdDb: -18 });
      m = applyMixerAction(m, { action: 'bus', bus: 'stream', patch: { ceilingDb: -3 } });
      expect(m.stream).toMatchObject({ ceilingDb: -3, limiter: true });
    });

    it('a locked channel ignores every change until it’s unlocked', () => {
      let m = withMic();
      const id = micId(m);
      m = applyMixerAction(m, { action: 'channel', id, patch: { locked: true } });
      const locked = m.channels[2];
      m = applyMixerAction(m, { action: 'channel', id, patch: { gainDb: -20, mute: true } });
      m = applyMixerAction(m, { action: 'preset', id, preset: 'speech' });
      expect(m.channels[2]).toEqual(locked);
      m = applyMixerAction(m, { action: 'channel', id, patch: { locked: false, gainDb: -6 } });
      expect(m.channels[2]).toMatchObject({ locked: false, gainDb: -6 });
    });

    it('a preset sets the processing and leaves level, routing and device alone', () => {
      let m = withMic();
      const id = micId(m);
      m = applyMixerAction(m, {
        action: 'channel',
        id,
        patch: { gainDb: -4, pan: 0.5, trimDb: 6, stream: false },
      });
      m = applyMixerAction(m, { action: 'preset', id, preset: 'speech' });
      const c = m.channels[2];
      expect(c).toMatchObject({ gainDb: -4, pan: 0.5, trimDb: 6, stream: false, deviceId: 'dev1' });
      expect(c?.comp).toEqual(PRESETS.speech.comp);
      expect(c?.gate.on).toBe(true);
      expect(c?.hpf).toBe(true);
      m = applyMixerAction(m, { action: 'preset', id, preset: 'flat' });
      expect(m.channels[2]?.comp.on).toBe(false);
      expect(m.channels[2]?.eq).toEqual(
        MixerChannelSchema.parse({ id: 'x', kind: 'input', name: 'x' }).eq,
      );
      // Music ducks under voices.
      m = applyMixerAction(m, { action: 'preset', id: 'tracks', preset: 'music' });
      expect(m.channels[0]?.duck.on).toBe(true);
      // Presets are commands like any other.
      expect(MixerActionSchema.safeParse({ action: 'preset', id, preset: 'loud' }).success).toBe(
        false,
      );
    });

    it('reset flattens every new setting too, and unlocks', () => {
      let m = withMic();
      const id = micId(m);
      m = applyMixerAction(m, { action: 'preset', id, preset: 'speech' });
      m = applyMixerAction(m, {
        action: 'channel',
        id,
        patch: { trimDb: 5, invert: true, delayMs: 80, denoise: true, locked: true },
      });
      m = applyMixerAction(m, { action: 'reset' });
      expect(m.channels[2]).toMatchObject({
        trimDb: 0,
        invert: false,
        delayMs: 0,
        denoise: false,
        locked: false,
        gate: { on: false },
        comp: { on: false },
        duck: { on: false },
        hpf: false,
      });
    });
  });
});

describe('resetting a channel', () => {
  it('puts the EQ and the cuts back to flat, keeps the EQ switch, and leaves the rest', () => {
    let m = applyMixerAction(defaultMixer(), { action: 'add', deviceId: 'dev1', name: 'Pulpit' });
    const id = m.channels.at(-1)?.id ?? '';
    m = applyMixerAction(m, { action: 'preset', id, preset: 'speech' });
    m = applyMixerAction(m, {
      action: 'channel',
      id,
      patch: { eq: { on: false, bands: { '2': { db: 6, hz: 400 } } }, lpf: true, gainDb: -6 },
    });
    m = applyMixerAction(m, { action: 'channel', id, patch: eqResetPatch() });
    const c = m.channels.find((x) => x.id === id);
    expect(c?.eq.on).toBe(false);
    expect(c?.eq.bands.every((b) => b.db === 0)).toBe(true);
    expect(c?.eq.bands[2]?.hz).toBe(800);
    expect([c?.hpf, c?.lpf, c?.hpfHz]).toEqual([false, false, 80]);
    expect(c?.gainDb).toBe(-6);
    expect(c?.comp.on).toBe(true); // dynamics untouched
    m = applyMixerAction(m, { action: 'channel', id, patch: dynamicsResetPatch() });
    const d = m.channels.find((x) => x.id === id);
    expect([d?.gate.on, d?.comp.on, d?.duck.on]).toEqual([false, false, false]);
  });
});

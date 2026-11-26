import { describe, expect, it } from 'vitest';
import { eqDefaults, MixerChannelSchema, type MixerChannel } from '@lampstand/core';
import { HPF_OFF_HZ, LPF_OFF_HZ } from './eqFilters';
import { autoMakeupDb, GATE_OFF, stripSettings, triggersDucking } from './stripSettings';

const ch = (o: Partial<MixerChannel> = {}): MixerChannel =>
  MixerChannelSchema.parse({ id: 'm', kind: 'input', name: 'Mic', ...o });

describe('a channel strip’s settings', () => {
  it('everything off leaves the sound as it is', () => {
    const p = stripSettings(ch(), 'stream');
    expect(p.trim).toBe(1);
    expect(p.delaySec).toBe(0);
    expect(p.gateDb).toBe(GATE_OFF);
    expect(p.hpf.every((s) => s.type === 'highpass' && s.hz === HPF_OFF_HZ)).toBe(true);
    expect(p.lpf.every((s) => s.type === 'lowpass' && s.hz === LPF_OFF_HZ)).toBe(true);
    expect(p.bands.map((b) => b.db)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(p.comp.ratio).toBe(1);
    expect(p.makeup).toBe(1);
    expect(p.send).toBe(1);
  });

  it('trim, polarity, delay and the gate', () => {
    const p = stripSettings(
      ch({ trimDb: 6, invert: true, delayMs: 120, gate: { on: true, thresholdDb: -45 } }),
      'room',
    );
    expect(p.trim).toBeCloseTo(-1.995, 3);
    expect(p.delaySec).toBe(0.12);
    expect(p.gateDb).toBe(-45);
  });

  it('the EQ’s bands where they’re set; bypassed, they’re flat', () => {
    const eq = eqDefaults();
    eq.bands[0] = { type: 'lowShelf', on: true, hz: 200, db: 3, q: 0.7 };
    eq.bands[2] = { type: 'bell', on: true, hz: 2500, db: -4, q: 2 };
    eq.bands[3] = { type: 'notch', on: true, hz: 60, db: 0, q: 8 };
    eq.bands[4] = { type: 'bell', on: false, hz: 5000, db: 6, q: 1 };
    const p = stripSettings(ch({ eq, hpf: true, hpfHz: 120, hpfSlope: 24 }), 'room');
    expect(p.hpf.map((s) => s.hz)).toEqual([120, 120, HPF_OFF_HZ, HPF_OFF_HZ]);
    expect(p.bands[0]).toEqual({ type: 'lowshelf', hz: 200, q: 0.7, db: 3 });
    expect(p.bands[2]).toEqual({ type: 'peaking', hz: 2500, q: 2, db: -4 });
    expect(p.bands[3]).toMatchObject({ type: 'notch', hz: 60 });
    // A band switched off is flat.
    expect(p.bands[4]?.db).toBe(0);
    const off = stripSettings(ch({ eq: { ...eq, on: false }, hpf: true, hpfHz: 120 }), 'room');
    expect(off.bands.map((b) => b.db)).toEqual([0, 0, 0, 0, 0, 0]);
    // A notch has no flat setting: bypassed, it becomes a flat bell.
    expect(off.bands[3]).toMatchObject({ type: 'peaking', db: 0 });
    // The cuts aren't part of the bypass (they protect the sound system).
    expect(off.hpf[0]?.hz).toBe(120);
  });

  it('the compressor’s make-up means what it says (the node’s own gain taken out)', () => {
    const comp = {
      on: true,
      thresholdDb: -18,
      ratio: 3,
      makeupDb: 4,
      attackMs: 10,
      releaseMs: 2500,
    };
    const p = stripSettings(ch({ comp: { ...comp, releaseMs: 1000 } }), 'room');
    expect(p.comp).toMatchObject({ thresholdDb: -18, ratio: 3, attackSec: 0.01, releaseSec: 1 });
    expect(20 * Math.log10(p.makeup)).toBeCloseTo(4 - autoMakeupDb(-18, 3), 5);
  });

  it('sends follow mute, routing and solo', () => {
    expect(stripSettings(ch({ mute: true }), 'stream').send).toBe(0);
    expect(stripSettings(ch({ stream: false }), 'stream').send).toBe(0);
    expect(stripSettings(ch(), 'cue').send).toBe(0);
    expect(stripSettings(ch({ solo: true }), 'cue').send).toBe(1);
  });

  it('only live inputs that duck others make channels dip', () => {
    expect(triggersDucking(ch())).toBe(true);
    expect(triggersDucking(ch({ mute: true }))).toBe(false);
    expect(triggersDucking(ch({ ducksOthers: false }))).toBe(false);
    expect(triggersDucking(ch({ kind: 'tracks' }))).toBe(false);
  });
});

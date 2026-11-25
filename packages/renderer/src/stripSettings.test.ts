import { describe, expect, it } from 'vitest';
import { MixerChannelSchema, type MixerChannel } from '@lampstand/core';
import { autoMakeupDb, GATE_OFF, stripSettings, triggersDucking } from './stripSettings';

const ch = (o: Partial<MixerChannel> = {}): MixerChannel =>
  MixerChannelSchema.parse({ id: 'm', kind: 'input', name: 'Mic', ...o });

describe('a channel strip’s settings', () => {
  it('everything off leaves the sound as it is', () => {
    const p = stripSettings(ch(), 'stream');
    expect(p.trim).toBe(1);
    expect(p.delaySec).toBe(0);
    expect(p.gateDb).toBe(GATE_OFF);
    expect(p.hpfHz).toBeLessThan(20);
    expect([p.low.db, p.mid.db, p.high.db]).toEqual([0, 0, 0]);
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
    const eq = {
      on: true,
      low: 3,
      mid: -4,
      high: 2,
      lowHz: 200,
      midHz: 2500,
      midQ: 2,
      highHz: 9000,
    };
    const p = stripSettings(ch({ eq, hpf: true, hpfHz: 120 }), 'room');
    expect(p.hpfHz).toBe(120);
    expect(p.low).toEqual({ hz: 200, db: 3 });
    expect(p.mid).toEqual({ hz: 2500, q: 2, db: -4 });
    expect(p.high).toEqual({ hz: 9000, db: 2 });
    const off = stripSettings(ch({ eq: { ...eq, on: false } }), 'room');
    expect([off.low.db, off.mid.db, off.high.db]).toEqual([0, 0, 0]);
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

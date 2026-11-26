import { describe, expect, it } from 'vitest';
import { applyMixerAction, defaultMixer, MixerChannelSchema } from './schemas/mixer';
import type { Processing } from './schemas/processing';
import {
  channelProcessing,
  fitProcessing,
  LAMPSTAND_CAPS,
  presetFileText,
  presetForChannel,
  readPresetFile,
  type ProcessingCaps,
} from './processing';

const ch = (o = {}) => MixerChannelSchema.parse({ id: 'm', kind: 'input', name: 'Mic', ...o });

/** A small desk: four bands that can also be cuts, a low cut, stepped ratios, no high cut. */
const DESK: ProcessingCaps = {
  bands: 4,
  bandKinds: ['bell', 'lowShelf', 'highShelf', 'lowCut', 'highCut'],
  hz: { min: 20, max: 20_000 },
  db: { min: -15, max: 15 },
  q: { min: 0.3, max: 10 },
  lowCut: { hz: { min: 20, max: 400 }, slopes: [12] },
  highCut: null,
  gate: { thresholdDb: { min: -80, max: 0 } },
  comp: {
    thresholdDb: { min: -60, max: 0 },
    ratio: [1.1, 1.3, 1.5, 2, 2.5, 3, 4, 5, 7, 10, 20, 100],
    attackMs: { min: 0, max: 120 },
    releaseMs: { min: 5, max: 4000 },
    makeupDb: { min: 0, max: 24 },
  },
};

describe('processing that belongs to no device', () => {
  it('a Lampstand channel goes out and comes back the same', () => {
    let m = applyMixerAction(defaultMixer(), { action: 'add', deviceId: 'd', name: 'Mic' });
    const id = m.channels[2]?.id ?? '';
    m = applyMixerAction(m, {
      action: 'channel',
      id,
      patch: {
        hpf: true,
        hpfHz: 110,
        hpfSlope: 24,
        eq: { bands: { '1': { db: -3, q: 2 }, '3': { type: 'notch', q: 8 } } },
        comp: { on: true, ratio: 4 },
        gate: { on: true, thresholdDb: -45 },
      },
    });
    const c = m.channels[2];
    if (!c) throw new Error('no channel');
    const { patch, notes } = presetForChannel(channelProcessing(c));
    expect(notes).toEqual([]);
    const back = applyMixerAction(applyMixerAction(m, { action: 'reset' }), {
      action: 'channel',
      id,
      patch,
    }).channels[2];
    expect(back?.eq).toEqual(c.eq);
    expect(back).toMatchObject({ hpf: true, hpfHz: 110, hpfSlope: 24, lpf: false });
    expect(back?.comp).toEqual(c.comp);
    expect(back?.gate).toEqual(c.gate);
  });

  it('EQ-only presets leave the gate and compressor alone', () => {
    const p = channelProcessing(ch({ comp: { on: true } }), 'eq');
    expect(p.gate).toBeUndefined();
    expect(presetForChannel(p).patch.comp).toBeUndefined();
  });

  it('fitting to a smaller desk keeps the bands that matter and says what it dropped', () => {
    const p: Processing = {
      eqOn: true,
      filters: [
        { kind: 'bell', on: true, hz: 200, db: -2, q: 1 },
        { kind: 'bell', on: true, hz: 400, db: 0, q: 1 },
        { kind: 'notch', on: true, hz: 60, db: 0, q: 8 },
        { kind: 'bell', on: true, hz: 3000, db: 4, q: 1 },
        { kind: 'highShelf', on: true, hz: 10_000, db: 3, q: 0.7 },
        { kind: 'bell', on: true, hz: 800, db: -1, q: 1 },
        { kind: 'highCut', on: true, hz: 15_000, db: 0, q: 0.7, slope: 24 },
      ],
    };
    const { processing, notes } = fitProcessing(p, DESK);
    const bands = processing.filters.filter((f) => f.kind !== 'lowCut');
    // The high cut takes one of the four bands; the notch, +4 and +3 stay; 200 Hz and 800 Hz go.
    expect(bands.map((f) => f.kind).sort()).toEqual(['bell', 'bell', 'highCut', 'highShelf']);
    expect(notes).toContainEqual({ code: 'cutAsBand', which: 'highCut' });
    expect(notes).toContainEqual({ code: 'kindChanged', hz: 60, from: 'notch', to: 'bell' });
    expect(notes).toContainEqual({ code: 'bandDropped', hz: 200, db: -2 });
    expect(notes).toContainEqual({ code: 'bandDropped', hz: 800, db: -1 });
    // A notch it can't do becomes the deepest, narrowest bell it can.
    expect(bands.find((f) => f.hz === 60)).toMatchObject({ kind: 'bell', db: -15, q: 10 });
  });

  it('values are kept in range, ratios go to the nearest step, and missing parts are named', () => {
    const p: Processing = {
      eqOn: true,
      filters: [
        { kind: 'bell', on: true, hz: 1000, db: 18, q: 0.1 },
        { kind: 'lowCut', on: true, hz: 80, db: 0, q: 0.7, slope: 48 },
      ],
      comp: { on: true, thresholdDb: -20, ratio: 3.4, attackMs: 5, releaseMs: 150, makeupDb: 4 },
      gate: { on: true, thresholdDb: -50 },
    };
    const { processing, notes } = fitProcessing(p, { ...DESK, gate: null });
    expect(processing.filters.find((f) => f.kind === 'bell')).toMatchObject({ db: 15, q: 0.3 });
    expect(processing.filters.find((f) => f.kind === 'lowCut')?.slope).toBe(12);
    expect(processing.comp?.ratio).toBe(3);
    expect(processing.gate).toBeUndefined();
    expect(notes).toEqual(
      expect.arrayContaining([
        { code: 'slopeChanged', which: 'lowCut', from: 48, to: 12 },
        { code: 'clamped', what: 'db', hz: 1000 },
        { code: 'clamped', what: 'q', hz: 1000 },
        { code: 'compChanged', what: 'ratio' },
        { code: 'gateDropped' },
      ]),
    );
  });

  it('flat bands never count as lost', () => {
    const { notes } = fitProcessing(channelProcessing(ch(), 'eq'), { ...DESK, bands: 2 });
    expect(notes).toEqual([]);
  });

  it('Lampstand can take any of its own presets exactly', () => {
    const { notes } = fitProcessing(channelProcessing(ch({ lpf: true })), LAMPSTAND_CAPS);
    expect(notes).toEqual([]);
  });

  it('preset files go out and come back, and anything else is refused', () => {
    const preset = {
      id: 'p1',
      name: 'Pastor',
      scope: 'eq' as const,
      processing: channelProcessing(ch(), 'eq'),
    };
    expect(readPresetFile(presetFileText([preset]))).toEqual([preset]);
    expect(readPresetFile('{"format":"other","presets":[]}')).toBeNull();
    expect(readPresetFile('not json')).toBeNull();
  });
});

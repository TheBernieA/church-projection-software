import { describe, expect, it } from 'vitest';
import { eqDefaults, MixerChannelSchema } from '@lampstand/core';
import {
  dbToY,
  formatGain,
  formatHz,
  hzToX,
  nodeActive,
  nodePoint,
  noteOf,
  responseDb,
  roundHz,
  xToHz,
  yToDb,
} from './eqGeometry';

const ch = (o = {}) => MixerChannelSchema.parse({ id: 'm', kind: 'input', name: 'Mic', ...o });

describe('the EQ graph’s geometry', () => {
  it('maps frequencies on a log scale and gains on a line, both ways', () => {
    expect(hzToX(20)).toBe(0);
    expect(hzToX(20_000)).toBeCloseTo(1);
    // 200 Hz and 2 kHz are a third and two-thirds of the way.
    expect(hzToX(200)).toBeCloseTo(1 / 3);
    expect(xToHz(hzToX(1234))).toBeCloseTo(1234);
    expect(dbToY(0)).toBe(0.5);
    expect(dbToY(18)).toBe(0);
    expect(yToDb(dbToY(-7.5))).toBeCloseTo(-7.5);
  });

  it('reads frequencies, gains and notes the way people say them', () => {
    expect(formatHz(80)).toBe('80 Hz');
    expect(formatHz(1250)).toBe('1.25 kHz');
    expect(formatHz(2500)).toBe('2.5 kHz');
    expect(formatHz(12_000)).toBe('12 kHz');
    expect(formatGain(3.5)).toBe('+3.5 dB');
    expect(formatGain(-6)).toBe('−6 dB');
    expect(formatGain(0)).toBe('0 dB');
    expect(roundHz(1234)).toBe(1250);
    expect(roundHz(87.4)).toBe(87);
    expect(noteOf(440)).toBe('A4');
    expect(noteOf(261.6)).toBe('C4');
  });

  it('the curve is the strip’s own response', () => {
    const eq = eqDefaults();
    eq.bands[2] = { type: 'bell', on: true, hz: 1000, db: 6, q: 1 };
    expect(responseDb(ch({ eq }), 1000)).toBeCloseTo(6, 1);
    expect(responseDb(ch({ eq: { ...eq, on: false } }), 1000)).toBeCloseTo(0, 3);
    expect(responseDb(ch({ hpf: true, hpfHz: 100, hpfSlope: 48 }), 50)).toBeLessThan(-40);
  });

  it('nodes sit on their band, cuts and notches on the 0 dB line', () => {
    const eq = eqDefaults();
    eq.bands[1] = { type: 'notch', on: true, hz: 60, db: 5, q: 8 };
    eq.bands[3] = { ...eq.bands[3]!, db: -4 };
    const c = ch({ eq, hpfHz: 90 });
    expect(nodePoint(c, 'hpf')).toEqual({ hz: 90, db: 0 });
    expect(nodePoint(c, 1)).toEqual({ hz: 60, db: 0 });
    expect(nodePoint(c, 3)).toEqual({ hz: 2500, db: -4 });
    expect(nodeActive(c, 'hpf')).toBe(false);
    expect(nodeActive(c, 1)).toBe(true);
    expect(nodeActive(c, 3)).toBe(true);
    expect(nodeActive(c, 0)).toBe(false);
  });
});

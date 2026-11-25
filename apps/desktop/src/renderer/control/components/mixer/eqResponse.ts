import type { MixerChannel } from '@lampstand/core';

/**
 * The EQ's response in dB at `f` Hz, for the editor's curve: shelves as first-order slopes, the
 * mid bell as a Gaussian on a log scale whose width follows Q (about 1.4 octaves at Q 1), the
 * low cut as 12 dB per octave. A picture close enough to read, not the filters' exact maths.
 */
export function eqResponseDb(c: Pick<MixerChannel, 'eq' | 'hpf' | 'hpfHz'>, f: number): number {
  let db = 0;
  if (c.eq.on) {
    db += c.eq.low / (1 + Math.pow(f / c.eq.lowHz, 2));
    db += c.eq.high / (1 + Math.pow(c.eq.highHz / f, 2));
    const octaves = Math.log2(f / c.eq.midHz);
    const width = 1.4 / c.eq.midQ;
    db += c.eq.mid * Math.exp(-Math.pow(octaves / (width / 1.2), 2));
  }
  if (c.hpf) db -= 12 * Math.max(0, Math.log2(c.hpfHz / f));
  return db;
}

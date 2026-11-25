import { describe, expect, it } from 'vitest';
import { MixerChannelSchema } from '@lampstand/core';
import { eqResponseDb } from './eqResponse';

const ch = (o: object) => MixerChannelSchema.parse({ id: 'm', kind: 'input', name: 'Mic', ...o });

describe('the EQ curve', () => {
  it('flat is flat; a mid boost peaks at its frequency', () => {
    expect(eqResponseDb(ch({}), 1000)).toBe(0);
    const c = ch({ eq: { mid: 6, midHz: 2500, midQ: 1 } });
    expect(eqResponseDb(c, 2500)).toBeCloseTo(6, 5);
    expect(eqResponseDb(c, 250)).toBeLessThan(0.5);
  });

  it('a narrower Q falls away sooner; bypass is flat; the low cut slopes below its frequency', () => {
    const wide = ch({ eq: { mid: 6, midQ: 0.5 } });
    const narrow = ch({ eq: { mid: 6, midQ: 4 } });
    expect(eqResponseDb(narrow, 1500)).toBeLessThan(eqResponseDb(wide, 1500));
    expect(eqResponseDb(ch({ eq: { on: false, mid: 6 } }), 1000)).toBe(0);
    const cut = ch({ hpf: true, hpfHz: 100 });
    expect(eqResponseDb(cut, 50)).toBeCloseTo(-12, 5);
    expect(eqResponseDb(cut, 200)).toBe(0);
  });
});

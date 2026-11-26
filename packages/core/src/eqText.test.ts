import { describe, expect, it } from 'vitest';
import { parseEqText } from './eqText';

describe('importing an Equalizer APO / REW text EQ', () => {
  it('reads each kind of filter, its frequency, gain and width', () => {
    const r = parseEqText(
      [
        '# Room correction',
        'Preamp: -6.5 dB',
        'Filter 1: ON PK Fc 105 Hz Gain -3.5 dB Q 1.41',
        'Filter  2: ON  LSC      Fc   63.0 Hz  Gain   5.0 dB  Q 0.71',
        'Filter 3: OFF HSC Fc 10000 Hz Gain -2 dB',
        'Filter 4: ON HP Fc 80 Hz',
        'Filter 5: ON NO Fc 60 Hz',
        'Filter 6: ON PK Fc 1000 Hz Gain 2 dB BW Oct 1.0',
        'Filter: ON LP Fc 16000 Hz',
      ].join('\n'),
    );
    expect(r?.preampDb).toBe(-6.5);
    expect(r?.skipped).toEqual([]);
    const f = r?.processing.filters ?? [];
    expect(f.map((x) => x.kind)).toEqual([
      'bell',
      'lowShelf',
      'highShelf',
      'lowCut',
      'notch',
      'bell',
      'highCut',
    ]);
    expect(f[0]).toMatchObject({ hz: 105, db: -3.5, q: 1.41, on: true });
    expect(f[1]).toMatchObject({ hz: 63, db: 5 });
    expect(f[2]?.on).toBe(false);
    expect(f[3]).toMatchObject({ hz: 80, slope: 12, db: 0 });
    // One octave wide is Q ≈ 1.41.
    expect(f[5]?.q).toBeCloseTo(1.414, 2);
  });

  it('reports lines it can’t use, and refuses text with no filters at all', () => {
    const r = parseEqText(
      'Filter 1: ON AP Fc 100 Hz\nFilter 2: ON PK Gain 3 dB\nFilter 3: ON PK Fc 200 Hz',
    );
    expect(r?.skipped.map((s) => s.reason)).toEqual(['unknownType', 'unreadable']);
    expect(r?.processing.filters).toHaveLength(1);
    expect(parseEqText('hello\nworld')).toBeNull();
  });
});

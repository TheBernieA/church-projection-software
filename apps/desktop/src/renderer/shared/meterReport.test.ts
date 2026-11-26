import { describe, expect, it } from 'vitest';
import { MeterReportSchema } from '@lampstand/ipc-contract';
import { meterReport } from './meterReport';

describe('the meter report', () => {
  it('carries dynamics and loudness in a form the checks accept (silence as null)', () => {
    const r = meterReport('stream', {
      channels: { m: [0.5, 0.2] },
      bus: [0.5, 0.2],
      sides: [
        [0.5, 0.2],
        [0.4, 0.1],
      ],
      dyn: { m: [-4.2, -Infinity] },
      loudness: { momentary: -13.94, shortTerm: -Infinity, integrated: -15.26 },
      spectrum: { id: 'm', pre: [-40, -110], post: [-38, -110] },
    });
    expect(r.spectrum).toEqual({ id: 'm', pre: [-40, -110], post: [-38, -110] });
    expect(r.dyn).toEqual({ m: [-4.2, -100] });
    expect(r.loudness).toEqual({ momentary: -13.9, shortTerm: null, integrated: -15.3 });
    expect(MeterReportSchema.safeParse(r).success).toBe(true);
  });

  it('no loudness yet is null', () => {
    const r = meterReport('room', {
      channels: {},
      bus: [0, 0],
      sides: [
        [0, 0],
        [0, 0],
      ],
      dyn: {},
      loudness: null,
      spectrum: null,
    });
    expect(r.loudness).toBeNull();
    expect(MeterReportSchema.safeParse(r).success).toBe(true);
  });
});

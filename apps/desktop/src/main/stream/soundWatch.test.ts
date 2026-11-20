import { describe, expect, it } from 'vitest';
import { SILENT_MS, SoundWatch } from './soundWatch';

describe('stream sound watch', () => {
  it('says silent only after a while with nothing above room tone', () => {
    const w = new SoundWatch();
    w.start(0);
    expect(w.silent(SILENT_MS - 1)).toBe(false);
    w.hear(0.001, 1000); // below room tone: not sound
    expect(w.silent(SILENT_MS + 1)).toBe(true);
    w.hear(0.2, SILENT_MS + 2);
    expect(w.silent(SILENT_MS + 3)).toBe(false);
  });

  it('reports the loudest peak since last asked, in dBFS', () => {
    const w = new SoundWatch();
    w.start(0);
    w.hear(0.1, 1);
    w.hear(0.5, 2);
    expect(w.takePeakDb()).toBe(-6);
    expect(w.takePeakDb()).toBe(-Infinity);
  });
});

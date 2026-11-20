import { describe, expect, it } from 'vitest';
import { benchmarkArgs, pickBenchmarkMode } from './benchmark';

describe('Check this computer', () => {
  it('recommends the best mode it managed with room to spare', () => {
    expect(
      pickBenchmarkMode([
        { mode: 'quality', speed: 3 },
        { mode: 'balanced', speed: 5 },
      ]),
    ).toBe('quality');
    expect(
      pickBenchmarkMode([
        { mode: 'quality', speed: 1.4 },
        { mode: 'balanced', speed: 2 },
      ]),
    ).toBe('balanced');
    expect(
      pickBenchmarkMode([
        { mode: 'quality', speed: 0.6 },
        { mode: 'balanced', speed: 1.2 },
      ]),
    ).toBe('light');
    expect(pickBenchmarkMode([])).toBe('light');
  });

  it('encodes a generated picture at the mode size, as the stream would', () => {
    const a = benchmarkArgs('balanced', 'libx264').join(' ');
    expect(a).toContain('testsrc2=size=1280x720:rate=30');
    expect(a).toContain('-preset veryfast');
    expect(a).toContain('format=yuv420p');
    expect(a).toMatch(/-f null -$/);
    expect(benchmarkArgs('quality', 'h264_videotoolbox').join(' ')).toContain('format=nv12');
  });
});

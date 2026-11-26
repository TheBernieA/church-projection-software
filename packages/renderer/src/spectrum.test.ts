import { describe, expect, it } from 'vitest';
import { SPECTRUM_FLOOR_DB, spectrumBands, spectrumHz } from './spectrum';

describe('the EQ window’s spectrum', () => {
  it('bands are spread evenly in octaves from 20 Hz to 20 kHz', () => {
    expect(spectrumHz(0, 10)).toBeGreaterThan(20);
    expect(spectrumHz(9, 10)).toBeLessThan(20_000);
    expect(spectrumHz(5, 10) / spectrumHz(4, 10)).toBeCloseTo(
      spectrumHz(1, 10) / spectrumHz(0, 10),
    );
  });

  it('a tone shows in the band that holds its frequency, and nowhere else', () => {
    const sr = 48_000;
    const fft = new Float32Array(4096).fill(-140);
    const binHz = sr / 2 / fft.length;
    fft[Math.round(1000 / binHz)] = -12.4;
    const bands = spectrumBands(fft, sr, 30);
    const loudest = bands.indexOf(Math.max(...bands));
    expect(bands[loudest]).toBe(-12);
    expect(spectrumHz(loudest, 30)).toBeGreaterThan(800);
    expect(spectrumHz(loudest, 30)).toBeLessThan(1250);
    expect(bands.filter((b) => b > SPECTRUM_FLOOR_DB)).toHaveLength(1);
  });

  it('the low end is never empty, and silence reads as the floor', () => {
    const fft = new Float32Array(4096).fill(-30);
    expect(spectrumBands(fft, 48_000).every((b) => b === -30)).toBe(true);
    const silent = new Float32Array(4096).fill(-Infinity);
    expect(spectrumBands(silent, 48_000).every((b) => b === SPECTRUM_FLOOR_DB)).toBe(true);
  });
});

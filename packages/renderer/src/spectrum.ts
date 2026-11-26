/** The spectrum the EQ window draws: this many bands, evenly spaced in octaves over 20 Hz–20 kHz. */
export const SPECTRUM_BINS = 96;
export const SPECTRUM_LO_HZ = 20;
export const SPECTRUM_HI_HZ = 20_000;
/** Quieter than this is drawn as nothing. */
export const SPECTRUM_FLOOR_DB = -110;

/** The centre frequency of spectrum band `i`. */
export const spectrumHz = (i: number, bins = SPECTRUM_BINS): number =>
  SPECTRUM_LO_HZ * Math.pow(SPECTRUM_HI_HZ / SPECTRUM_LO_HZ, (i + 0.5) / bins);

/**
 * An analyser's FFT (dB per linear bin, `getFloatFrequencyData`) folded into `bins` bands spaced
 * evenly in octaves, as whole dB. Each band takes the loudest FFT bin whose centre it holds; a
 * band narrower than one bin (the low end) reads the bin nearest its centre, so the low end is
 * never empty.
 */
export function spectrumBands(
  fft: Float32Array,
  sampleRate: number,
  bins = SPECTRUM_BINS,
): number[] {
  const binHz = sampleRate / 2 / fft.length;
  const ratio = Math.pow(SPECTRUM_HI_HZ / SPECTRUM_LO_HZ, 1 / bins);
  const out = new Array<number>(bins);
  for (let i = 0; i < bins; i++) {
    const lo = SPECTRUM_LO_HZ * Math.pow(ratio, i);
    const hi = lo * ratio;
    let from = Math.max(1, Math.ceil(lo / binHz));
    let to = Math.min(fft.length - 1, Math.ceil(hi / binHz) - 1);
    if (to < from)
      from = to = Math.min(fft.length - 1, Math.max(1, Math.round(Math.sqrt(lo * hi) / binHz)));
    let max = -Infinity;
    for (let k = from; k <= to; k++) {
      const v = fft[k] ?? -Infinity;
      if (v > max) max = v;
    }
    out[i] = Number.isFinite(max)
      ? Math.max(SPECTRUM_FLOOR_DB, Math.min(0, Math.round(max)))
      : SPECTRUM_FLOOR_DB;
  }
  return out;
}

/**
 * Loudness as streaming platforms measure it (ITU-R BS.1770 / EBU R128): fed the K-weighted
 * mean square of each 100 ms block (both sides added), it gives Momentary (last 400 ms),
 * Short-term (last 3 s) and Integrated (the whole programme, gated so silence and quiet gaps
 * don't drag it down) in LUFS. YouTube and Facebook play streams at about −14 LUFS.
 */

/** −0.691: BS.1770's calibration (a 1 kHz tone at 0 dBFS reads −3.01 LUFS per side). */
const lufs = (meanSquare: number): number =>
  meanSquare > 0 ? -0.691 + 10 * Math.log10(meanSquare) : -Infinity;

const ABSOLUTE_GATE = -70;
const RELATIVE_GATE = 10;
/** The integrated measure's histogram: 0.1 LU bins from −70 to +5 LUFS. */
const BIN_FROM = -70;
const BINS = 750;

export interface Loudness {
  momentary: number;
  shortTerm: number;
  integrated: number;
}

export class LoudnessMeter {
  /** The last 30 blocks (3 s), newest last. */
  private blocks: number[] = [];
  /** Integrated: each 400 ms window's count and energy, by loudness. */
  private counts = new Float64Array(BINS);
  private energy = new Float64Array(BINS);

  /** One 100 ms block's K-weighted mean square (left + right). */
  add(meanSquare: number): void {
    this.blocks.push(meanSquare);
    if (this.blocks.length > 30) this.blocks.shift();
    if (this.blocks.length < 4) return;
    // A 400 ms window every 100 ms (75 % overlap), as BS.1770 gates.
    const window = this.mean(4);
    const l = lufs(window);
    if (l < ABSOLUTE_GATE) return;
    const bin = Math.min(BINS - 1, Math.max(0, Math.floor((l - BIN_FROM) * 10)));
    this.counts[bin] = (this.counts[bin] ?? 0) + 1;
    this.energy[bin] = (this.energy[bin] ?? 0) + window;
  }

  private mean(n: number): number {
    const last = this.blocks.slice(-n);
    return last.length < n ? 0 : last.reduce((a, b) => a + b, 0) / n;
  }

  read(): Loudness {
    return {
      momentary: lufs(this.mean(4)),
      shortTerm: lufs(this.mean(30)),
      integrated: this.integrated(),
    };
  }

  private integrated(): number {
    let n = 0;
    let e = 0;
    for (let i = 0; i < BINS; i++) {
      n += this.counts[i] ?? 0;
      e += this.energy[i] ?? 0;
    }
    if (n === 0) return -Infinity;
    const gate = lufs(e / n) - RELATIVE_GATE;
    const from = Math.max(0, Math.floor((gate - BIN_FROM) * 10));
    n = 0;
    e = 0;
    for (let i = from; i < BINS; i++) {
      n += this.counts[i] ?? 0;
      e += this.energy[i] ?? 0;
    }
    return n === 0 ? -Infinity : lufs(e / n);
  }

  /** Start the integrated measure again (a new service, a new stream). */
  reset(): void {
    this.blocks = [];
    this.counts.fill(0);
    this.energy.fill(0);
  }
}

/** Quieter than this (about −50 dBFS) counts as no sound: room tone on a live mic is louder. */
const HEARD = 0.003;
/** No sound for this long while live: the stream is silent, and the console says so. */
export const SILENT_MS = 8000;

/**
 * Whether the stream has any sound, from the stream mix's meter (about 15 reports a second).
 * A stream that goes out with no sound looks fine from the booth; this is what notices.
 */
export class SoundWatch {
  private lastHeard = 0;
  private peak = 0;

  /** A new session: give it its first few seconds. */
  start(at: number): void {
    this.lastHeard = at;
    this.peak = 0;
  }

  /** The stream mix's peak (linear) just now. */
  hear(peak: number, at: number): void {
    if (peak >= HEARD) this.lastHeard = at;
    if (peak > this.peak) this.peak = peak;
  }

  silent(at: number): boolean {
    return at - this.lastHeard > SILENT_MS;
  }

  /** The loudest peak since last asked, in dBFS (for the health log), and start again. */
  takePeakDb(): number {
    const db = this.peak > 0 ? Math.round(20 * Math.log10(this.peak)) : -Infinity;
    this.peak = 0;
    return db;
  }
}

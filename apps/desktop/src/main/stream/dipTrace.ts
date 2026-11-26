/**
 * The shape of each upload dip, for the log: how fast the stream fell behind, how far, for how
 * long, and how it ended. The health line comes every 10 s, too coarse for a guard that
 * decides within 6 s; this records the delay once a second for the length of each dip and
 * writes one line when it's over. Nothing is kept between dips.
 */

/** A dip starts when the stream is this far behind… */
const START_MS = 1000;
/** …and ends when it's back under this. */
const END_MS = 600;
/** One point a second, at most this many (a longer dip keeps its first 2 minutes' shape). */
const MAX_POINTS = 120;
/** Growth is measured over the dip's first seconds (what the guard sees when it decides). */
const GROWTH_WINDOW_MS = 6000;

export type DipEnd = 'drained' | 'lower' | 'catchUp' | 'restart';

export interface DipSummary {
  /** How long it lasted (s, one decimal). */
  seconds: number;
  /** The furthest behind (ms). */
  peakMs: number;
  /**
   * Seconds behind gained per second over its first 6 s: ~1 = nothing getting through (a
   * stall); 0.3 = the upload carried about 70 % of the stream.
   */
  growth: number;
  /** Seconds behind, once a second (one decimal), from the start. */
  shape: number[];
  /** How it ended: drained by itself, or the guard (or a restart) ended it. */
  end: DipEnd;
}

export class DipTrace {
  private startedAt: number | null = null;
  private startMs = 0;
  private peakMs = 0;
  private lastPointAt = 0;
  private shape: number[] = [];
  private growth: number | null = null;
  /** The newest reading in the dip. */
  private lastMs = 0;
  private lastAt = 0;

  /** A delay reading; the summary when a dip has just drained. */
  next(delayMs: number, at: number): DipSummary | null {
    if (this.startedAt === null) {
      if (delayMs < START_MS) return null;
      this.startedAt = at;
      this.startMs = delayMs;
      this.peakMs = delayMs;
      this.shape = [];
      this.growth = null;
      this.lastPointAt = -Infinity;
    }
    if (delayMs < END_MS) return this.end('drained', at);
    this.lastMs = delayMs;
    this.lastAt = at;
    this.peakMs = Math.max(this.peakMs, delayMs);
    if (this.growth === null && at - this.startedAt >= GROWTH_WINDOW_MS)
      this.growth = (delayMs - this.startMs) / (at - this.startedAt);
    if (at - this.lastPointAt >= 1000 && this.shape.length < MAX_POINTS) {
      this.shape.push(Math.round(delayMs / 100) / 10);
      this.lastPointAt = at;
    }
    return null;
  }

  /** The dip ended another way (the guard acted, or the encoder restarted); null if none. */
  end(end: DipEnd, at: number): DipSummary | null {
    if (this.startedAt === null) return null;
    const seconds = (at - this.startedAt) / 1000;
    // A dip shorter than the growth window: its growth up to the last reading.
    const span = this.lastAt - this.startedAt;
    const growth = this.growth ?? (span > 0 ? (this.lastMs - this.startMs) / span : 0);
    const summary: DipSummary = {
      seconds: Math.round(seconds * 10) / 10,
      peakMs: this.peakMs,
      growth: Math.round(growth * 100) / 100,
      shape: this.shape,
      end,
    };
    this.startedAt = null;
    return summary;
  }
}

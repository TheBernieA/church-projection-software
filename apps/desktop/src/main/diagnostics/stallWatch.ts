import { PerformanceObserver, performance } from 'node:perf_hooks';
import type { Logger } from '../types';

/** A tick this much later than due: main was blocked (frames wait for it). */
const STALL_MS = 200;
const TICK_MS = 100;
/** At most one line this often (a burst of stalls is one story). */
const QUIET_MS = 2000;
/** What main did lately, for the line (newest last). */
const RECENT = 12;
/** Activities and collections older than this before the stall don't explain it. */
const LOOKBACK_MS = 3000;

interface Mark {
  at: number;
  what: string;
}

const recent: Mark[] = [];

/**
 * Note what main is doing (an IPC call, a part for the stream window, starting ffmpeg), so a
 * stall's log line can say what came just before it. Cheap: a name and a time in a short ring.
 */
export function noteActivity(what: string): void {
  recent.push({ at: performance.now(), what });
  if (recent.length > RECENT) recent.shift();
}

export interface StallReport {
  /** How long main was blocked (ms). */
  ms: number;
  /** Of that, garbage collection overlapping it (ms) and the longest single pause. */
  gcMs: number;
  gcMaxMs: number;
  /** What main did in the 3 s before (oldest first), with how long before the stall ended. */
  before: string[];
}

/**
 * A stall's line: how long, how much of it was garbage collection, and what came before.
 * `end` is when the late tick finally ran; the stall began `ms` before it.
 */
export function stallReport(
  ms: number,
  end: number,
  gcs: readonly { start: number; duration: number }[],
  marks: readonly Mark[],
): StallReport {
  const start = end - ms;
  let gcMs = 0;
  let gcMaxMs = 0;
  for (const g of gcs) {
    const overlap = Math.min(end, g.start + g.duration) - Math.max(start, g.start);
    if (overlap > 0) {
      gcMs += overlap;
      gcMaxMs = Math.max(gcMaxMs, g.duration);
    }
  }
  return {
    ms: Math.round(ms),
    gcMs: Math.round(gcMs),
    gcMaxMs: Math.round(gcMaxMs),
    before: marks
      .filter((m) => m.at >= start - LOOKBACK_MS && m.at <= end)
      .map((m) => `${m.what} ${Math.round(end - m.at)}ms`),
  };
}

/**
 * Watches the main process for stalls while a stream runs: a timer that should tick every
 * 100 ms, and garbage collection as Node reports it. A stall of 200 ms or more is logged with
 * its cause where it can be seen (GC, or what main did just before). Costs a timer tick and a
 * GC observer, only while streaming or recording.
 */
export class StallWatch {
  private timer: ReturnType<typeof setInterval> | null = null;
  private gc: PerformanceObserver | null = null;
  private gcs: { start: number; duration: number }[] = [];
  private lastLine = -Infinity;

  constructor(private readonly log: Logger) {}

  start(): void {
    if (this.timer) return;
    this.gc = new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        this.gcs.push({ start: e.startTime, duration: e.duration });
      const old = performance.now() - LOOKBACK_MS * 2;
      while (this.gcs.length && (this.gcs[0]?.start ?? 0) < old) this.gcs.shift();
    });
    this.gc.observe({ entryTypes: ['gc'] });
    let due = performance.now() + TICK_MS;
    this.timer = setInterval(() => {
      const now = performance.now();
      const late = now - due;
      due = now + TICK_MS;
      if (late < STALL_MS || now - this.lastLine < QUIET_MS) return;
      this.lastLine = now;
      // GC entries are delivered a little after the pause they describe: report shortly.
      setTimeout(
        () => this.log.warn('main stalled', { ...stallReport(late, now, this.gcs, recent) }),
        50,
      );
    }, TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.gc?.disconnect();
    this.gc = null;
    this.gcs = [];
  }
}

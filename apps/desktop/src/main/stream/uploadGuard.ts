/**
 * Keeping a CPU-pipeline stream within what the upload carries. ffmpeg's bitrate is fixed when
 * it starts (the GPU pipeline changes it on the fly: bitrate.ts), so here the answer to a
 * falling-behind stream is a restart: at a lower bitrate while there's room to go lower, or at
 * the same one to throw a backlog away. A restart is a short break for viewers, so it happens
 * only after the stream has been behind for a while, never often, and it never climbs back up
 * on its own (each climb would be another break); the next session starts at full rate.
 *
 * Fed with how far behind live the stream leaves this computer: the sound clock's elapsed time
 * minus ffmpeg's stream time. When the upload stalls, ffmpeg stops taking frames and its time
 * falls behind.
 */

/** Behind by more than this: the upload isn't keeping up. */
export const BEHIND_MS = 1500;
/** Back to live: behind by less than this. */
const CAUGHT_UP_MS = 600;
/** Behind for this long before acting (a blip passes by itself). */
const HOLD_MS = 6000;
/** At most one restart in this long. */
const GAP_MS = 30_000;
/** Each step down keeps this share of the bitrate. */
const STEP = 0.7;
/** Down from its worst by this much: the backlog is draining, the stream is recovering. */
const DRAINING_MS = 500;
/**
 * Falling behind this fast (seconds per second) means almost nothing is getting through: a
 * stall (Wi-Fi dropping out), not a bitrate too high for the upload. A lower bitrate wouldn't
 * help, so it waits for the connection to come back. (Too high a bitrate for an upload that
 * carries C of B kb/s falls behind at 1 − C/B: slower, and it doesn't come back.)
 */
const STALL_RATE = 0.85;
/** Stalled this long: restart (if the servers answer) to get a fresh connection. */
const STALL_RESTART_MS = 20_000;
/**
 * At the floor, a restart only throws a backlog away, at the cost of a break of several
 * seconds: worth it only when the backlog is big (viewers don't see a delay, they see a break).
 */
const CATCH_UP_MS = 10_000;

/**
 * The lowest bitrate worth streaming a picture of this height at: below it the picture turns
 * to mush, and a smaller size looks better. A 540p picture holds up far lower than 1080p, so a
 * slow upload (a phone hotspot) gets room to step down instead of restarting at a bitrate it
 * can't carry (logged live: 540p held at 1500 kb/s, fourteen restarts in seven minutes while the
 * upload carried 300–700 kb/s of a moving picture). Never below 35 % of the target either.
 */
export function floorFor(target: number, height: number): number {
  const min = height >= 1080 ? 1500 : height >= 720 ? 1000 : 600;
  return Math.min(target, Math.max(min, Math.round(target * 0.35)));
}

export type GuardAction = { kind: 'lower'; kbps: number } | { kind: 'catchUp' } | null;

export class UploadGuard {
  private kbps: number;
  /** Since when it has been behind (and not recovering), and how far behind it was then. */
  private behindSince: number | null = null;
  private behindFrom = 0;
  /** The furthest behind since then. */
  private worst = 0;
  private lastAction = -Infinity;

  constructor(
    private readonly target: number,
    /** Never below this: under it the picture turns to mush (better: a smaller size). */
    readonly floor = floorFor(target, 1080),
    /** Start lower than the target (a lighter mode chosen because the upload is slow). */
    start = target,
  ) {
    this.kbps = Math.min(target, Math.max(floor, start));
  }

  /** The bitrate the encoder should use. */
  get current(): number {
    return this.kbps;
  }

  /** Lowered as far as it goes and still behind: the upload is too slow for this size. */
  get atFloor(): boolean {
    return this.kbps <= this.floor;
  }

  /** The encoder restarted (for any reason): its backlog is gone, start watching afresh. */
  restarted(at: number): void {
    this.behindSince = null;
    this.lastAction = Math.max(this.lastAction, at);
  }

  next(delayMs: number, at: number): GuardAction {
    if (delayMs < CAUGHT_UP_MS) {
      this.behindSince = null;
      return null;
    }
    if (delayMs < BEHIND_MS && this.behindSince === null) return null;
    // Behind, or recovering from it: draining means it's coming back by itself.
    if (this.behindSince === null || delayMs < this.worst - DRAINING_MS) {
      this.behindSince = at;
      this.behindFrom = delayMs;
      this.worst = delayMs;
      return null;
    }
    this.worst = Math.max(this.worst, delayMs);
    const held = at - this.behindSince;
    if (held < HOLD_MS || at - this.lastAction < GAP_MS) return null;
    const rate = (delayMs - this.behindFrom) / held;
    if (rate >= STALL_RATE) {
      // Nothing getting through: wait for the connection, then try a fresh one.
      if (held < STALL_RESTART_MS) return null;
      return this.act({ kind: 'catchUp' }, at);
    }
    if (this.kbps > this.floor) {
      this.kbps = Math.max(this.floor, Math.round(this.kbps * STEP));
      return this.act({ kind: 'lower', kbps: this.kbps }, at);
    }
    return delayMs >= CATCH_UP_MS ? this.act({ kind: 'catchUp' }, at) : null;
  }

  private act(a: NonNullable<GuardAction>, at: number): GuardAction {
    this.lastAction = at;
    this.behindSince = null;
    return a;
  }
}

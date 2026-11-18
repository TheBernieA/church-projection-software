/**
 * Adaptive bitrate: keeps the stream within what the upload can carry, so it stays live instead
 * of falling further and further behind (what OBS calls dynamic bitrate).
 *
 * Fed once a second with how far behind live the stream is leaving this computer and the
 * bitrate actually being sent. When the delay grows, the encoder's bitrate drops at once to
 * well under what was getting through; once the stream has been live and steady for a while it
 * creeps back up towards the target. If a backlog has already built up (data waiting in the
 * network, which only reconnecting can throw away), it asks for a reconnect.
 */
export interface BitrateSample {
  /** How far behind live the stream leaves this computer (ms). */
  delayMs: number;
  /** Bitrate actually sent over the last second (video, kb/s); 0 when not known. */
  sentKbps: number;
  /** When (ms, any clock). */
  at: number;
}

export type BitrateAction =
  { kind: 'set'; kbps: number; reason: 'congested' | 'recovered' } | { kind: 'reconnect' } | null;

/** Behind by more than this: the upload isn't keeping up. */
const CONGESTED_MS = 1200;
/** Live again: behind by less than this. */
const CLEAR_MS = 500;
/** Behind by more than this even after lowering: throw the backlog away (reconnect). */
const RECONNECT_MS = 3000;
/** Lower to this share of what was getting through. */
const DOWN = 0.6;
/** Raise by this much at a time, after this long steady and this long since the last change. */
const UP = 1.25;
const STEADY_MS = 10_000;
const SETTLE_MS = 4000;
/** Choking again within this long means the rate is too much for the upload. */
const REPEAT_MS = 2 * 60_000;
/** Climbing back stops at this share of the rate that choked, for this long. */
const CEILING = 0.85;
const CEILING_MS = 5 * 60_000;
/** Never reconnect more often than this. */
const RECONNECT_GAP_MS = 45_000;

export class BitrateController {
  private kbps: number;
  private lastChange = -Infinity;
  private clearSince: number | null = null;
  private lastReconnect = -Infinity;
  private lowered = false;
  /**
   * The rate that last choked the upload: climbing back stops short of it for a while (else the
   * stream would creep up, fall behind again, and repeat).
   */
  private ceiling = Infinity;
  private ceilingAt = -Infinity;
  private lastCongestion = -Infinity;

  constructor(
    /** The bitrate the performance mode asks for: never above it. */
    private target: number,
    /** Never below this (the picture turns to mush). */
    private readonly floor = Math.max(500, Math.round(target * 0.12)),
  ) {
    this.kbps = target;
  }

  /** The bitrate the encoder should use now. */
  get current(): number {
    return this.kbps;
  }

  /** A new session or a new target (another performance mode): start from the top. */
  reset(target: number): void {
    this.target = target;
    this.kbps = target;
    this.lastChange = -Infinity;
    this.clearSince = null;
    this.lowered = false;
    this.ceiling = Infinity;
    this.lastCongestion = -Infinity;
  }

  /** After a reconnect: the backlog is gone, so give the lowered bitrate time to prove itself. */
  reconnected(at: number): void {
    this.lastReconnect = at;
    this.lastChange = at;
    this.clearSince = null;
  }

  next(s: BitrateSample): BitrateAction {
    if (s.delayMs > CONGESTED_MS) {
      this.clearSince = null;
      // A backlog the lower bitrate can't drain quickly: only reconnecting throws it away.
      if (
        s.delayMs > RECONNECT_MS &&
        this.lowered &&
        s.at - this.lastChange > SETTLE_MS &&
        s.at - this.lastReconnect > RECONNECT_GAP_MS
      )
        return { kind: 'reconnect' };
      if (s.at - this.lastChange < SETTLE_MS) return null; // the last change is still arriving
      // Well under what was getting through (the encoder often sends less than it's asked for).
      const through = s.sentKbps > 0 ? Math.min(s.sentKbps, this.kbps) : this.kbps;
      // Choked again soon after the last time: that rate is more than the upload carries, so
      // climbing back stops short of it. (A one-off stall, a network blip, sets no ceiling.)
      if (s.at - this.lastCongestion < REPEAT_MS) {
        this.ceiling = Math.round(through * CEILING);
        this.ceilingAt = s.at;
      }
      this.lastCongestion = s.at;
      const next = Math.max(this.floor, Math.round(through * DOWN));
      if (next >= this.kbps) return null;
      this.kbps = next;
      this.lastChange = s.at;
      this.lowered = true;
      return { kind: 'set', kbps: next, reason: 'congested' };
    }
    if (s.delayMs < CLEAR_MS) this.clearSince ??= s.at;
    else this.clearSince = null;
    // The remembered ceiling fades after a while: the connection may have got better.
    if (s.at - this.ceilingAt > CEILING_MS) this.ceiling = Infinity;
    const top = Math.min(this.target, this.ceiling);
    if (
      this.kbps < top &&
      this.clearSince !== null &&
      s.at - this.clearSince > STEADY_MS &&
      s.at - this.lastChange > STEADY_MS
    ) {
      this.kbps = Math.min(top, Math.round(this.kbps * UP));
      this.lastChange = s.at;
      this.clearSince = s.at;
      if (this.kbps >= this.target) this.lowered = false;
      return { kind: 'set', kbps: this.kbps, reason: 'recovered' };
    }
    return null;
  }
}

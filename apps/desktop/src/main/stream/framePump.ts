/**
 * Frames on wall-clock time. ffmpeg times raw video by counting frames, and the sound by
 * counting samples (which follow the real clock), so the picture must follow the clock too:
 * after a late tick the frames that were due are written (the same picture, no copies), and the
 * next tick is aimed at the next frame's time, so lateness never adds up.
 */

import { framesDue, msToNextFrame } from '@lampstand/core';

export { framesDue, msToNextFrame };

export interface PumpSink {
  /** Write one frame; false when the encoder's input is backed up (that frame is dropped). */
  write(): boolean;
  /** Called after each tick (top up the sound, etc.). */
  afterTick?(): void;
}

/**
 * Runs the frame clock. Most a tick will write is `maxBurst` (after a long stall the rest are
 * counted as dropped rather than flooding the encoder; the picture then jumps, but stays in time).
 */
export class FramePump {
  private start = 0;
  private sent = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Frames Lampstand couldn't hand to the encoder (it was busy, or after a long stall). */
  dropped = 0;

  constructor(
    private readonly fps: number,
    private readonly sink: PumpSink,
    private readonly now: () => number = () => performance.now(),
    private readonly maxBurst = 4,
  ) {}

  get framesSent(): number {
    return this.sent;
  }

  begin(): void {
    this.stop();
    this.start = this.now();
    this.sent = 0;
    this.dropped = 0;
    this.tick();
  }

  /** One tick (exposed for tests). */
  tick(): void {
    const now = this.now();
    let due = framesDue(this.start, now, this.fps, this.sent);
    if (due > this.maxBurst) {
      this.dropped += due - this.maxBurst;
      this.sent += due - this.maxBurst;
      due = this.maxBurst;
    }
    for (let i = 0; i < due; i++) {
      if (!this.sink.write()) this.dropped += 1;
      this.sent += 1;
    }
    this.sink.afterTick?.();
    this.timer = setTimeout(
      () => this.tick(),
      Math.max(1, msToNextFrame(this.start, this.now(), this.fps, this.sent)),
    );
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

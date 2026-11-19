/**
 * Frames on wall-clock time. ffmpeg times raw video by counting frames, and the sound by
 * counting samples (which follow the real clock), so the frames written must always match the
 * clock: a frame that couldn't be written on time (the encoder was busy, or a stall) is owed
 * and written later (the same picture again), never skipped. Skipping one would put the picture
 * a frame ahead of the sound for the rest of the stream.
 */

import { framesDue, msToNextFrame } from '@lampstand/core';

export interface PumpSink {
  /** Write one frame; false when the encoder's input is backed up (the frame stays owed). */
  write(): boolean;
  /** Called after each tick (top up the sound, etc.). */
  afterTick?(): void;
}

/**
 * Runs the frame clock. A tick writes at most `maxBurst` frames (so a stall is caught up over a
 * few ticks rather than flooding the encoder at once); frames still owed wait for the next.
 */
export class FramePump {
  private start = 0;
  /** Frames the clock has asked for so far. */
  private due = 0;
  /** Frames written to the encoder (its timeline). */
  private written = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Frames that missed their moment (written late, as a repeat of the picture). */
  dropped = 0;

  constructor(
    private readonly fps: number,
    private readonly sink: PumpSink,
    private readonly now: () => number = () => performance.now(),
    private readonly maxBurst = 4,
  ) {}

  /** Frames handed to the encoder. */
  get framesSent(): number {
    return this.written;
  }

  /** Frames owed: due by the clock but not written yet. */
  get behind(): number {
    return this.due - this.written;
  }

  begin(): void {
    this.stop();
    this.start = this.now();
    this.due = 0;
    this.written = 0;
    this.dropped = 0;
    this.tick();
  }

  /** One tick (exposed for tests). */
  tick(): void {
    const fresh = framesDue(this.start, this.now(), this.fps, this.due);
    this.due += fresh;
    let n = Math.min(this.behind, this.maxBurst);
    let wrote = 0;
    while (n-- > 0 && this.sink.write()) wrote += 1;
    this.written += wrote;
    // Frames due this tick that didn't go out in it are late (they'll go out as repeats).
    this.dropped += Math.max(0, fresh - wrote);
    this.sink.afterTick?.();
    this.timer = setTimeout(
      () => this.tick(),
      Math.max(1, msToNextFrame(this.start, this.now(), this.fps, this.due)),
    );
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

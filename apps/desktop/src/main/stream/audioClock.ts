import type { Writable } from 'node:stream';

const SAMPLE_RATE = 48_000;
/** Stereo float32. */
export const BYTES_PER_SECOND = SAMPLE_RATE * 2 * 4;
const FRAME_BYTES = 8;

/** How far the sound may run behind the clock before silence fills the gap, and ahead of it
 *  before a late batch is dropped (filling sooner turns every small delay into a click). */
const SLACK_BYTES = BYTES_PER_SECOND * 0.15;
/** How much may wait for ffmpeg. It opens the sound a moment after the picture, and a stalled
 *  upload stops it reading for a second or two: sound that waits arrives late (as the picture
 *  does) but whole, where sound that's refused becomes silence on the stream. Longer than the
 *  picture is allowed to wait (a stall past that is ended by skipping or reconnecting). */
const MAX_WAITING_BYTES = BYTES_PER_SECOND * 3;
/**
 * The sound card's clock and the computer's drift apart (tens of parts per million: over a long
 * service, seconds). Past this much, each batch is nudged by one sample (about 0.2%, which no
 * one can hear) back towards the clock, so the gap never grows to a dropped batch or a burst of
 * silence.
 */
const DRIFT_BYTES = BYTES_PER_SECOND * 0.04;

const toMs = (bytes: number): number => Math.round((bytes / BYTES_PER_SECOND) * 1000);

/**
 * The stream's sound, kept to the clock. ffmpeg times the sound by counting samples, so what is
 * written must match real time both ways: silence fills a gap (ffmpeg never waits for sound),
 * and a batch that arrives after its gap was filled is dropped (or every hiccup would push the
 * sound later for the rest of the stream).
 */
export class AudioClock {
  private startedAt = 0;
  private written = 0;
  private padded = 0;
  private dropped = 0;
  /** Samples taken out or repeated to follow the clock (drift). */
  private nudged = 0;

  constructor(
    private readonly out: () => Writable | null,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Time zero: the first picture has gone to the encoder. */
  begin(): void {
    this.startedAt = this.now();
    this.written = 0;
  }

  /** A new session: forget the last one's counts. */
  reset(): void {
    this.startedAt = 0;
    this.written = 0;
    this.padded = 0;
    this.dropped = 0;
    this.nudged = 0;
  }

  get started(): boolean {
    return this.startedAt > 0;
  }

  /** Milliseconds since time zero. */
  elapsedMs(): number {
    return this.now() - this.startedAt;
  }

  private dueBytes(): number {
    return (this.elapsedMs() / 1000) * BYTES_PER_SECOND;
  }

  /** Sound from the mix. False when it was not written (too late, or ffmpeg isn't taking it). */
  write(chunk: Buffer): boolean {
    // Too late (its gap was filled), or ffmpeg isn't taking sound (a backed-up upload): either
    // way this batch is lost, and counted, so the log tells the truth about gaps in the sound.
    if (
      (this.started && this.written - this.dueBytes() > SLACK_BYTES) ||
      !this.send(this.followClock(chunk))
    ) {
      this.dropped += chunk.length;
      return false;
    }
    return true;
  }

  /**
   * Drift: sound running ahead of the clock loses its last sample, sound running behind repeats
   * it (one sample in a batch of hundreds).
   */
  private followClock(chunk: Buffer): Buffer {
    if (!this.started || chunk.length < FRAME_BYTES * 2) return chunk;
    const lead = this.written - this.dueBytes();
    if (lead > DRIFT_BYTES) {
      this.nudged += 1;
      return chunk.subarray(0, chunk.length - FRAME_BYTES);
    }
    if (lead < -DRIFT_BYTES) {
      this.nudged += 1;
      return Buffer.concat([chunk, chunk.subarray(chunk.length - FRAME_BYTES)]);
    }
    return chunk;
  }

  /** Fill with silence once the sound is well behind the clock. */
  topUp(): void {
    const behind = this.dueBytes() - this.written;
    if (behind <= SLACK_BYTES) return;
    const bytes = Math.floor(behind / FRAME_BYTES) * FRAME_BYTES;
    if (this.send(Buffer.alloc(bytes))) this.padded += bytes;
  }

  private send(chunk: Buffer): boolean {
    const out = this.out();
    if (!out?.writable || out.writableLength > MAX_WAITING_BYTES) return false;
    out.write(chunk);
    this.written += chunk.length;
    return true;
  }

  /** For the log: how far the sound leads the clock, and what was filled in or dropped. */
  report(): {
    audioLeadMs: number;
    audioPaddedMs: number;
    audioDroppedMs: number;
    audioNudged: number;
  } {
    return {
      audioLeadMs: toMs(this.written - this.dueBytes()),
      audioPaddedMs: toMs(this.padded),
      audioDroppedMs: toMs(this.dropped),
      audioNudged: this.nudged,
    };
  }
}

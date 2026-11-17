import type { Writable } from 'node:stream';

export const SAMPLE_RATE = 48_000;
/** Stereo float32. */
export const BYTES_PER_SECOND = SAMPLE_RATE * 2 * 4;
const FRAME_BYTES = 8;

/** How far the sound may run behind the clock before silence fills the gap, and ahead of it
 *  before a late batch is dropped (filling sooner turns every small delay into a click). */
const SLACK_BYTES = BYTES_PER_SECOND * 0.15;
/** How much may wait for ffmpeg (it opens the sound a moment after the picture: dropping those
 *  first batches would leave the sound short for the whole stream). */
const MAX_WAITING_BYTES = BYTES_PER_SECOND / 2;

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
    if (this.started && this.written - this.dueBytes() > SLACK_BYTES) {
      this.dropped += chunk.length;
      return false;
    }
    return this.send(chunk);
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
  report(): { audioLeadMs: number; audioPaddedMs: number; audioDroppedMs: number } {
    return {
      audioLeadMs: toMs(this.written - this.dueBytes()),
      audioPaddedMs: toMs(this.padded),
      audioDroppedMs: toMs(this.dropped),
    };
  }
}

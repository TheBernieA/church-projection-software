/**
 * How far behind the encoder's input is, in seconds of video: of everything written to ffmpeg,
 * how old is the oldest frame it hasn't taken yet? Bytes alone can't say (a still slide encodes
 * to almost nothing, so a few hundred kilobytes may be many seconds).
 */
export class Backlog {
  /** Frames written, oldest first: where each ended in the byte stream, and its time (ms). */
  private frames: { end: number; ms: number }[] = [];
  private written = 0;

  reset(): void {
    this.frames = [];
    this.written = 0;
  }

  /** A frame of `bytes` with timestamp `ms` was written. */
  add(bytes: number, ms: number): void {
    this.written += bytes;
    this.frames.push({ end: this.written, ms });
  }

  /** Seconds of video still waiting, given how many bytes haven't been taken (`pending`). */
  seconds(pending: number): number {
    const taken = this.written - pending;
    // Forget frames that have been taken in full.
    let i = 0;
    while (i < this.frames.length - 1 && (this.frames[i]?.end ?? 0) <= taken) i += 1;
    if (i) this.frames.splice(0, i);
    const oldest = this.frames[0];
    const newest = this.frames.at(-1);
    if (!oldest || !newest || pending <= 0) return 0;
    return Math.max(0, (newest.ms - oldest.ms) / 1000);
  }
}

import { avcCodecFor, framesDue, msToNextFrame } from '@lampstand/core';
import type { EncodeConfig, StreamApi } from '@lampstand/ipc-contract';

/** The WebCodecs settings for a stream size, rate and bitrate. */
export function encoderConfig(c: EncodeConfig, hardware: boolean): VideoEncoderConfig {
  return {
    codec: avcCodecFor(c.width, c.height, c.fps),
    width: c.width,
    height: c.height,
    framerate: c.fps,
    bitrate: c.kbps * 1000,
    bitrateMode: 'constant',
    latencyMode: 'realtime',
    hardwareAcceleration: hardware ? 'prefer-hardware' : 'prefer-software',
    avc: { format: 'annexb' },
  };
}

/**
 * The GPU pipeline's encoder: the stream picture arrives as GPU frames (main passes the
 * offscreen window's textures back to this page), and the computer's hardware H.264 encoder
 * (via WebCodecs) encodes it on a steady frame clock: the latest picture repeats when nothing
 * changed, so the stream is a constant frame rate. Nothing is copied to the CPU; main only
 * hands the encoded chunks to ffmpeg, which packages them for each destination.
 */
export class StreamEncoder {
  private latest: VideoFrame | null = null;
  private encoder: VideoEncoder | null = null;
  private config: EncodeConfig | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stats: ReturnType<typeof setInterval> | null = null;
  private start = 0;
  private sent = 0;
  private encoded = 0;
  private dropped = 0;
  private wantKey = true;
  /** The encoder has produced its first frame: the clock runs from then. */
  private started = false;

  constructor(private readonly api: StreamApi) {
    api.onFrame((frame) => {
      this.latest?.close();
      this.latest = frame as unknown as VideoFrame;
    });
    api.onEncode((cmd) => {
      if (cmd === null) void this.stop();
      else if ('keyframe' in cmd) this.wantKey = true;
      else this.begin(cmd);
    });
  }

  /** Can this computer encode this size in hardware? (Told to main before it picks a pipeline.) */
  async probe(c: EncodeConfig): Promise<void> {
    const hardware = await VideoEncoder.isConfigSupported(encoderConfig(c, true)).then(
      (r) => !!r.supported,
      () => false,
    );
    this.api.reportEncoder({
      type: 'caps',
      width: c.width,
      height: c.height,
      fps: c.fps,
      hardware,
    });
  }

  private begin(c: EncodeConfig): void {
    // A restart: drop the old encoder at once (no flush), so none of its leftover frames reach
    // the new ffmpeg ahead of the new stream's first keyframe.
    void this.stop(false);
    this.config = c;
    const encoder = new VideoEncoder({
      output: (chunk) => {
        if (this.encoder !== encoder) return; // from an encoder that's been replaced
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        this.encoded += 1;
        this.api.sendVideo(data, chunk.type === 'key');
        // The hardware encoder takes a moment to start: the frame clock (and main's sound
        // clock, on this first chunk) start only now, so none of that wait shifts the sync.
        if (!this.started) {
          this.started = true;
          this.start = performance.now() - 1000 / c.fps; // frame 0 has gone
          this.tick();
        }
      },
      error: (e) => {
        this.api.reportEncoder({ type: 'error', message: e.message });
        void this.stop();
      },
    });
    encoder.configure(encoderConfig(c, true));
    this.encoder = encoder;
    this.start = performance.now();
    this.sent = 0;
    this.encoded = 0;
    this.dropped = 0;
    this.wantKey = true;
    this.started = false;
    this.first();
    this.stats = setInterval(() => {
      this.api.reportEncoder({ type: 'stats', encoded: this.encoded, dropped: this.dropped });
    }, 1000);
  }

  /** The first frame (a keyframe), as soon as there's a picture; the clock waits for it. */
  private first(): void {
    const enc = this.encoder;
    if (!enc || enc.state !== 'configured' || this.started) return;
    if (!this.latest) {
      this.timer = setTimeout(() => this.first(), 20);
      return;
    }
    const frame = new VideoFrame(this.latest, { timestamp: 0 });
    enc.encode(frame, { keyFrame: true });
    frame.close();
    this.sent = 1;
    this.wantKey = false;
  }

  /** Encode every frame that's due (the latest picture), then wait for the next one's time. */
  private tick(): void {
    const enc = this.encoder;
    const c = this.config;
    if (!enc || !c || enc.state !== 'configured') return;
    const now = performance.now();
    let due = framesDue(this.start, now, c.fps, this.sent);
    // After a long stall, don't flood the encoder: keep time, count what was skipped.
    if (due > 4) {
      this.dropped += due - 4;
      this.sent += due - 4;
      due = 4;
    }
    for (let i = 0; i < due; i++) {
      const n = this.sent;
      this.sent += 1;
      // The encoder is behind (or nothing drawn yet): skip this frame, keep the clock.
      if (!this.latest || enc.encodeQueueSize > 3) {
        this.dropped += 1;
        continue;
      }
      const frame = new VideoFrame(this.latest, { timestamp: Math.round((n * 1e6) / c.fps) });
      const key = this.wantKey || n % (c.fps * 2) === 0;
      this.wantKey = false;
      enc.encode(frame, { keyFrame: key });
      frame.close();
    }
    this.timer = setTimeout(
      () => this.tick(),
      Math.max(1, msToNextFrame(this.start, performance.now(), c.fps, this.sent)),
    );
  }

  async stop(flush = true): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    if (this.stats) clearInterval(this.stats);
    this.timer = null;
    this.stats = null;
    const enc = this.encoder;
    this.encoder = null;
    this.config = null;
    if (flush && enc && enc.state === 'configured') {
      try {
        await enc.flush();
      } catch {
        /* closing anyway */
      }
    }
    if (enc && enc.state !== 'closed') enc.close();
  }
}

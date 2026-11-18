/// <reference lib="webworker" />
import { avcCodecFor, framesDue, msToNextFrame } from '@lampstand/core';
import type { EncodeConfig, EncoderReport } from '@lampstand/ipc-contract';

/**
 * The GPU pipeline's encoder, in its own thread: the frame clock and the hardware H.264 encoder
 * (WebCodecs) run here, so nothing the stream page does (drawing a new slide, fitting text,
 * starting a video) can make a frame late. The page hands over each new picture; the latest one
 * is encoded on a steady clock (it repeats when nothing changed). Each encoded frame carries
 * the time it was made, so the page passing it on a little late never shifts the timing.
 */
export type WorkerIn =
  | { t: 'frame'; frame: VideoFrame }
  | { t: 'probe'; cfg: EncodeConfig }
  | { t: 'begin'; cfg: EncodeConfig }
  | { t: 'key' }
  | { t: 'bitrate'; kbps: number }
  | { t: 'stop' };

export interface ChunkMessage {
  data: Uint8Array;
  key: boolean;
  /** When the frame was made, in µs since encoding started. */
  ts: number;
  /** The encoder's configuration record (avcC), on keyframes. */
  config?: Uint8Array;
}

export type WorkerOut = { t: 'report'; r: EncoderReport } | ({ t: 'chunk' } & ChunkMessage);

const scope = self as unknown as DedicatedWorkerGlobalScope;

/** The WebCodecs settings for a stream size, rate and bitrate. */
function encoderConfig(c: EncodeConfig): VideoEncoderConfig {
  return {
    codec: avcCodecFor(c.width, c.height, c.fps),
    width: c.width,
    height: c.height,
    framerate: c.fps,
    bitrate: c.kbps * 1000,
    bitrateMode: 'constant',
    latencyMode: 'realtime',
    hardwareAcceleration: 'prefer-hardware',
    // AVCC frames plus a configuration record: main wraps them in FLV with real timestamps.
    avc: { format: 'avc' },
  };
}

let latest: VideoFrame | null = null;
let encoder: VideoEncoder | null = null;
let config: EncodeConfig | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let stats: ReturnType<typeof setInterval> | null = null;
let start = 0;
let sent = 0;
let encoded = 0;
let dropped = 0;
let wantKey = true;
let lastKey = 0;
let avcC: Uint8Array | null = null;
/** The encoder has produced its first frame: the clock runs from then. */
let started = false;
/** When each frame went into the encoder (by timestamp), to time how long it takes. */
const sentAt = new Map<number, number>();
let encodeSum = 0;
let encodeCount = 0;

function encode(enc: VideoEncoder, timestamp: number, key: boolean): void {
  if (!latest) return;
  const frame = new VideoFrame(latest, { timestamp });
  if (sentAt.size > 120) sentAt.clear(); // frames the encoder never gave back
  sentAt.set(timestamp, performance.now());
  enc.encode(frame, { keyFrame: key });
  frame.close();
}

const report = (r: EncoderReport): void =>
  scope.postMessage({ t: 'report', r } satisfies WorkerOut);

/** An encoded frame, to the page (which passes it to main). */
function send(m: ChunkMessage): void {
  scope.postMessage({ t: 'chunk', ...m } satisfies WorkerOut, [m.data.buffer]);
}

function stop(flush: boolean): void {
  if (timer) clearTimeout(timer);
  if (stats) clearInterval(stats);
  timer = null;
  stats = null;
  const enc = encoder;
  encoder = null;
  config = null;
  if (!enc || enc.state === 'closed') return;
  if (flush && enc.state === 'configured')
    void enc
      .flush()
      .catch(() => undefined)
      .finally(() => {
        if (enc.state !== 'closed') enc.close();
      });
  else enc.close();
}

function begin(c: EncodeConfig): void {
  // A restart: drop the old encoder at once (no flush), so none of its leftover frames reach
  // the new ffmpeg ahead of the new stream's first keyframe.
  stop(false);
  config = c;
  const enc = new VideoEncoder({
    output: (chunk, meta) => {
      if (encoder !== enc) return; // from an encoder that's been replaced
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      encoded += 1;
      const at = sentAt.get(chunk.timestamp);
      if (at !== undefined) {
        sentAt.delete(chunk.timestamp);
        encodeSum += performance.now() - at;
        encodeCount += 1;
      }
      const d = meta?.decoderConfig?.description;
      if (d) {
        const view = ArrayBuffer.isView(d)
          ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength)
          : new Uint8Array(d);
        avcC = new Uint8Array(view);
      }
      const key = chunk.type === 'key';
      send({ data, key, ts: chunk.timestamp, ...(key && avcC ? { config: avcC.slice() } : {}) });
      // The hardware encoder takes a moment to start: the frame clock (and main's sound clock,
      // on this first chunk) start only now, so none of that wait shifts the sync.
      if (!started) {
        started = true;
        start = performance.now() - 1000 / c.fps; // frame 0 has gone
        tick();
      }
    },
    error: (e) => {
      report({ type: 'error', message: e.message });
      stop(false);
    },
  });
  enc.configure(encoderConfig(c));
  encoder = enc;
  sent = 0;
  encoded = 0;
  dropped = 0;
  wantKey = true;
  lastKey = 0;
  avcC = null;
  started = false;
  first();
  sentAt.clear();
  encodeSum = 0;
  encodeCount = 0;
  stats = setInterval(() => {
    const encodeMs = encodeCount ? Math.round(encodeSum / encodeCount) : 0;
    encodeSum = 0;
    encodeCount = 0;
    report({ type: 'stats', encoded, dropped, encodeMs });
  }, 1000);
}

/** The first frame (a keyframe), as soon as there's a picture; the clock waits for it. */
function first(): void {
  const enc = encoder;
  if (!enc || enc.state !== 'configured' || started) return;
  if (!latest) {
    timer = setTimeout(first, 10);
    return;
  }
  encode(enc, 0, true);
  sent = 1;
  wantKey = false;
}

/** Encode every frame that's due (the latest picture), then wait for the next one's time. */
function tick(): void {
  const enc = encoder;
  const c = config;
  if (!enc || !c || enc.state !== 'configured') return;
  let due = framesDue(start, performance.now(), c.fps, sent);
  // After a long stall, don't flood the encoder: keep time, count what was skipped.
  if (due > 4) {
    dropped += due - 4;
    sent += due - 4;
    due = 4;
  }
  for (let i = 0; i < due; i++) {
    const n = sent;
    sent += 1;
    // The encoder is behind (or nothing drawn yet): skip this frame, keep the clock.
    if (!latest || enc.encodeQueueSize > 3) {
      dropped += 1;
      continue;
    }
    // A keyframe every two seconds of stream time, even when the frame on that exact tick was
    // skipped (services cut the stream into pieces at keyframes).
    const key = wantKey || n - lastKey >= c.fps * 2;
    if (key) lastKey = n;
    wantKey = false;
    encode(enc, Math.round((n * 1e6) / c.fps), key);
  }
  timer = setTimeout(tick, Math.max(1, msToNextFrame(start, performance.now(), c.fps, sent)));
}

/**
 * A new bitrate mid-stream (the upload can't keep up, or has recovered): the hardware encoder
 * takes it on the fly, from a keyframe, with no restart and no gap.
 */
function setBitrate(kbps: number): void {
  const enc = encoder;
  if (!enc || !config || enc.state !== 'configured' || config.kbps === kbps) return;
  config = { ...config, kbps };
  enc.configure(encoderConfig(config));
  wantKey = true;
}

scope.onmessage = (e: MessageEvent<WorkerIn>) => {
  const m = e.data;
  switch (m.t) {
    case 'frame':
      latest?.close();
      latest = m.frame;
      break;
    case 'probe':
      void VideoEncoder.isConfigSupported(encoderConfig(m.cfg))
        .then(
          (r) => !!r.supported,
          () => false,
        )
        .then((hardware) =>
          report({
            type: 'caps',
            width: m.cfg.width,
            height: m.cfg.height,
            fps: m.cfg.fps,
            hardware,
          }),
        );
      break;
    case 'begin':
      begin(m.cfg);
      break;
    case 'key':
      wantKey = true;
      break;
    case 'bitrate':
      setBitrate(m.kbps);
      break;
    case 'stop':
      stop(true);
      break;
  }
};

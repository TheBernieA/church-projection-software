/**
 * The frame clock both stream pipelines use: video is timed by counting frames, so the frames
 * must follow the real clock (as the sound does). Pure maths, shared by main (raw frames to
 * ffmpeg) and the stream page (hardware encoding).
 */

/** Frames that should have been sent by `now` (frame 0 at `start`), minus those already sent. */
export function framesDue(startMs: number, nowMs: number, fps: number, sent: number): number {
  return Math.max(0, Math.floor(((nowMs - startMs) * fps) / 1000) + 1 - sent);
}

/** When the next frame is due, in ms from now. */
export function msToNextFrame(startMs: number, nowMs: number, fps: number, sent: number): number {
  const next = startMs + (sent * 1000) / fps;
  return Math.max(0, next - nowMs);
}

/**
 * The H.264 codec string (High profile) with the smallest level that fits the size and rate,
 * e.g. 1080p60 → "avc1.64002a" (level 4.2).
 */
export function avcCodecFor(width: number, height: number, fps: number): string {
  const mbPerSecond = Math.ceil(width / 16) * Math.ceil(height / 16) * fps;
  const levels: [number, number][] = [
    [108_000, 0x1f], // 3.1
    [216_000, 0x20], // 3.2
    [245_760, 0x28], // 4.0
    [522_240, 0x2a], // 4.2
    [589_824, 0x32], // 5.0
  ];
  const level = levels.find(([max]) => mbPerSecond <= max)?.[1] ?? 0x33;
  return `avc1.6400${level.toString(16).padStart(2, '0')}`;
}

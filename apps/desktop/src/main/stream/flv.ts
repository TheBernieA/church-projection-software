/**
 * A minimal FLV writer for the GPU pipeline's video: each hardware-encoded frame goes to ffmpeg
 * as an FLV video tag carrying its real timestamp (when it was made, in ms since the stream
 * started). ffmpeg then only copies it on: no guessing times from a raw stream, no look-ahead,
 * and a skipped frame leaves a gap in time rather than slowing the video's clock.
 */

/** "FLV", version 1, video only, header length 9; then the first (zero) previous-tag size. */
export const FLV_HEADER = Buffer.from([0x46, 0x4c, 0x56, 0x01, 0x01, 0, 0, 0, 9, 0, 0, 0, 0]);

function tag(timestampMs: number, body: Buffer): Buffer {
  const ts = Math.max(0, Math.round(timestampMs));
  const head = Buffer.alloc(11);
  head[0] = 9; // video
  head.writeUIntBE(body.length, 1, 3);
  head.writeUIntBE(ts & 0xffffff, 4, 3);
  head[7] = (ts >>> 24) & 0xff;
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(11 + body.length);
  return Buffer.concat([head, body, tail]);
}

/** The AVC sequence header (the encoder's avcC record: picture size, profile), sent first. */
export function flvSequenceHeader(avcC: Uint8Array): Buffer {
  return tag(0, Buffer.concat([Buffer.from([0x17, 0, 0, 0, 0]), avcC]));
}

/** One encoded frame (AVCC: length-prefixed NAL units, as WebCodecs gives them). */
export function flvFrame(data: Uint8Array, key: boolean, timestampMs: number): Buffer {
  return tag(timestampMs, Buffer.concat([Buffer.from([key ? 0x17 : 0x27, 1, 0, 0, 0]), data]));
}

/**
 * Collects the stream's sound mix and hands it to the page in ~11 ms batches of interleaved
 * stereo float32 (the page sends them on to the encoder). It passes nothing through.
 */
const FRAMES = 512;

class PcmTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(FRAMES * 2);
    this.at = 0;
  }

  process(inputs) {
    const input = inputs[0];
    const l = input && input[0];
    if (!l) return true;
    const r = input[1] || l;
    for (let i = 0; i < l.length; i++) {
      // Never past full scale: a peak that got by the limiter is clipped here, not wrapped or
      // distorted by the AAC encoder.
      this.buf[this.at++] = l[i] > 1 ? 1 : l[i] < -1 ? -1 : l[i];
      this.buf[this.at++] = r[i] > 1 ? 1 : r[i] < -1 ? -1 : r[i];
      if (this.at === this.buf.length) {
        this.port.postMessage(this.buf, [this.buf.buffer]);
        this.buf = new Float32Array(FRAMES * 2);
        this.at = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-tap', PcmTap);

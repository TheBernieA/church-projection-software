/**
 * Collects the stream's sound mix and hands it to the page in ~21 ms batches of interleaved
 * stereo float32 (the page sends them on to the encoder). It passes nothing through.
 */
const FRAMES = 1024;

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
      this.buf[this.at++] = l[i];
      this.buf[this.at++] = r[i];
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

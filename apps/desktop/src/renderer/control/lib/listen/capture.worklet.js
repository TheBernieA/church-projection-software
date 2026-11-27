/**
 * Listening's microphone tap: the input mixed to mono (the context already runs at 16 kHz, the
 * speech model's rate) and handed to the page in 100 ms pieces. It passes nothing through, so
 * nothing is heard.
 */
const CHUNK = 1600;

class ListenCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(CHUNK);
    this.at = 0;
  }

  process(inputs) {
    const input = inputs[0];
    const first = input && input[0];
    if (!first) return true;
    const channels = input.length;
    for (let i = 0; i < first.length; i++) {
      let v = 0;
      for (let c = 0; c < channels; c++) v += input[c][i];
      this.buf[this.at++] = v / channels;
      if (this.at === CHUNK) {
        this.port.postMessage(this.buf, [this.buf.buffer]);
        this.buf = new Float32Array(CHUNK);
        this.at = 0;
      }
    }
    return true;
  }
}

registerProcessor('listen-capture', ListenCapture);

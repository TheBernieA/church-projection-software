/**
 * The mixer's own sound processors (loaded once per audio context; see mixerWorklet.ts).
 *
 * lampstand-gate: a noise gate. Below the threshold the sound closes off (fast to open, a
 * 150 ms hold, then a gentle 150 ms close), with 6 dB of hysteresis so it doesn't chatter at
 * the edge. `threshold` is in dBFS; -100 (or lower) lets everything through.
 *
 * lampstand-loudness: passes nothing through; every 100 ms it posts the block's mean square,
 * left and right added (fed K-weighted sound, that is BS.1770's loudness of the block).
 */
class LampstandGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'threshold',
        defaultValue: -100,
        minValue: -100,
        maxValue: 0,
        automationRate: 'k-rate',
      },
    ];
  }

  constructor() {
    super();
    this.env = 0;
    this.gain = 1;
    this.target = 1;
    this.held = 0;
    this.envFall = Math.exp(-1 / (0.05 * sampleRate));
    this.openRate = 1 - Math.exp(-1 / (0.002 * sampleRate));
    this.closeRate = 1 - Math.exp(-1 / (0.15 * sampleRate));
    this.holdSamples = Math.round(0.15 * sampleRate);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;
    const threshold = parameters.threshold[0];
    const n = input[0].length;
    if (threshold <= -100) {
      for (let c = 0; c < output.length; c++) output[c].set(input[c] || input[0]);
      this.gain = 1;
      this.target = 1;
      return true;
    }
    const open = Math.pow(10, threshold / 20);
    const close = open * 0.5;
    for (let i = 0; i < n; i++) {
      let peak = 0;
      for (let c = 0; c < input.length; c++) {
        const v = Math.abs(input[c][i]);
        if (v > peak) peak = v;
      }
      this.env = peak > this.env ? peak : this.env * this.envFall;
      if (this.env >= open) {
        this.target = 1;
        this.held = this.holdSamples;
      } else if (this.held > 0) {
        this.held--;
      } else if (this.env < close) {
        this.target = 0;
      }
      this.gain +=
        (this.target - this.gain) * (this.target > this.gain ? this.openRate : this.closeRate);
      for (let c = 0; c < output.length; c++) output[c][i] = (input[c] || input[0])[i] * this.gain;
    }
    return true;
  }
}

class LampstandLoudness extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = Math.round(sampleRate / 10);
    this.count = 0;
    this.sum = 0;
  }

  process(inputs) {
    const input = inputs[0];
    const l = input && input[0];
    const n = l ? l.length : 128;
    if (l) {
      const r = input[1];
      for (let i = 0; i < n; i++) {
        this.sum += l[i] * l[i];
        // A mono input counts once per side, as it's heard on both.
        this.sum += r ? r[i] * r[i] : l[i] * l[i];
      }
    }
    this.count += n;
    if (this.count >= this.size) {
      this.port.postMessage(this.sum / this.count);
      this.sum = 0;
      this.count = 0;
    }
    return true;
  }
}

registerProcessor('lampstand-gate', LampstandGate);
registerProcessor('lampstand-loudness', LampstandLoudness);

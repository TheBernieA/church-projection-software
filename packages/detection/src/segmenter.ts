/**
 * Cuts a continuous microphone signal into utterances for the transcriber (BUILD_SPEC §10.1:
 * voice activity detection, energy-based). Whisper transcribes whole pieces, not a stream, so
 * the cut points decide the delay: a pause ends an utterance at once, and speech that runs on
 * is cut at its quietest moment so no piece is longer than `maxMs`.
 */

export interface SegmenterOptions {
  /** Samples per second of what's pushed (mono). */
  readonly sampleRate: number;
  readonly frameMs: number;
  /** How far above the room's noise floor counts as speech (dB). */
  readonly marginDb: number;
  /** Never treat anything quieter than this as speech, however quiet the room (dBFS). */
  readonly minSpeechDb: number;
  /** Speech must last this long to start an utterance (a cough or a click doesn't). */
  readonly minSpeechMs: number;
  /** Quiet this long ends an utterance. */
  readonly endSilenceMs: number;
  /** No utterance is longer than this; longer speech is cut at its quietest moment. */
  readonly maxMs: number;
  /** Where to look for that quiet moment: the last this-many ms before the limit. */
  readonly cutSearchMs: number;
  /** Audio kept from before speech started, so the first syllable isn't clipped. */
  readonly preRollMs: number;
  /** Silence kept after speech in an utterance. */
  readonly tailMs: number;
}

export const DEFAULT_SEGMENTER: SegmenterOptions = {
  sampleRate: 16000,
  frameMs: 30,
  marginDb: 9,
  minSpeechDb: -52,
  minSpeechMs: 120,
  endSilenceMs: 600,
  maxMs: 6000,
  cutSearchMs: 1500,
  preRollMs: 240,
  tailMs: 180,
};

export interface Utterance {
  readonly samples: Float32Array;
  /** Position in the stream, from the first sample pushed. */
  readonly startMs: number;
  readonly endMs: number;
  /** Why it ended: a pause, the length limit, or `flush()`. */
  readonly reason: 'pause' | 'max' | 'flush';
}

export interface SegmenterLevel {
  readonly db: number;
  readonly noiseDb: number;
  readonly speaking: boolean;
}

interface Frame {
  readonly samples: Float32Array;
  readonly db: number;
  readonly index: number;
}

const SILENT_DB = -100;
/** How long the segmenter listens to learn the room's noise floor before it starts. */
const CALIBRATE_MS = 240;

function frameDb(samples: Float32Array): number {
  let sum = 0;
  for (const v of samples) sum += v * v;
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return rms > 0 ? Math.max(SILENT_DB, 20 * Math.log10(rms)) : SILENT_DB;
}

function join(frames: readonly Frame[]): Float32Array {
  const out = new Float32Array(frames.reduce((n, f) => n + f.samples.length, 0));
  let at = 0;
  for (const f of frames) {
    out.set(f.samples, at);
    at += f.samples.length;
  }
  return out;
}

export class Segmenter {
  private readonly o: SegmenterOptions;
  private readonly frameLen: number;
  private pending = new Float32Array(0);
  private frameIndex = 0;
  /** Recent quiet frames (pre-roll), or the utterance being collected. */
  private preRoll: Frame[] = [];
  private current: Frame[] = [];
  private speaking = false;
  /** Loud frames in a row before an utterance starts; quiet frames in a row while one runs. */
  private loudRun = 0;
  private quietRun = 0;
  private noiseDb = -60;
  private lastDb = SILENT_DB;
  /** Frames heard so far while learning the room (the first ~quarter second). */
  private calibrating = 0;

  constructor(opts: Partial<SegmenterOptions> = {}) {
    this.o = { ...DEFAULT_SEGMENTER, ...opts };
    this.frameLen = Math.round((this.o.sampleRate * this.o.frameMs) / 1000);
  }

  private frames(ms: number): number {
    return Math.max(1, Math.round(ms / this.o.frameMs));
  }

  private ms(frameIndex: number): number {
    return frameIndex * this.o.frameMs;
  }

  /** The loudness a frame needs to count as speech now. */
  private threshold(): number {
    return Math.max(this.noiseDb + this.o.marginDb, this.o.minSpeechDb);
  }

  level(): SegmenterLevel {
    return { db: this.lastDb, noiseDb: this.noiseDb, speaking: this.speaking };
  }

  /** Add samples; returns the utterances they completed. */
  push(chunk: Float32Array): Utterance[] {
    const all = new Float32Array(this.pending.length + chunk.length);
    all.set(this.pending);
    all.set(chunk, this.pending.length);
    const out: Utterance[] = [];
    let at = 0;
    while (all.length - at >= this.frameLen) {
      const samples = all.slice(at, at + this.frameLen);
      at += this.frameLen;
      const u = this.frame({ samples, db: frameDb(samples), index: this.frameIndex++ });
      if (u) out.push(u);
    }
    this.pending = all.slice(at);
    return out;
  }

  /** End whatever is being collected (the input stopped). */
  flush(): Utterance[] {
    const out: Utterance[] = [];
    if (this.speaking && this.current.length > 0) out.push(this.emit(this.current, 'flush'));
    this.reset();
    return out;
  }

  reset(): void {
    this.pending = new Float32Array(0);
    this.preRoll = [];
    this.current = [];
    this.speaking = false;
    this.loudRun = 0;
    this.quietRun = 0;
    this.calibrating = 0;
  }

  private frame(f: Frame): Utterance | null {
    this.lastDb = f.db;
    if (this.calibrating < this.frames(CALIBRATE_MS)) {
      // The room's floor is the quietest of the first frames (it may hum from the start).
      this.noiseDb = this.calibrating === 0 ? f.db : Math.min(this.noiseDb, f.db);
      this.calibrating += 1;
      this.preRoll.push(f);
      if (this.preRoll.length > this.frames(this.o.preRollMs)) this.preRoll.shift();
      return null;
    }
    const loud = f.db >= this.threshold();
    if (!this.speaking) {
      this.track(f.db, loud);
      this.preRoll.push(f);
      if (this.preRoll.length > this.frames(this.o.preRollMs) + this.frames(this.o.minSpeechMs))
        this.preRoll.shift();
      this.loudRun = loud ? this.loudRun + 1 : 0;
      if (this.loudRun >= this.frames(this.o.minSpeechMs)) {
        this.speaking = true;
        this.quietRun = 0;
        this.current = this.preRoll;
        this.preRoll = [];
      }
      return null;
    }
    this.current.push(f);
    // A sound that never stops (a fan switched on mid-sentence) slowly becomes the floor.
    this.noiseDb += (f.db - this.noiseDb) * 0.003;
    // A little below the start threshold keeps a voice that trails off (hysteresis).
    this.quietRun = f.db < this.threshold() - 3 ? this.quietRun + 1 : 0;
    if (this.quietRun >= this.frames(this.o.endSilenceMs)) {
      const keep = this.current.length - this.quietRun + this.frames(this.o.tailMs);
      const u = this.emit(this.current.slice(0, Math.max(1, keep)), 'pause');
      this.speaking = false;
      this.loudRun = 0;
      this.preRoll = this.current.slice(-this.frames(this.o.preRollMs));
      this.current = [];
      return u;
    }
    if (this.current.length >= this.frames(this.o.maxMs)) {
      // Cut at the quietest frame near the end, and carry on with the rest.
      const from = Math.max(1, this.current.length - this.frames(this.o.cutSearchMs));
      let cut = from;
      for (let i = from; i < this.current.length; i++) {
        if ((this.current[i]?.db ?? 0) < (this.current[cut]?.db ?? 0)) cut = i;
      }
      const u = this.emit(this.current.slice(0, cut + 1), 'max');
      this.current = this.current.slice(cut + 1);
      return u;
    }
    return null;
  }

  /** The noise floor follows quiet quickly and loudness slowly (a long hum becomes the floor). */
  private track(db: number, loud: boolean): void {
    if (db < this.noiseDb) this.noiseDb += (db - this.noiseDb) * 0.3;
    else if (!loud) this.noiseDb += (db - this.noiseDb) * 0.02;
    else this.noiseDb += (db - this.noiseDb) * 0.002;
  }

  private emit(frames: readonly Frame[], reason: Utterance['reason']): Utterance {
    const first = frames[0]?.index ?? this.frameIndex;
    const last = frames[frames.length - 1]?.index ?? first;
    return {
      samples: join(frames),
      startMs: this.ms(first),
      endMs: this.ms(last + 1),
      reason,
    };
  }
}

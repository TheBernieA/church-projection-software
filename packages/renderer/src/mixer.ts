import { dbToGain, type Mixer, type MixerBus, type MixerChannel } from '@lampstand/core';
import { isReleased, trySetSink } from './dom';
import { DUCK_DOWN_SEC, DUCK_UP_SEC, DuckFollower } from './ducking';
import { RAW_AUDIO } from './inputs';
import { HPF_OFF_HZ, type FilterStage } from './eqFilters';
import { LoudnessMeter, type Loudness } from './loudness';
import { spectrumBands } from './spectrum';
import { autoMakeupDb, stripSettings, triggersDucking, type MixBus } from './stripSettings';

export { autoMakeupDb, type MixBus } from './stripSettings';
export type { Loudness } from './loudness';

/** Peak and RMS levels (linear, 0…1+) per channel, after its fader, and for the whole mix. */
export interface MixerLevels {
  channels: Record<string, [peak: number, rms: number]>;
  bus: [peak: number, rms: number];
  /** The finished mix, left and right. */
  sides: [left: [peak: number, rms: number], right: [peak: number, rms: number]];
  /**
   * What each channel's dynamics are doing, in dB (0 or less): the compressor's gain reduction
   * and how far ducking has it down.
   */
  dyn: Record<string, [compressor: number, duck: number]>;
  /** The finished mix's loudness (LUFS), once the loudness processor runs. */
  loudness: Loudness | null;
  /**
   * The watched channel's spectrum (`setScope`), as dB bands from 20 Hz to 20 kHz: going into
   * its EQ and coming out of it.
   */
  spectrum: { id: string; pre: number[]; post: number[] } | null;
}

/** Where a channel's sound comes from in this window. */
type SourceKind = 'tracks' | 'video';

/** The gate and loudness processors' module (set by each page: `setMixerWorklet`). */
let workletUrl: string | null = null;
const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

/** Where the mixer's worklet module is (the page's bundled URL for it). */
export function setMixerWorklet(url: string): void {
  workletUrl = url;
}

function loadWorklet(ctx: BaseAudioContext): Promise<void> | null {
  if (!workletUrl) return null;
  let p = loaded.get(ctx);
  if (!p) {
    p = ctx.audioWorklet.addModule(workletUrl);
    loaded.set(ctx, p);
  }
  return p;
}

/** Ducking follows the voices this often. */
const DUCK_TICK_MS = 20;

function readLevel(a: AnalyserNode, buf: Float32Array<ArrayBuffer>): [number, number] {
  a.getFloatTimeDomainData(buf);
  let peak = 0;
  let sum = 0;
  for (const v of buf) {
    const x = Math.abs(v);
    if (x > peak) peak = x;
    sum += v * v;
  }
  return [peak, Math.sqrt(sum / buf.length)];
}

const toDb = (gain: number): number => (gain > 0 ? 20 * Math.log10(gain) : -Infinity);

/** Ramp a parameter (no zipper noise when a fader moves). */
function ramp(p: AudioParam, value: number, ctx: BaseAudioContext, tau = 0.015): void {
  if (Math.abs(p.value - value) < 1e-4) return;
  p.setTargetAtTime(value, ctx.currentTime, tau);
}

function biquad(
  ctx: BaseAudioContext,
  type: BiquadFilterType,
  hz: number,
  q = 1,
): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  return f;
}

/** Set a biquad to a stage (its type only when it changes; a type change is a rare click). */
function setStage(f: BiquadFilterNode, s: FilterStage, ctx: BaseAudioContext): void {
  if (f.type !== s.type) f.type = s.type;
  ramp(f.frequency, Math.min(s.hz, ctx.sampleRate / 2), ctx);
  ramp(f.Q, s.q, ctx);
  ramp(f.gain, s.db, ctx);
}

/** The EQ window's analysers: what goes into the EQ and what comes out. */
const SCOPE_FFT = 8192;

/**
 * One channel strip: input (a sum of its sources, with trim and polarity) → mono fold → sync
 * delay → gate → low cut → high cut → six EQ bands → compressor → make-up → duck → pan →
 * fader → send to the bus. A meter reads it after the fader (before mute, so you can see
 * a muted mic is working).
 */
class Strip {
  readonly input: GainNode;
  private readonly split: ChannelSplitterNode;
  private readonly fold: ChannelMergerNode;
  private readonly delay: DelayNode;
  /** The gate goes after this once its processor has loaded. */
  private readonly gateIn: GainNode;
  private gate: AudioWorkletNode | null = null;
  /** The low cut's biquads, then the high cut's, then the bands. */
  private readonly hpf: BiquadFilterNode[];
  private readonly lpf: BiquadFilterNode[];
  private readonly bands: BiquadFilterNode[];
  /** Where the EQ starts and ends (the scope listens here). */
  private readonly eqIn: AudioNode;
  private readonly eqOut: AudioNode;
  private scope: { pre: AnalyserNode; post: AnalyserNode } | null = null;
  readonly comp: DynamicsCompressorNode;
  private readonly makeup: GainNode;
  readonly duck: GainNode;
  private readonly pan: StereoPannerNode;
  private readonly fader: GainNode;
  private readonly send: GainNode;
  readonly meter: AnalyserNode;
  readonly follower = new DuckFollower();
  private mono = false;
  /** The device gives one channel (most built-in and USB mics): it's folded to both sides. */
  nativeMono = false;
  last: MixerChannel | null = null;
  private bus: MixBus = 'room';
  /** A live input's device stream, while it's open. */
  device: {
    id: string;
    denoise: boolean;
    stream: MediaStream | null;
    source: MediaStreamAudioSourceNode | null;
  } | null = null;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
  ) {
    const c = ctx;
    this.input = c.createGain();
    this.split = c.createChannelSplitter(2);
    this.fold = c.createChannelMerger(2);
    this.delay = c.createDelay(1.05);
    this.gateIn = c.createGain();
    this.hpf = Array.from({ length: 4 }, () => biquad(c, 'highpass', HPF_OFF_HZ, -3));
    this.lpf = Array.from({ length: 4 }, () => biquad(c, 'lowpass', c.sampleRate / 2, -3));
    this.bands = Array.from({ length: 6 }, () => biquad(c, 'peaking', 1000));
    this.comp = c.createDynamicsCompressor();
    this.makeup = c.createGain();
    this.duck = c.createGain();
    this.pan = c.createStereoPanner();
    this.fader = c.createGain();
    this.send = c.createGain();
    this.send.gain.value = 0;
    this.meter = c.createAnalyser();
    this.meter.fftSize = 1024;
    this.split.connect(this.fold, 0, 0);
    this.split.connect(this.fold, 0, 1);
    this.input.connect(this.delay);
    this.fold.connect(this.delay);
    const chain = [...this.hpf, ...this.lpf, ...this.bands];
    for (let i = 1; i < chain.length; i++) chain[i - 1]?.connect(chain[i] as AudioNode);
    this.eqIn = chain[0] as AudioNode;
    this.eqOut = chain[chain.length - 1] as AudioNode;
    this.delay.connect(this.gateIn).connect(this.eqIn);
    this.eqOut.connect(this.comp);
    this.comp.connect(this.makeup).connect(this.duck).connect(this.pan).connect(this.fader);
    this.fader.connect(this.meter);
    this.fader.connect(this.send).connect(out);
  }

  /** The gate's processor has loaded: put it in the chain. */
  addGate(): void {
    if (this.gate) return;
    this.gate = new AudioWorkletNode(this.ctx, 'lampstand-gate', {
      outputChannelCount: [2],
    });
    this.gateIn.disconnect();
    this.gateIn.connect(this.gate).connect(this.eqIn);
    this.reapply();
  }

  apply(c: MixerChannel, bus: MixBus): void {
    const ctx = this.ctx;
    this.last = c;
    this.bus = bus;
    const p = stripSettings(c, bus);
    // Mono: both sides hear the first input (a mic plugged into input 1 of a stereo device, or
    // a one-channel mic, which would otherwise be panned to the middle 3 dB quieter).
    const mono = c.mono || this.nativeMono;
    if (mono !== this.mono) {
      this.mono = mono;
      this.input.disconnect();
      this.input.connect(mono ? this.split : this.delay);
    }
    ramp(this.input.gain, p.trim, ctx);
    ramp(this.delay.delayTime, p.delaySec, ctx, 0.05);
    this.gate?.parameters.get('threshold')?.setValueAtTime(p.gateDb, ctx.currentTime);
    const stages = [...p.hpf, ...p.lpf, ...p.bands];
    [...this.hpf, ...this.lpf, ...this.bands].forEach((f, i) => {
      const s = stages[i];
      if (s) setStage(f, s, ctx);
    });
    this.comp.threshold.value = p.comp.thresholdDb;
    this.comp.ratio.value = p.comp.ratio;
    this.comp.knee.value = p.comp.kneeDb;
    this.comp.attack.value = p.comp.attackSec;
    this.comp.release.value = p.comp.releaseSec;
    ramp(this.makeup.gain, p.makeup, ctx);
    if (!c.duck.on) ramp(this.duck.gain, 1, ctx, DUCK_UP_SEC);
    ramp(this.pan.pan, p.pan, ctx);
    ramp(this.fader.gain, p.fader, ctx);
    ramp(this.send.gain, p.send, ctx);
  }

  /** Dip (or come back up) for ducking. */
  setDucked(down: boolean, amountDb: number): void {
    const target = down ? dbToGain(-amountDb) : 1;
    ramp(this.duck.gain, target, this.ctx, down ? DUCK_DOWN_SEC : DUCK_UP_SEC);
  }

  /** Apply the channel again (its device turned out to be mono, or the gate arrived). */
  reapply(): void {
    if (this.last) this.apply(this.last, this.bus);
  }

  /** Start or stop measuring this strip's spectrum, before and after its EQ. */
  watch(on: boolean): void {
    if (on === !!this.scope) return;
    if (!on) {
      this.scope?.pre.disconnect();
      this.scope?.post.disconnect();
      this.scope = null;
      return;
    }
    const analyser = (): AnalyserNode => {
      const a = this.ctx.createAnalyser();
      a.fftSize = SCOPE_FFT;
      a.smoothingTimeConstant = 0.55;
      a.minDecibels = -120;
      a.maxDecibels = 0;
      return a;
    };
    this.scope = { pre: analyser(), post: analyser() };
    this.eqIn.connect(this.scope.pre);
    this.eqOut.connect(this.scope.post);
  }

  /** The spectrum in and out of the EQ, or null when not watched. */
  spectrum(buf: Float32Array<ArrayBuffer>): { pre: number[]; post: number[] } | null {
    if (!this.scope) return null;
    const read = (a: AnalyserNode): number[] => {
      a.getFloatFrequencyData(buf);
      return spectrumBands(buf, this.ctx.sampleRate);
    };
    return { pre: read(this.scope.pre), post: read(this.scope.post) };
  }

  closeDevice(): void {
    this.device?.source?.disconnect();
    for (const t of this.device?.stream?.getTracks() ?? []) t.stop();
    this.device = null;
  }

  dispose(): void {
    this.closeDevice();
    this.watch(false);
    this.send.disconnect();
    this.input.disconnect();
    this.gate?.disconnect();
  }
}

export interface MixerEngineOptions {
  bus: MixBus;
  /** Use this context (the stream window's, which taps its output); else one is made. */
  ctx?: AudioContext;
  /** Play the mix on this window's speakers (room, cue). Off: only `output` carries it. */
  speakers?: boolean;
  /**
   * Open every input, even ones not sent to this bus, so each channel's meter works (the room
   * engine, which the mixer's meters read). Off: only inputs this bus uses are opened.
   */
  openAllInputs?: boolean;
}

/**
 * The bus limiter is hard (20:1). The Web Audio compressor isn't a perfect brickwall (fast peaks
 * slip a little past it), so the stream's sound tap clips anything left over.
 */
const LIMIT_RATIO = 20;

/**
 * The sound desk for one mix, in one window: every channel's strip, summed into a bus with
 * its master level, safety limiter and lip-sync delay, ducking that follows the voices, and a
 * loudness meter on the finished mix. The room's engine runs in the main output (or the control
 * window with no output), the stream's in the stream window, and the cue (solo) engine in the
 * control window for headphones.
 */
export class MixerEngine {
  readonly ctx: AudioContext;
  /** The finished mix (after the bus); also on the speakers when `speakers` is set. */
  readonly output: GainNode;
  private readonly sum: GainNode;
  private readonly busGain: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly delay: DelayNode;
  /** The finished mix's meters, left and right. */
  private readonly sideMeters: [AnalyserNode, AnalyserNode];
  private readonly strips = new Map<string, Strip>();
  private readonly sources: Record<SourceKind, Set<MediaElementAudioSourceNode>> = {
    tracks: new Set(),
    video: new Set(),
  };
  private readonly tapped = new WeakSet<HTMLMediaElement>();
  private mixer: Mixer | null = null;
  private meterTimer: ReturnType<typeof setInterval> | null = null;
  private duckTimer: ReturnType<typeof setInterval> | null = null;
  private readonly buf: Float32Array<ArrayBuffer>;
  private readonly fftBuf = new Float32Array(SCOPE_FFT / 2);
  /** The channel whose spectrum is measured (the EQ window's), or null. */
  private scope: string | null = null;
  private readonly loudness = new LoudnessMeter();
  private loudnessOn = false;
  private workletReady = false;
  private disposed = false;

  constructor(
    private readonly win: Window,
    private readonly opts: MixerEngineOptions,
  ) {
    const Ctx = (win as Window & { AudioContext: typeof AudioContext }).AudioContext;
    this.ctx = opts.ctx ?? new Ctx({ latencyHint: 'interactive', sampleRate: 48_000 });
    const c = this.ctx;
    this.sum = c.createGain();
    this.busGain = c.createGain();
    this.limiter = c.createDynamicsCompressor();
    this.delay = c.createDelay(1.5);
    const side = (): AnalyserNode => {
      const a = c.createAnalyser();
      a.fftSize = 1024;
      return a;
    };
    this.sideMeters = [side(), side()];
    this.output = c.createGain();
    this.sum.connect(this.busGain).connect(this.limiter).connect(this.delay).connect(this.output);
    const split = c.createChannelSplitter(2);
    this.output.connect(split);
    split.connect(this.sideMeters[0], 0);
    split.connect(this.sideMeters[1], 1);
    if (opts.speakers) this.output.connect(c.destination);
    this.buf = new Float32Array(1024);
    void loadWorklet(c)
      ?.then(() => this.onWorklet())
      .catch(() => undefined);
  }

  /** The gate and loudness processors are in: give every strip its gate, start measuring. */
  private onWorklet(): void {
    if (this.disposed) return;
    this.workletReady = true;
    for (const s of this.strips.values()) s.addGate();
    if (this.opts.bus === 'cue') return;
    // K-weighting (BS.1770): a high shelf (+4 dB above ~1.7 kHz, the head's effect) and a
    // high-pass at ~38 Hz, then 100 ms blocks of mean square from the processor.
    const c = this.ctx;
    const shelf = biquad(c, 'highshelf', 1681.97, 0.7072);
    shelf.gain.value = 4;
    const hp = biquad(c, 'highpass', 38.13, 0.5);
    const meter = new AudioWorkletNode(c, 'lampstand-loudness', {
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    meter.port.onmessage = (e: MessageEvent<number>) => this.loudness.add(e.data);
    this.output.connect(shelf).connect(hp).connect(meter);
    // A worklet that outputs nothing still has to be pulled by the graph to run.
    const silent = c.createGain();
    silent.gain.value = 0;
    meter.connect(silent).connect(c.destination);
    this.loudnessOn = true;
  }

  /** Start the integrated loudness again (a new service or stream). */
  resetLoudness(): void {
    this.loudness.reset();
  }

  /** The output device for the speakers ('' = the default). */
  setSink(sinkId: string): void {
    trySetSink(this.ctx, sinkId);
  }

  /** Feed a media element's sound into the tracks or video channel (once per element). */
  attach(kind: SourceKind, el: HTMLMediaElement): void {
    if (this.tapped.has(el) || this.disposed) return;
    this.tapped.add(el);
    // Let go of videos the renderer has retired (each would stay in memory). Only those: the
    // track player's element is never on the page at all.
    for (const set of Object.values(this.sources))
      for (const s of set)
        if (isReleased(s.mediaElement)) {
          s.disconnect();
          set.delete(s);
        }
    const src = this.ctx.createMediaElementSource(el);
    this.sources[kind].add(src);
    const strip = this.stripFor(kind);
    if (strip) src.connect(strip.input);
  }

  private stripFor(kind: SourceKind): Strip | undefined {
    const c = this.mixer?.channels.find((x) => x.kind === kind);
    return c ? this.strips.get(c.id) : undefined;
  }

  /** Measure this channel's spectrum (the EQ window shows it), or none. */
  setScope(id: string | null): void {
    this.scope = id;
    for (const [sid, s] of this.strips) s.watch(sid === id);
  }

  /** Follow the mixer: build, change or remove strips, open and close inputs. */
  sync(m: Mixer): void {
    if (this.disposed) return;
    this.mixer = m;
    const bus = this.opts.bus;
    const seen = new Set<string>();
    for (const c of m.channels) {
      seen.add(c.id);
      let strip = this.strips.get(c.id);
      if (!strip) {
        strip = new Strip(this.ctx, this.sum);
        this.strips.set(c.id, strip);
        if (this.workletReady) strip.addGate();
        if (c.kind !== 'input') for (const s of this.sources[c.kind]) s.connect(strip.input);
      }
      strip.apply(c, bus);
      strip.watch(c.id === this.scope);
      if (c.kind === 'input') this.syncDevice(strip, c);
    }
    for (const [id, strip] of this.strips)
      if (!seen.has(id)) {
        strip.dispose();
        this.strips.delete(id);
      }
    this.applyBus(bus === 'cue' ? null : m[bus]);
    this.syncDucking(m);
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  private applyBus(b: MixerBus | null): void {
    const c = this.ctx;
    ramp(this.busGain.gain, b ? (b.mute ? 0 : dbToGain(b.gainDb)) : 1, c);
    const limit = b ? b.limiter : true;
    const ceiling = b?.ceilingDb ?? -1.5;
    this.limiter.threshold.value = limit ? ceiling : 0;
    this.limiter.ratio.value = limit ? LIMIT_RATIO : 1;
    // Without the limiter's own makeup gain, its ceiling is where it's set (not half a dB over).
    this.output.gain.value = limit ? dbToGain(-autoMakeupDb(ceiling, LIMIT_RATIO)) : 1;
    this.limiter.knee.value = 0;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.08;
    this.delay.delayTime.value = (b?.delayMs ?? 0) / 1000;
  }

  /** Follow the voices while any channel ducks; stop when none does. */
  private syncDucking(m: Mixer): void {
    const any = m.channels.some((c) => c.duck.on);
    if (any && !this.duckTimer) this.duckTimer = setInterval(() => this.duckTick(), DUCK_TICK_MS);
    if (!any && this.duckTimer) {
      clearInterval(this.duckTimer);
      this.duckTimer = null;
    }
  }

  /** Each ducking channel dips while another channel's voice is above its threshold. */
  private duckTick(): void {
    const channels = this.mixer?.channels ?? [];
    const voices: { id: string; db: number }[] = [];
    for (const c of channels) {
      const strip = this.strips.get(c.id);
      if (strip && triggersDucking(c))
        voices.push({ id: c.id, db: toDb(readLevel(strip.meter, this.buf)[0]) });
    }
    const now = performance.now();
    for (const c of channels) {
      if (!c.duck.on) continue;
      const strip = this.strips.get(c.id);
      if (!strip) continue;
      const loudest = voices.reduce((a, v) => (v.id !== c.id && v.db > a ? v.db : a), -Infinity);
      strip.setDucked(strip.follower.next(loudest, c.duck.thresholdDb, now), c.duck.amountDb);
    }
  }

  /** Open an input's device when this bus needs it (or for its meter); close it otherwise. */
  private syncDevice(strip: Strip, c: MixerChannel): void {
    const bus = this.opts.bus;
    const wanted =
      !!c.deviceId && (this.opts.openAllInputs || (bus === 'cue' ? c.solo : c[bus] && !c.mute));
    if (!wanted) return strip.closeDevice();
    if (strip.device?.id === c.deviceId && strip.device.denoise === c.denoise) return;
    strip.closeDevice();
    const device: NonNullable<Strip['device']> = {
      id: c.deviceId,
      denoise: c.denoise,
      stream: null,
      source: null,
    };
    strip.device = device;
    void this.win.navigator.mediaDevices
      .getUserMedia({
        audio: {
          deviceId: { exact: c.deviceId },
          ...RAW_AUDIO,
          // The computer's noise suppression, when asked for (fans, hiss).
          noiseSuppression: c.denoise,
          channelCount: { ideal: 2 },
        },
        video: false,
      })
      .then((stream) => {
        if (strip.device !== device || this.disposed) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        device.stream = stream;
        device.source = this.ctx.createMediaStreamSource(stream);
        device.source.connect(strip.input);
        const channels = stream.getAudioTracks()[0]?.getSettings().channelCount;
        strip.nativeMono = channels === 1;
        strip.reapply();
      })
      .catch(() => undefined);
  }

  /** Current levels: each channel after its fader, the finished mix, dynamics, loudness. */
  levels(): MixerLevels {
    const channels: MixerLevels['channels'] = {};
    const dyn: MixerLevels['dyn'] = {};
    for (const [id, s] of this.strips) {
      channels[id] = readLevel(s.meter, this.buf);
      const duck = toDb(s.duck.gain.value);
      dyn[id] = [Math.min(0, s.comp.reduction), Number.isFinite(duck) ? Math.min(0, duck) : -60];
    }
    const left = readLevel(this.sideMeters[0], this.buf);
    const right = readLevel(this.sideMeters[1], this.buf);
    const bus: [number, number] = [
      Math.max(left[0], right[0]),
      Math.sqrt((left[1] ** 2 + right[1] ** 2) / 2),
    ];
    const watched = this.scope ? this.strips.get(this.scope) : undefined;
    const spectrum = watched?.spectrum(this.fftBuf);
    return {
      channels,
      bus,
      sides: [left, right],
      dyn,
      loudness: this.loudnessOn ? this.loudness.read() : null,
      spectrum: spectrum && this.scope ? { id: this.scope, ...spectrum } : null,
    };
  }

  /** Report levels about `hz` times a second (for the mixer's meters). */
  startMeters(report: (l: MixerLevels) => void, hz = 15): void {
    this.stopMeters();
    this.meterTimer = setInterval(() => report(this.levels()), 1000 / hz);
  }

  stopMeters(): void {
    if (this.meterTimer) clearInterval(this.meterTimer);
    this.meterTimer = null;
  }

  destroy(): void {
    this.disposed = true;
    this.stopMeters();
    if (this.duckTimer) clearInterval(this.duckTimer);
    this.duckTimer = null;
    for (const s of this.strips.values()) s.dispose();
    this.strips.clear();
    if (!this.opts.ctx) void this.ctx.close().catch(() => undefined);
  }
}

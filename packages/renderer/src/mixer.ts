import { dbToGain, sendGain, type Mixer, type MixerBus, type MixerChannel } from '@lampstand/core';
import { RAW_AUDIO } from './inputs';

/** Which mix an engine makes: the room's, the stream's, or the operator's headphones (solo). */
export type MixBus = 'room' | 'stream' | 'cue';

/** Peak and RMS levels (linear, 0…1+) per channel, after its fader, and for the whole mix. */
export interface MixerLevels {
  channels: Record<string, [peak: number, rms: number]>;
  bus: [peak: number, rms: number];
  /** The finished mix, left and right. */
  sides: [left: [peak: number, rms: number], right: [peak: number, rms: number]];
}

/** Where a channel's sound comes from in this window. */
type SourceKind = 'tracks' | 'video';

const HPF_HZ = 80;
/**
 * The bus limiter: a ceiling of −1.5 dBFS, hard (20:1). The Web Audio compressor isn't a perfect
 * brickwall (fast peaks slip a little past it), so it sits a little under −1 and the stream's
 * sound tap clips anything left over.
 */
const LIMIT_DB = -1.5;
const LIMIT_RATIO = 20;

/** Point a context at an output device (Chromium's AudioContext.setSinkId). */
function routeContext(ctx: AudioContext, sinkId: string): void {
  const c = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  void c.setSinkId?.(sinkId).catch(() => undefined);
}

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

/** Ramp a parameter (no zipper noise when a fader moves). */
function ramp(p: AudioParam, value: number, ctx: BaseAudioContext): void {
  if (Math.abs(p.value - value) < 1e-4) return;
  p.setTargetAtTime(value, ctx.currentTime, 0.015);
}

/**
 * The gain a Web Audio compressor adds by itself, in dB. The spec's DynamicsCompressorNode
 * applies an automatic makeup gain of (1 / its gain at full scale)^0.6, so a compressor with a
 * low threshold makes things much louder (about +7 dB at −18 dB and 3:1) and the limiter adds
 * half a dB. Taking it back out makes the makeup knob (and the limiter's ceiling) mean what they
 * say.
 */
export function autoMakeupDb(thresholdDb: number, ratio: number): number {
  // A 0 dBFS input comes out at threshold + (0 − threshold) / ratio.
  const fullScaleGainDb = thresholdDb * (1 - 1 / ratio);
  return -0.6 * fullScaleGainDb;
}

/**
 * One channel strip: input (a sum of its sources) → mono fold → high-pass → low shelf → mid
 * bell → high shelf → compressor → make-up → pan → send to the bus. A meter reads it after
 * the fader (before mute, so you can see a muted mic is working).
 */
class Strip {
  readonly input: GainNode;
  private readonly split: ChannelSplitterNode;
  private readonly fold: ChannelMergerNode;
  private readonly hpf: BiquadFilterNode;
  private readonly low: BiquadFilterNode;
  private readonly mid: BiquadFilterNode;
  private readonly high: BiquadFilterNode;
  private readonly comp: DynamicsCompressorNode;
  private readonly makeup: GainNode;
  private readonly pan: StereoPannerNode;
  private readonly fader: GainNode;
  private readonly send: GainNode;
  readonly meter: AnalyserNode;
  private mono = false;
  /** The device gives one channel (most built-in and USB mics): it's folded to both sides. */
  nativeMono = false;
  private last: { c: MixerChannel; bus: MixBus } | null = null;
  /** A live input's device stream, while it's open. */
  device: {
    id: string;
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
    this.hpf = c.createBiquadFilter();
    this.hpf.type = 'highpass';
    this.hpf.frequency.value = 10;
    this.low = c.createBiquadFilter();
    this.low.type = 'lowshelf';
    this.low.frequency.value = 120;
    this.mid = c.createBiquadFilter();
    this.mid.type = 'peaking';
    this.mid.frequency.value = 1000;
    this.mid.Q.value = 0.9;
    this.high = c.createBiquadFilter();
    this.high.type = 'highshelf';
    this.high.frequency.value = 8000;
    this.comp = c.createDynamicsCompressor();
    this.makeup = c.createGain();
    this.pan = c.createStereoPanner();
    this.fader = c.createGain();
    this.send = c.createGain();
    this.send.gain.value = 0;
    this.meter = c.createAnalyser();
    this.meter.fftSize = 1024;
    this.split.connect(this.fold, 0, 0);
    this.split.connect(this.fold, 0, 1);
    this.input.connect(this.hpf);
    this.fold.connect(this.hpf);
    this.hpf.connect(this.low).connect(this.mid).connect(this.high).connect(this.comp);
    this.comp.connect(this.makeup).connect(this.pan).connect(this.fader);
    this.fader.connect(this.meter);
    this.fader.connect(this.send).connect(out);
  }

  apply(c: MixerChannel, bus: MixBus): void {
    const ctx = this.ctx;
    this.last = { c, bus };
    // Mono: both sides hear the first input (a mic plugged into input 1 of a stereo device, or
    // a one-channel mic, which would otherwise be panned to the middle 3 dB quieter).
    const mono = c.mono || this.nativeMono;
    if (mono !== this.mono) {
      this.mono = mono;
      this.input.disconnect();
      this.input.connect(mono ? this.split : this.hpf);
    }
    this.hpf.frequency.value = c.hpf ? HPF_HZ : 10;
    ramp(this.low.gain, c.eq.low, ctx);
    ramp(this.mid.gain, c.eq.mid, ctx);
    ramp(this.high.gain, c.eq.high, ctx);
    const on = c.comp.on;
    this.comp.threshold.value = on ? c.comp.thresholdDb : 0;
    this.comp.ratio.value = on ? c.comp.ratio : 1;
    this.comp.knee.value = on ? 6 : 0;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.15;
    ramp(
      this.makeup.gain,
      on ? dbToGain(c.comp.makeupDb - autoMakeupDb(c.comp.thresholdDb, c.comp.ratio)) : 1,
      ctx,
    );
    ramp(this.pan.pan, c.pan, ctx);
    ramp(this.fader.gain, dbToGain(c.gainDb), ctx);
    // The fader is applied above; the send only opens or closes.
    ramp(this.send.gain, sendGain(c, bus) > 0 ? 1 : 0, ctx);
  }

  /** Apply the channel again (its device turned out to be mono). */
  reapply(): void {
    if (this.last) this.apply(this.last.c, this.last.bus);
  }

  closeDevice(): void {
    this.device?.source?.disconnect();
    for (const t of this.device?.stream?.getTracks() ?? []) t.stop();
    this.device = null;
  }

  dispose(): void {
    this.closeDevice();
    this.send.disconnect();
    this.input.disconnect();
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
 * The sound desk for one mix, in one window: every channel's strip, summed into a bus with
 * its master level, safety limiter and lip-sync delay. The room's engine runs in the main
 * output (or the control window with no output), the stream's in the stream window, and the
 * cue (solo) engine in the control window for headphones.
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
  private readonly sources: Record<SourceKind, Set<AudioNode>> = {
    tracks: new Set(),
    video: new Set(),
  };
  private readonly tapped = new WeakSet<HTMLMediaElement>();
  private mixer: Mixer | null = null;
  private meterTimer: ReturnType<typeof setInterval> | null = null;
  private readonly buf: Float32Array<ArrayBuffer>;
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
  }

  /** The output device for the speakers ('' = the default). */
  setSink(sinkId: string): void {
    routeContext(this.ctx, sinkId);
  }

  /** Feed a media element's sound into the tracks or video channel (once per element). */
  attach(kind: SourceKind, el: HTMLMediaElement): void {
    if (this.tapped.has(el) || this.disposed) return;
    this.tapped.add(el);
    const src = this.ctx.createMediaElementSource(el);
    this.sources[kind].add(src);
    const strip = this.stripFor(kind);
    if (strip) src.connect(strip.input);
  }

  private stripFor(kind: SourceKind): Strip | undefined {
    const c = this.mixer?.channels.find((x) => x.kind === kind);
    return c ? this.strips.get(c.id) : undefined;
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
        if (c.kind !== 'input') for (const s of this.sources[c.kind]) s.connect(strip.input);
      }
      strip.apply(c, bus);
      if (c.kind === 'input') this.syncDevice(strip, c);
    }
    for (const [id, strip] of this.strips)
      if (!seen.has(id)) {
        strip.dispose();
        this.strips.delete(id);
      }
    this.applyBus(bus === 'cue' ? null : m[bus]);
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  private applyBus(b: MixerBus | null): void {
    const c = this.ctx;
    ramp(this.busGain.gain, b ? (b.mute ? 0 : dbToGain(b.gainDb)) : 1, c);
    const limit = b ? b.limiter : true;
    this.limiter.threshold.value = limit ? LIMIT_DB : 0;
    this.limiter.ratio.value = limit ? LIMIT_RATIO : 1;
    // Without the limiter's own makeup gain, its ceiling is where it's set (not half a dB over).
    this.output.gain.value = limit ? dbToGain(-autoMakeupDb(LIMIT_DB, LIMIT_RATIO)) : 1;
    this.limiter.knee.value = 0;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.08;
    this.delay.delayTime.value = (b?.delayMs ?? 0) / 1000;
  }

  /** Open an input's device when this bus needs it (or for its meter); close it otherwise. */
  private syncDevice(strip: Strip, c: MixerChannel): void {
    const bus = this.opts.bus;
    const wanted =
      !!c.deviceId && (this.opts.openAllInputs || (bus === 'cue' ? c.solo : c[bus] && !c.mute));
    if (!wanted) return strip.closeDevice();
    if (strip.device?.id === c.deviceId) return;
    strip.closeDevice();
    const device: NonNullable<Strip['device']> = { id: c.deviceId, stream: null, source: null };
    strip.device = device;
    void this.win.navigator.mediaDevices
      .getUserMedia({
        audio: { deviceId: { exact: c.deviceId }, ...RAW_AUDIO, channelCount: { ideal: 2 } },
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

  /** Current levels: each channel after its fader, and the finished mix. */
  levels(): MixerLevels {
    const channels: MixerLevels['channels'] = {};
    for (const [id, s] of this.strips) channels[id] = readLevel(s.meter, this.buf);
    const left = readLevel(this.sideMeters[0], this.buf);
    const right = readLevel(this.sideMeters[1], this.buf);
    const bus: [number, number] = [
      Math.max(left[0], right[0]),
      Math.sqrt((left[1] ** 2 + right[1] ** 2) / 2),
    ];
    return { channels, bus, sides: [left, right] };
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
    for (const s of this.strips.values()) s.dispose();
    this.strips.clear();
    if (!this.opts.ctx) void this.ctx.close().catch(() => undefined);
  }
}

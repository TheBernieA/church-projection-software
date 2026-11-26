import { dbToGain, sendGain, type MixerChannel } from '@lampstand/core';
import { eqStages, type FilterStage } from './eqFilters';

/** Which mix an engine makes: the room's, the stream's, or the operator's headphones (solo). */
export type MixBus = 'room' | 'stream' | 'cue';

/** The gate's threshold that lets everything through. */
export const GATE_OFF = -100;
/** The Web Audio compressor lets go in at most 1 s. */
const MAX_RELEASE_SEC = 1;

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
 * What a channel's settings mean for its strip, as plain numbers (the strip only sets them). A
 * section that's off gets values that leave the sound as it is, so switching it never rewires
 * anything (no clicks).
 */
export interface StripSettings {
  /** Input gain, negative when the polarity is flipped. */
  trim: number;
  delaySec: number;
  gateDb: number;
  /** The low cut's four biquads, then the high cut's, then the six EQ bands. */
  hpf: FilterStage[];
  lpf: FilterStage[];
  bands: FilterStage[];
  comp: {
    thresholdDb: number;
    ratio: number;
    kneeDb: number;
    attackSec: number;
    releaseSec: number;
  };
  makeup: number;
  pan: number;
  fader: number;
  /** 1: this channel goes into the bus; 0: it doesn't (muted, not routed, not soloed). */
  send: number;
}

export function stripSettings(c: MixerChannel, bus: MixBus): StripSettings {
  const comp = c.comp.on;
  const trim = dbToGain(c.trimDb);
  return {
    trim: c.invert ? -trim : trim,
    delaySec: c.delayMs / 1000,
    gateDb: c.gate.on ? c.gate.thresholdDb : GATE_OFF,
    ...eqStages(c),
    comp: comp
      ? {
          thresholdDb: c.comp.thresholdDb,
          ratio: c.comp.ratio,
          kneeDb: 6,
          attackSec: c.comp.attackMs / 1000,
          releaseSec: Math.min(MAX_RELEASE_SEC, c.comp.releaseMs / 1000),
        }
      : { thresholdDb: 0, ratio: 1, kneeDb: 0, attackSec: 0.005, releaseSec: 0.15 },
    makeup: comp ? dbToGain(c.comp.makeupDb - autoMakeupDb(c.comp.thresholdDb, c.comp.ratio)) : 1,
    pan: c.pan,
    fader: dbToGain(c.gainDb),
    // The fader is applied in the strip; the send only opens or closes.
    send: sendGain(c, bus) > 0 ? 1 : 0,
  };
}

/** Does this channel's voice make ducking channels dip (when it's live and not muted)? */
export const triggersDucking = (c: MixerChannel): boolean =>
  c.kind === 'input' && c.ducksOthers && !c.mute;

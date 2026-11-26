import { z } from 'zod';
import {
  InputTransitionSchema,
  PipLayerSchema,
  VideoInputLayerSchema,
  type InputTransition,
  type Scene,
  type StreamCut,
  type VideoInputLayer,
} from './schemas/scene';
import type { LiveState } from './live';
import { omit } from './utils/object';

/**
 * Where a take goes: the screens and the stream together (the default), the screens (the
 * projectors) alone, or the livestream alone (with its recording and NDI feeds).
 */
export const SWITCH_TARGETS = ['both', 'screens', 'stream'] as const;
export type SwitchTarget = (typeof SWITCH_TARGETS)[number];
const To = z.enum(SWITCH_TARGETS).optional();

/**
 * The video switcher (`live.switcher`): cameras go to Preview, then Cut or Auto (with a
 * transition) takes Preview to Program — and what was on Program comes back to Preview, as on
 * any vision mixer. The T-bar mixes by hand; picture-in-picture puts a second camera in a corner.
 * A take can go to the screens and the stream together, or to one of them: then they show
 * different cameras until one is taken to both again, or Link joins them.
 */
export const SwitcherActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('preview'), input: VideoInputLayerSchema.nullable() }),
  /** Preview to Program at once. */
  z.object({ action: z.literal('cut'), to: To }),
  /** Preview to Program with a transition. */
  z.object({ action: z.literal('auto'), transition: InputTransitionSchema, to: To }),
  /** A camera straight to Program (no Preview step), with a transition or cut. */
  z.object({
    action: z.literal('take'),
    input: VideoInputLayerSchema.nullable(),
    transition: InputTransitionSchema.optional(),
    to: To,
  }),
  /** The T-bar at `pos` (0 = Program only, 1 = Preview fully over it). */
  z.object({ action: z.literal('tbar'), pos: z.number().min(0).max(1), to: To }),
  /** The T-bar let go: past half-way it finishes the take, otherwise it goes back. */
  z.object({ action: z.literal('tbarRelease'), to: To }),
  z.object({ action: z.literal('pip'), pip: PipLayerSchema.nullable() }),
  /** The stream shows the screens' camera again. */
  z.object({ action: z.literal('link') }),
]);
export type SwitcherAction = z.infer<typeof SwitcherActionSchema>;

const sameInput = (a: VideoInputLayer | null | undefined, b: VideoInputLayer | null | undefined) =>
  (a?.deviceId ?? null) === (b?.deviceId ?? null);

/** Put a camera on Program (a camera takes the media layer; slide text stays on top). */
function onProgram(
  program: Scene,
  input: VideoInputLayer | null,
  transition: InputTransition | undefined,
): Scene {
  const next: Scene = {
    ...omit(program, 'inputTransition'),
    input,
    inputNext: null,
    media: input ? null : program.media,
  };
  if (transition && transition.kind !== 'cut') next.inputTransition = transition;
  return next;
}

/** One bus's camera: the screens' (Program) or the stream's own. */
type Bus = Pick<Scene, 'input' | 'inputNext' | 'inputTransition'>;

/** The stream's camera now: its own, or the screens' while they're linked. */
export function streamBus(s: LiveState): StreamCut {
  if (s.streamCut) return s.streamCut;
  const p = s.program;
  return { input: p.input ?? null, inputNext: p.inputNext ?? null };
}

/** The camera on a destination now (for the stream: its own, or the screens'). */
export function cameraOn(s: LiveState, to: 'screens' | 'stream'): VideoInputLayer | null {
  return to === 'stream' ? streamBus(s).input : (s.program.input ?? null);
}

/** A camera on a bus, with how it got there (a cut leaves no transition). */
function busWith(input: VideoInputLayer | null, transition: InputTransition | undefined): Bus {
  const next: Bus = { input, inputNext: null };
  if (transition && transition.kind !== 'cut') next.inputTransition = transition;
  return next;
}

/** Apply a take to the stream's own camera (splitting it from the screens first). */
const toStream = (bus: Bus): StreamCut => ({
  input: bus.input ?? null,
  inputNext: bus.inputNext ?? null,
  ...(bus.inputTransition ? { inputTransition: bus.inputTransition } : {}),
});

/** A take to `to`: the screens (Program), the stream, or both (linked again). */
function takeTo(
  s: LiveState,
  to: SwitchTarget,
  input: VideoInputLayer | null,
  transition: InputTransition | undefined,
): LiveState {
  if (to === 'stream') return { ...s, streamCut: toStream(busWith(input, transition)) };
  // To the screens alone: the stream keeps the camera it has.
  const streamCut = to === 'screens' ? streamBus(s) : null;
  // Keep what the stream had as a plain camera (its last transition already played).
  const kept: StreamCut | null = streamCut && { input: streamCut.input, inputNext: null };
  return { ...s, program: onProgram(s.program, input, transition), streamCut: kept };
}

export function applySwitcherAction(s: LiveState, a: SwitcherAction): LiveState {
  const p = s.program;
  const preview = s.switcher.preview;
  const to: SwitchTarget = 'to' in a ? (a.to ?? 'both') : 'both';
  // What the take replaces: the stream's camera when going to the stream alone.
  const current = to === 'stream' ? streamBus(s).input : (p.input ?? null);
  // Taking to both while split counts as a change even if the screens already show it.
  const split = to === 'both' && !!s.streamCut && !sameInput(s.streamCut.input, p.input);
  switch (a.action) {
    case 'preview':
      return { ...s, switcher: { preview: a.input } };
    case 'cut':
    case 'auto': {
      if (!preview || (sameInput(preview, current) && !split)) return s;
      return {
        ...takeTo(s, to, preview, a.action === 'auto' ? a.transition : undefined),
        // What was on Program waits on Preview, ready to come back.
        switcher: { preview: current },
      };
    }
    case 'take': {
      const mixing = to === 'stream' ? !!streamBus(s).inputNext : !!p.inputNext;
      if (sameInput(a.input, current) && !mixing && !split) return s;
      return {
        ...takeTo(s, to, a.input, a.transition),
        switcher: { preview: sameInput(preview, a.input) ? current : preview },
      };
    }
    case 'tbar': {
      if (!preview || sameInput(preview, current)) return s;
      const inputNext = a.pos > 0 ? { input: preview, pos: a.pos } : null;
      if (to === 'stream') return { ...s, streamCut: { ...streamBus(s), inputNext } };
      return {
        ...s,
        program: { ...p, inputNext },
        // To the screens alone: the stream holds its camera while the bar moves.
        streamCut: to === 'screens' ? { input: streamBus(s).input, inputNext: null } : s.streamCut,
      };
    }
    case 'tbarRelease': {
      const mix = to === 'stream' ? (s.streamCut?.inputNext ?? null) : (p.inputNext ?? null);
      if (!mix) return s;
      if (mix.pos < 0.5)
        return to === 'stream' && s.streamCut
          ? { ...s, streamCut: { ...s.streamCut, inputNext: null } }
          : { ...s, program: { ...p, inputNext: null } };
      // Finish the mix from where the bar was (the rest of a short fade).
      return {
        ...takeTo(s, to, mix.input, {
          kind: 'fade',
          durationMs: Math.round((1 - mix.pos) * 500),
        }),
        switcher: { preview: current },
      };
    }
    case 'pip':
      return { ...s, program: { ...p, pip: a.pip } };
    case 'link':
      return s.streamCut ? { ...s, streamCut: null } : s;
  }
}

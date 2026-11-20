import { z } from 'zod';
import {
  InputTransitionSchema,
  PipLayerSchema,
  VideoInputLayerSchema,
  type InputTransition,
  type Scene,
  type VideoInputLayer,
} from './schemas/scene';
import type { LiveState } from './live';
import { omit } from './utils/object';

/**
 * The video switcher (`live.switcher`): cameras go to Preview, then Cut or Auto (with a
 * transition) takes Preview to Program — and what was on Program comes back to Preview, as on
 * any vision mixer. The T-bar mixes by hand; picture-in-picture puts a second camera in a corner.
 */
export const SwitcherActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('preview'), input: VideoInputLayerSchema.nullable() }),
  /** Preview to Program at once. */
  z.object({ action: z.literal('cut') }),
  /** Preview to Program with a transition. */
  z.object({ action: z.literal('auto'), transition: InputTransitionSchema }),
  /** A camera straight to Program (no Preview step), with a transition or cut. */
  z.object({
    action: z.literal('take'),
    input: VideoInputLayerSchema.nullable(),
    transition: InputTransitionSchema.optional(),
  }),
  /** The T-bar at `pos` (0 = Program only, 1 = Preview fully over it). */
  z.object({ action: z.literal('tbar'), pos: z.number().min(0).max(1) }),
  /** The T-bar let go: past half-way it finishes the take, otherwise it goes back. */
  z.object({ action: z.literal('tbarRelease') }),
  z.object({ action: z.literal('pip'), pip: PipLayerSchema.nullable() }),
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

export function applySwitcherAction(s: LiveState, a: SwitcherAction): LiveState {
  const p = s.program;
  const preview = s.switcher.preview;
  switch (a.action) {
    case 'preview':
      return { ...s, switcher: { preview: a.input } };
    case 'cut':
    case 'auto': {
      if (!preview || sameInput(preview, p.input)) return s;
      return {
        ...s,
        program: onProgram(p, preview, a.action === 'auto' ? a.transition : undefined),
        // What was on Program waits on Preview, ready to come back.
        switcher: { preview: p.input ?? null },
      };
    }
    case 'take':
      if (sameInput(a.input, p.input) && !p.inputNext) return s;
      return {
        ...s,
        program: onProgram(p, a.input, a.transition),
        switcher: {
          preview: sameInput(preview, a.input) ? (p.input ?? null) : preview,
        },
      };
    case 'tbar':
      if (!preview || sameInput(preview, p.input)) return s;
      return {
        ...s,
        program: { ...p, inputNext: a.pos > 0 ? { input: preview, pos: a.pos } : null },
      };
    case 'tbarRelease': {
      const mix = p.inputNext;
      if (!mix) return s;
      if (mix.pos < 0.5) return { ...s, program: { ...p, inputNext: null } };
      // Finish the mix from where the bar was (the rest of a short fade).
      return {
        ...s,
        program: onProgram(p, mix.input, {
          kind: 'fade',
          durationMs: Math.round((1 - mix.pos) * 500),
        }),
        switcher: { preview: p.input ?? null },
      };
    }
    case 'pip':
      return { ...s, program: { ...p, pip: a.pip } };
  }
}

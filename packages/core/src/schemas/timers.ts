import { z } from 'zod';

/**
 * A reusable timer (Timers bin):
 * - `countdown`: counts down from `durationSec`, then counts up in overrun ("-00:12").
 * - `to-time`: counts down to a time of day (`targetTime`, "HH:MM"), e.g. service start.
 * - `elapsed`: counts up from when it was started, e.g. sermon length.
 */
export const TimerDefSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(60),
  kind: z.enum(['countdown', 'to-time', 'elapsed']),
  durationSec: z.number().int().min(1).max(86_400).optional(),
  targetTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
});
export type TimerDef = z.infer<typeof TimerDefSchema>;

/** A started timer: its definition plus run state (elapsed = accumulated + time since start). */
export const LiveTimerSchema = TimerDefSchema.extend({
  running: z.boolean(),
  startedAt: z.string().max(40).nullable(),
  accumulatedSec: z.number().min(0),
});
export type LiveTimer = z.infer<typeof LiveTimerSchema>;

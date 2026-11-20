import type { LiveTimer, TimerDef } from '../schemas/timers';
import { formatClock } from './time';

/** Seconds until today's (or, if it has passed, tomorrow's) HH:MM. */
export function secondsUntilTime(hhmm: string, nowMs: number): number {
  const [h, m] = hhmm.split(':').map(Number);
  const target = new Date(nowMs);
  target.setHours(h ?? 0, m ?? 0, 0, 0);
  let diff = (target.getTime() - nowMs) / 1000;
  if (diff < -60 * 60 * 6) diff += 86_400; // well past: it means tomorrow
  return diff;
}

/**
 * What a timer reads right now, in seconds. Countdowns go negative once they overrun, which
 * {@link formatTimer} shows with a leading minus.
 */
export function timerSeconds(t: LiveTimer, nowMs: number): number {
  const elapsed =
    t.accumulatedSec + (t.running && t.startedAt ? (nowMs - Date.parse(t.startedAt)) / 1000 : 0);
  if (t.kind === 'elapsed') return elapsed;
  if (t.kind === 'countdown') return (t.durationSec ?? 0) - elapsed;
  return t.targetTime ? secondsUntilTime(t.targetTime, nowMs) : 0;
}

/** "05:00", "1:02:03", or "-00:12" in overrun. Countdowns round up, elapsed timers down. */
export function formatTimer(seconds: number, kind: TimerDef['kind'] = 'countdown'): string {
  if (seconds < 0) return `-${formatClock(Math.floor(-seconds))}`;
  return formatClock(kind === 'elapsed' ? Math.floor(seconds) : Math.ceil(seconds));
}

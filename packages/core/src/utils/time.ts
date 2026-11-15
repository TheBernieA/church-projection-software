/**
 * Format seconds as a clock: "mm:ss", or "h:mm:ss" once there are hours. `hours: 'always'`
 * forces "hh:mm:ss" (stable width for running timers). Shared by output countdowns, the stage
 * display and the operator's live timer.
 */
export function formatClock(
  totalSeconds: number,
  opts: { hours?: 'auto' | 'always' } = {},
): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = (n: number): string => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (opts.hours === 'always') return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Seconds elapsed since an ISO timestamp (never negative). */
export function secondsSince(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
}

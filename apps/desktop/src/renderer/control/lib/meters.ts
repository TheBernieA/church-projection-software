import type { MeterReport } from '@lampstand/ipc-contract';

/**
 * Mix levels for the Mixer's meters: the room's (from the main output, or this window with no
 * output) and the stream's (from the stream window). About 15 a second each, so they never go
 * through the store: meters subscribe here and draw straight to the page.
 */
type Bus = MeterReport['bus'];
const latest: Record<Bus, { report: MeterReport; at: number } | null> = {
  room: null,
  stream: null,
};
const listeners = new Set<() => void>();

export function publishMeters(report: MeterReport): void {
  latest[report.bus] = { report, at: performance.now() };
  for (const l of listeners) l();
}

/** Peak and RMS (linear) of a channel, or of the whole mix (`channel` null). Silence if stale. */
export function readMeter(bus: Bus, channel: string | null): [number, number] {
  const m = latest[bus];
  if (!m || performance.now() - m.at > 500) return [0, 0];
  return channel === null ? m.report.level : (m.report.channels[channel] ?? [0, 0]);
}

export function onMeters(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

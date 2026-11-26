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

const SILENT: [[number, number], [number, number]] = [
  [0, 0],
  [0, 0],
];

/** The whole mix's left and right levels (silence if stale). */
export function readSides(bus: Bus): [[number, number], [number, number]] {
  const m = latest[bus];
  return m && performance.now() - m.at <= 500 ? m.report.sides : SILENT;
}

export function onMeters(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** A channel's dynamics in dB: compressor gain reduction and ducking (0 when idle or stale). */
export function readDyn(bus: Bus, channel: string): [number, number] {
  const m = latest[bus];
  if (!m || performance.now() - m.at > 500) return [0, 0];
  return m.report.dyn?.[channel] ?? [0, 0];
}

/** The spectrum into and out of a channel's EQ (null: not watched yet, or stale). */
export function readSpectrum(bus: Bus, channel: string): { pre: number[]; post: number[] } | null {
  const m = latest[bus];
  if (!m || performance.now() - m.at > 500) return null;
  const s = m.report.spectrum;
  return s?.id === channel ? s : null;
}

/** The mix's loudness in LUFS (null: nothing measured, or stale). */
export function readLoudness(bus: Bus): NonNullable<MeterReport['loudness']> | null {
  const m = latest[bus];
  if (!m || performance.now() - m.at > 1500) return null;
  return m.report.loudness ?? null;
}

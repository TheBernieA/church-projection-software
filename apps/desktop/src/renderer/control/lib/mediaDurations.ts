/**
 * Lengths of library clips read from their files (seconds), shared by the transport (which
 * probes them) and the end-of-clip watcher. The library's own `durationSec` wins when known.
 */
export const durations = new Map<string, number>();

export function knownDuration(id: string, fromLibrary?: number): number | undefined {
  return fromLibrary ?? durations.get(id);
}

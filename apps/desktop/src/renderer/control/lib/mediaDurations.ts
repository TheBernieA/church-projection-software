import { useSyncExternalStore } from 'react';

/**
 * Lengths of library clips read from their files (seconds), shared by the transports (which
 * probe them) and the end-of-clip watchers. The library's own `durationSec` wins when known.
 * Components read them with {@link useKnownDuration} and re-render when a probe lands.
 */
const durations = new Map<string, number>();
const listeners = new Set<() => void>();

export function knownDuration(id: string, fromLibrary?: number): number | undefined {
  return fromLibrary ?? durations.get(id);
}

export const hasDuration = (id: string): boolean => durations.has(id);

/** Record a probed length and tell whoever shows it. */
export function setDuration(id: string, seconds: number): void {
  durations.set(id, seconds);
  for (const l of listeners) l();
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** A clip's length, updating when its probe finishes. */
export function useKnownDuration(id: string | undefined, fromLibrary?: number): number | undefined {
  return useSyncExternalStore(subscribe, () => (id ? knownDuration(id, fromLibrary) : undefined));
}

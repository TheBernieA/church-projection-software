import type { StreamDestination } from '@lampstand/core';
import type { StreamDestinationStatus } from '@lampstand/ipc-contract';
import { destinationUrl, isDirectUrl, isStreamUrl, plausibleKey, protocolOf } from './ffmpegArgs';

/** Why a destination can't start, in words for the Live console. */
export const DESTINATION_PROBLEMS = {
  address: 'The address should look like srt://192.168.1.50:9000 or udp://192.168.1.50:9000.',
  noSrt:
    'The ffmpeg on this computer was built without SRT. Use a udp:// address, or install an ffmpeg that has SRT.',
  key: 'The saved stream key doesn’t look right for this service. Paste the key again.',
} as const;

export interface ResolvedDestinations {
  /** Full addresses (keys included) of the destinations that can start, in order. */
  urls: string[];
  /** Every enabled destination: 'connecting' (its address is in `urls`) or 'failed'. */
  status: StreamDestinationStatus[];
}

/**
 * Work out where the stream goes: each enabled destination's full address, or why it can't
 * start (no key, a key or address that can't be right, a protocol this ffmpeg lacks).
 */
export async function resolveDestinations(o: {
  destinations: readonly StreamDestination[];
  getKey: (id: string) => Promise<string | null>;
  /** The protocols this ffmpeg can send over. */
  protocols: readonly string[];
  /** Destinations to try on their second address (the first couldn't connect). */
  alt: ReadonlySet<string>;
  /** Called for each one that will start, and each saved key that looks wrong (never the key). */
  onNote?: (event: 'destination' | 'badKey', info: Record<string, unknown>) => void;
}): Promise<ResolvedDestinations> {
  const urls: string[] = [];
  const status: StreamDestinationStatus[] = [];
  const failed = (d: StreamDestination, reason?: string): void =>
    void status.push({ id: d.id, name: d.name, state: 'failed', ...(reason ? { reason } : {}) });
  const going = (d: StreamDestination, url: string, info: Record<string, unknown> = {}): void => {
    o.onNote?.('destination', { id: d.id, kind: d.kind, ...info });
    urls.push(url);
    status.push({ id: d.id, name: d.name, state: 'connecting' });
  };
  for (const dest of o.destinations.filter((d) => d.enabled)) {
    if (dest.kind === 'direct') {
      // A direct link (SRT or UDP) to a receiver: no key, no service in between.
      const address = dest.url.trim();
      if (!isDirectUrl(address)) failed(dest, DESTINATION_PROBLEMS.address);
      else if (!o.protocols.includes(protocolOf(address))) failed(dest, DESTINATION_PROBLEMS.noSrt);
      else going(dest, destinationUrl(dest.kind, address, null));
      continue;
    }
    const key = await o.getKey(dest.id);
    const url = destinationUrl(dest.kind, dest.url, key, o.alt.has(dest.id));
    const needsKey = dest.kind !== 'custom';
    if ((needsKey && !key) || !isStreamUrl(url)) failed(dest);
    else if (key && !plausibleKey(dest.kind, key)) {
      // A saved key that can't be right (e.g. the "Stream URL" was pasted as the key): say so
      // now, rather than let the service hang up on it.
      o.onNote?.('badKey', { id: dest.id, length: key.length });
      failed(dest, DESTINATION_PROBLEMS.key);
    } else going(dest, url, { keyLength: key?.length ?? 0 });
  }
  return { urls, status };
}

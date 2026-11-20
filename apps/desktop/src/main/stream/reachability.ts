import { connect } from 'node:net';

/**
 * Is the network back? While a stream is reconnecting after a drop, Lampstand checks that a
 * destination's server answers before starting the encoder again, so an outage doesn't churn
 * through restarts (or split a recording into a part per attempt).
 */

export interface Endpoint {
  host: string;
  port: number;
}

/**
 * Where a destination's server is: host and port only (the stream key in the address is never
 * kept). Null for what can't be checked this way (SRT and UDP aren't TCP): those are retried
 * without asking first.
 */
export function endpointOf(url: string): Endpoint | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const defaults: Record<string, number> = { 'rtmp:': 1935, 'rtmps:': 443 };
  const fallback = defaults[u.protocol];
  if (fallback === undefined || !u.hostname) return null;
  return { host: u.hostname, port: u.port ? Number(u.port) : fallback };
}

/** Does a TCP connection to the server open within `timeoutMs`? */
function answers(e: Endpoint, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: e.host, port: e.port });
    const done = (ok: boolean): void => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/**
 * Is any of the stream's servers reachable? True when there's nothing that can be checked
 * (then the encoder just tries).
 */
export async function anyReachable(endpoints: Endpoint[], timeoutMs = 3_000): Promise<boolean> {
  if (endpoints.length === 0) return true;
  const results = await Promise.all(endpoints.map((e) => answers(e, timeoutMs)));
  return results.some(Boolean);
}

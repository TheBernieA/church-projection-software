import { execFile } from 'node:child_process';

/** One process's CPU (% of one core) and memory (MB). */
export interface ProcessUsage {
  cpu: number;
  memMB: number;
}

/** `ps -o %cpu=,rss=` output: "  12.3  45678" (rss in KB). Null if unreadable. */
export function parsePs(out: string): ProcessUsage | null {
  const [cpu, rss] = out.trim().split(/\s+/).map(Number);
  if (cpu === undefined || rss === undefined || !Number.isFinite(cpu) || !Number.isFinite(rss))
    return null;
  return { cpu, memMB: Math.round(rss / 1024) };
}

/** CPU and memory of another process (the encoder). Null where `ps` isn't available (Windows). */
export function sampleProcess(pid: number): Promise<ProcessUsage | null> {
  if (process.platform === 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile('ps', ['-o', '%cpu=,rss=', '-p', String(pid)], { timeout: 2000 }, (err, out) =>
      resolve(err ? null : parsePs(out)),
    );
  });
}

/** A fixed-length history (oldest first), for the console's sparklines. */
export class Ring {
  readonly values: number[] = [];
  constructor(private readonly size = 60) {}
  push(v: number): void {
    this.values.push(v);
    if (this.values.length > this.size) this.values.shift();
  }
  clear(): void {
    this.values.length = 0;
  }
}

/** One health sample, every 2 s while running. */
export interface HealthSample {
  /** ffmpeg's speed (1 = keeping up). */
  speed: number;
  /** Frames sent and dropped by Lampstand since the last sample. */
  sent: number;
  dropped: number;
}

/**
 * Is this computer struggling? Yes when, over the last 15 s (8 samples), the encoder has been
 * slower than real time, or Lampstand has had to drop more than 2% of frames.
 */
export function isStruggling(samples: readonly HealthSample[], window = 8): boolean {
  if (samples.length < window) return false;
  const last = samples.slice(-window);
  const slow = last.every((s) => s.speed > 0 && s.speed < 0.92);
  const sent = last.reduce((a, s) => a + s.sent, 0);
  const dropped = last.reduce((a, s) => a + s.dropped, 0);
  return slow || (sent > 0 && dropped / sent > 0.02);
}

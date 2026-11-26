import { writeFile } from 'node:fs/promises';
import { Session } from 'node:inspector/promises';
import { join } from 'node:path';
import type { Logger } from '../types';

/**
 * A CPU profile of the main process for one stream, for finding what blocks it (open the file
 * in Chrome DevTools › Performance, or VS Code). Developers only: on when Lampstand starts with
 * LAMPSTAND_PROFILE_MAIN=1; written to the log folder when the session ends. Sampling every 1 ms
 * costs a little CPU, so it's never on by default.
 */
export class MainProfile {
  private session: Session | null = null;
  private startedAt = '';

  constructor(
    private readonly dir: string,
    private readonly log: Logger,
  ) {}

  static enabled(): boolean {
    return process.env.LAMPSTAND_PROFILE_MAIN === '1';
  }

  async start(): Promise<void> {
    if (this.session) return;
    const s = new Session();
    this.session = s;
    this.startedAt = new Date().toISOString().replace(/[:.]/g, '-');
    s.connect();
    await s.post('Profiler.enable');
    await s.post('Profiler.setSamplingInterval', { interval: 1000 });
    await s.post('Profiler.start');
    this.log.info('main profile started');
  }

  async stop(): Promise<void> {
    const s = this.session;
    if (!s) return;
    this.session = null;
    try {
      const { profile } = await s.post('Profiler.stop');
      const file = join(this.dir, `main-${this.startedAt}.cpuprofile`);
      await writeFile(file, JSON.stringify(profile));
      this.log.info('main profile written', { file });
    } catch (err) {
      this.log.warn('main profile not written', {
        reason: err instanceof Error ? err.message : 'unknown',
      });
    } finally {
      s.disconnect();
    }
  }
}

import { utilityProcess, type UtilityProcess } from 'electron';
import type { SearchHit } from '@lampstand/ipc-contract';
import workerPath from '../../workers/search/index.ts?modulePath';
import type { FromWorker, SongDoc, ToWorker } from '../../workers/search/protocol';
import { type Logger } from '../types';

/** Supervises the SearchWorker utility process; restarts it if it dies (§3.2). */
export class SearchService {
  private proc: UtilityProcess | null = null;
  private seq = 0;
  private pending = new Map<
    number,
    { resolve: (h: SearchHit[]) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private lastSongs: SongDoc[] = [];
  private lastBibles: { id: string; checksum: string }[] = [];
  private lastWarm: string | undefined;
  private stopped = false;

  constructor(
    private readonly dirs: { biblesDir: string; cacheDir: string },
    private readonly log: Logger,
  ) {}

  start(): void {
    this.stopped = false;
    const proc = utilityProcess.fork(workerPath, [], {
      serviceName: 'Lampstand Search',
      stdio: 'pipe',
    });
    this.proc = proc;
    proc.on('message', (m: FromWorker) => this.onMessage(m));
    proc.on('exit', (code) => {
      this.proc = null;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.resolve([]);
      }
      this.pending.clear();
      if (this.stopped) return;
      this.log.warn('search worker exited; restarting', { code });
      setTimeout(() => {
        this.start();
        this.setBibles(this.lastBibles, this.lastWarm);
        this.setSongs(this.lastSongs);
      }, 500);
    });
    this.post({ type: 'init', ...this.dirs });
  }

  stop(): void {
    this.stopped = true;
    this.proc?.kill();
  }

  setSongs(docs: SongDoc[]): void {
    this.lastSongs = docs;
    this.post({ type: 'songs', docs });
  }

  /** The installed versions; `warm` (the default version) is indexed straight away. */
  setBibles(versions: { id: string; checksum: string }[], warm?: string): void {
    this.lastBibles = versions;
    this.lastWarm = warm;
    this.post({ type: 'bibles', versions, ...(warm ? { warm } : {}) });
  }

  query(text: string, limit: number, versionId?: string): Promise<SearchHit[]> {
    if (!this.proc) return Promise.resolve([]);
    const id = ++this.seq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve([]);
      }, 2000);
      this.pending.set(id, { resolve, timer });
      const msg: ToWorker = { type: 'query', id, text, limit };
      if (versionId) msg.versionId = versionId;
      this.post(msg);
    });
  }

  private post(m: ToWorker): void {
    this.proc?.postMessage(m);
  }

  private onMessage(m: FromWorker): void {
    if (m.type === 'result') {
      const p = this.pending.get(m.id);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(m.id);
        p.resolve(m.hits);
      }
    } else if (m.type === 'indexed') this.log.info('search indexed', { what: m.what, ms: m.ms });
    else if (m.type === 'error') {
      this.log.warn('search worker error', { message: m.message });
      // A failed query answers at once (nothing found) instead of waiting for the timeout.
      const p = m.id === undefined ? undefined : this.pending.get(m.id);
      if (p && m.id !== undefined) {
        clearTimeout(p.timer);
        this.pending.delete(m.id);
        p.resolve([]);
      }
    }
  }
}

import type { Transcriber, TranscriberState, TranscriptPiece } from '@lampstand/detection';
import type { WorkerIn, WorkerOut } from './whisper.worker';

/** How long one utterance may take before it's given up (a stuck worker never blocks the rest). */
const TRANSCRIBE_TIMEOUT_MS = 20_000;

/**
 * The `Transcriber` the control window uses: Whisper in a worker. A crashed worker is
 * restarted on the next request (BUILD_SPEC §10.4: never affects output).
 */
export class WhisperTranscriber implements Transcriber {
  private worker: Worker | null = null;
  private loaded: Promise<void> | null = null;
  private seq = 0;
  private readonly waiting = new Map<
    number,
    {
      resolve: (p: TranscriptPiece) => void;
      reject: (e: Error) => void;
      startMs: number;
      endMs: number;
    }
  >();
  private readonly listeners = new Set<(s: TranscriberState) => void>();
  private state: TranscriberState = { kind: 'idle' };

  constructor(private readonly model: string) {}

  private set(s: TranscriberState): void {
    this.state = s;
    for (const l of this.listeners) l(s);
  }

  onState(cb: (s: TranscriberState) => void): () => void {
    this.listeners.add(cb);
    cb(this.state);
    return () => this.listeners.delete(cb);
  }

  private start(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./whisper.worker.ts', import.meta.url), {
      type: 'module',
      name: 'speech',
    });
    w.onmessage = (e: MessageEvent<WorkerOut>) => this.receive(e.data);
    w.onerror = (e) => this.fail(new Error(e.message || 'The speech engine stopped.'));
    this.worker = w;
    return w;
  }

  private receive(m: WorkerOut): void {
    if (m.t === 'progress') this.set({ kind: 'loading', progress: m.progress });
    else if (m.t === 'ready') this.set({ kind: 'ready', device: m.device });
    else if (m.t === 'text') {
      const w = this.waiting.get(m.id);
      this.waiting.delete(m.id);
      w?.resolve({ text: m.text, startMs: w.startMs, endMs: w.endMs, tookMs: m.ms });
    } else if (m.id !== undefined) {
      const w = this.waiting.get(m.id);
      this.waiting.delete(m.id);
      w?.reject(new Error(m.message));
    } else this.fail(new Error(m.message));
  }

  /** The worker died or couldn't load: every request fails, and the next one starts afresh. */
  private fail(e: Error): void {
    this.worker?.terminate();
    this.worker = null;
    this.loaded = null;
    for (const w of this.waiting.values()) w.reject(e);
    this.waiting.clear();
    this.set({ kind: 'error', message: e.message });
  }

  load(): Promise<void> {
    if (this.loaded) return this.loaded;
    this.set({ kind: 'loading', progress: 0 });
    const w = this.start();
    this.loaded = new Promise<void>((resolve, reject) => {
      const off = this.onState((s) => {
        if (s.kind === 'ready') {
          off();
          resolve();
        } else if (s.kind === 'error') {
          off();
          reject(new Error(s.message));
        }
      });
    });
    w.postMessage({ t: 'load', model: this.model } satisfies WorkerIn);
    return this.loaded;
  }

  async transcribe(
    samples: Float32Array,
    startMs: number,
    endMs: number,
  ): Promise<TranscriptPiece> {
    await this.load();
    const w = this.start();
    const id = ++this.seq;
    return new Promise<TranscriptPiece>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.waiting.delete(id)) return;
        reject(new Error('Transcribing took too long.'));
      }, TRANSCRIBE_TIMEOUT_MS);
      this.waiting.set(id, {
        resolve: (p) => {
          clearTimeout(timer);
          resolve(p);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
        startMs,
        endMs,
      });
      w.postMessage({ t: 'transcribe', id, samples } satisfies WorkerIn, [samples.buffer]);
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.loaded = null;
    for (const w of this.waiting.values()) w.reject(new Error('Stopped.'));
    this.waiting.clear();
    this.set({ kind: 'idle' });
  }
}

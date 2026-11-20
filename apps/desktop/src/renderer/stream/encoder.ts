import type { EncodeConfig, StreamApi } from '@lampstand/ipc-contract';
import type { WorkerIn, WorkerOut } from './encoder.worker';

/**
 * The page's side of the GPU pipeline's encoder. The work happens in a worker thread
 * (`encoder.worker.ts`: the frame clock and the hardware encoder); this hands it each new stream
 * picture and main's commands, and passes its reports back. The worker starts with the first
 * thing for it to do (a probe or an encode), so windows that never encode (NDI feeds, the CPU
 * pipeline) never start one.
 */
export class StreamEncoder {
  private worker: Worker | null = null;

  constructor(private readonly api: StreamApi) {
    api.onFrame((frame) => {
      const f = frame as unknown as VideoFrame;
      // Nothing to encode with yet: let the picture go at once.
      if (!this.worker) return f.close();
      this.worker.postMessage({ t: 'frame', frame: f } satisfies WorkerIn, [f]);
    });
    api.onEncode((cmd) => {
      if (cmd === null) return this.worker?.postMessage({ t: 'stop' } satisfies WorkerIn);
      const w = this.started();
      if ('keyframe' in cmd) w.postMessage({ t: 'key' } satisfies WorkerIn);
      else if ('bitrate' in cmd)
        w.postMessage({ t: 'bitrate', kbps: cmd.bitrate } satisfies WorkerIn);
      else w.postMessage({ t: 'begin', cfg: cmd } satisfies WorkerIn);
    });
  }

  /** The worker, started on first use. */
  private started(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./encoder.worker.ts', import.meta.url), {
      type: 'module',
      name: 'stream-encoder',
    });
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.t === 'report') this.api.reportEncoder(m.r);
      else this.api.sendVideo(m.data, m.key, m.ts, m.config);
    };
    w.onerror = (e) =>
      this.api.reportEncoder({ type: 'error', message: `encoder worker: ${e.message}` });
    this.worker = w;
    return w;
  }

  /** Can this computer encode this size in hardware? (Told to main before it picks a pipeline.) */
  probe(cfg: EncodeConfig): void {
    this.started().postMessage({ t: 'probe', cfg } satisfies WorkerIn);
  }
}

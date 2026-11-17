import type { EncodeConfig, StreamApi } from '@lampstand/ipc-contract';
import type { WorkerIn, WorkerOut } from './encoder.worker';

/**
 * The page's side of the GPU pipeline's encoder. The work happens in a worker thread
 * (`encoder.worker.ts`: the frame clock and the hardware encoder); this hands it each new stream
 * picture and main's commands, and passes its reports back.
 */
export class StreamEncoder {
  private readonly worker = new Worker(new URL('./encoder.worker.ts', import.meta.url), {
    type: 'module',
    name: 'stream-encoder',
  });

  constructor(private readonly api: StreamApi) {
    const post = (m: WorkerIn, transfer: Transferable[] = []): void =>
      this.worker.postMessage(m, transfer);
    api.onFrame((frame) => {
      const f = frame as unknown as VideoFrame;
      post({ t: 'frame', frame: f }, [f]);
    });
    api.onEncode((cmd) => {
      if (cmd === null) post({ t: 'stop' });
      else if ('keyframe' in cmd) post({ t: 'key' });
      else post({ t: 'begin', cfg: cmd });
    });
    this.worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.t === 'report') api.reportEncoder(m.r);
      else api.sendVideo(m.data, m.key, m.ts, m.config);
    };
    this.worker.onerror = (e) =>
      api.reportEncoder({ type: 'error', message: `encoder worker: ${e.message}` });
  }

  /** Can this computer encode this size in hardware? (Told to main before it picks a pipeline.) */
  probe(cfg: EncodeConfig): void {
    this.worker.postMessage({ t: 'probe', cfg } satisfies WorkerIn);
  }
}

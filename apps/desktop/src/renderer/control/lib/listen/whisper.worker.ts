/// <reference lib="webworker" />
/**
 * Whisper, off the control window's main thread (ADR 0008). The model's files come from
 * `lampstand-media://speech/<model>/…` (downloaded and checked by main); the ONNX runtime's
 * WebAssembly is bundled with the app. WebGPU where it works, else WebAssembly. Nothing here
 * touches the network.
 */
import {
  env,
  pipeline,
  type AutomaticSpeechRecognitionOutput,
  type AutomaticSpeechRecognitionPipeline,
} from '@huggingface/transformers';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import wasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';

export type WorkerIn =
  { t: 'load'; model: string } | { t: 'transcribe'; id: number; samples: Float32Array };

export type WorkerOut =
  | { t: 'progress'; progress: number }
  | { t: 'ready'; device: string }
  | { t: 'error'; message: string; id?: number }
  | { t: 'text'; id: number; text: string; ms: number };

const post = (m: WorkerOut): void => self.postMessage(m);

// The model is "local": served by main from the checked download, never fetched from a hub
// (a hub path only accepts http(s), and nothing here may reach the network).
env.allowLocalModels = true;
env.localModelPath = 'lampstand-media://speech/';
env.allowRemoteModels = false;
env.useBrowserCache = false;
// The runtime loads from the app bundle as it is: no blob: copies (the CSP forbids them).
env.useWasmCache = false;
const wasm = env.backends.onnx.wasm;
if (wasm) {
  wasm.wasmPaths = { wasm: wasmUrl, mjs: wasmModuleUrl };
  // No cross-origin isolation in Electron's pages: one thread.
  wasm.numThreads = 1;
  wasm.proxy = false;
}

let asr: AutomaticSpeechRecognitionPipeline | null = null;
let loading: Promise<void> | null = null;

async function hasWebGpu(): Promise<boolean> {
  try {
    // Not every worker has WebGPU, whatever the types say.
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

async function load(model: string): Promise<void> {
  const progress = new Map<string, [number, number]>();
  const opts = {
    dtype: 'q8' as const,
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== 'progress' || !p.file) return;
      progress.set(p.file, [p.loaded ?? 0, p.total ?? 0]);
      let loaded = 0;
      let total = 0;
      for (const [l, t] of progress.values()) {
        loaded += l;
        total += t;
      }
      if (total > 0) post({ t: 'progress', progress: loaded / total });
    },
  };
  const devices: ('webgpu' | 'wasm')[] = (await hasWebGpu()) ? ['webgpu', 'wasm'] : ['wasm'];
  let last: unknown = null;
  for (const device of devices) {
    try {
      asr = await pipeline('automatic-speech-recognition', model, { ...opts, device });
      // One short run so the first real sentence isn't slow (shaders compile, memory settles).
      await asr(new Float32Array(16000), { return_timestamps: false });
      post({ t: 'ready', device });
      return;
    } catch (e) {
      last = e;
      asr = null;
    }
  }
  throw last instanceof Error ? last : new Error('The speech model could not start.');
}

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const m = e.data;
  if (m.t === 'load') {
    loading ??= load(m.model).catch((err: unknown) => {
      loading = null;
      post({ t: 'error', message: err instanceof Error ? err.message : String(err) });
    });
    return;
  }
  void (async () => {
    const started = performance.now();
    try {
      if (loading) await loading;
      if (!asr) throw new Error('The speech model is not loaded.');
      const out = (await asr(m.samples, { return_timestamps: false })) as
        AutomaticSpeechRecognitionOutput | AutomaticSpeechRecognitionOutput[];
      const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text;
      post({ t: 'text', id: m.id, text, ms: performance.now() - started });
    } catch (err) {
      post({ t: 'error', id: m.id, message: err instanceof Error ? err.message : String(err) });
    }
  })();
};

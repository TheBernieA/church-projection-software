/**
 * The NDI sender, in its own thread: compressing and sending a frame takes a few
 * milliseconds, which must never hold up the main process. It loads the NDI runtime with
 * koffi, keeps one sender per feed, and reports how many receivers each has.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { fourCC, toPlanar } from './ndiRuntime';

type Koffi = typeof import('koffi');
type KoffiFunction = ReturnType<import('koffi').LibraryHandle['func']>;
const require_ = createRequire(__filename);
const koffi = require_('koffi') as Koffi;

export type NdiWorkerIn =
  | { type: 'open'; id: string; name: string }
  | { type: 'close'; id: string }
  /** Stop every source and NDI itself, then end (so nothing stays advertised). */
  | { type: 'shutdown' }
  | {
      type: 'video';
      id: string;
      width: number;
      height: number;
      fps: number;
      /** BGRA, top row first. */
      data: ArrayBuffer;
    }
  | { type: 'audio'; id: string; pcm: Float32Array };

export type NdiWorkerOut =
  | { type: 'ready'; version: string }
  | { type: 'failed'; message: string }
  | { type: 'connections'; counts: Record<string, number> };

const port = parentPort;
if (!port) throw new Error('ndiWorker must run in a worker');

const INT64_MAX = 9223372036854775807n;
interface Api {
  initialize: KoffiFunction;
  version: KoffiFunction;
  sendCreate: KoffiFunction;
  sendDestroy: KoffiFunction;
  destroy: KoffiFunction;
  sendVideo: KoffiFunction;
  sendAudio: KoffiFunction;
  connections: KoffiFunction;
}
/** The loaded NDI functions (null until loaded, or if loading failed). */
const state: { api: Api | null } = { api: null };

try {
  const lib = koffi.load((workerData as { lib: string }).lib);
  const SendCreate = koffi.struct('NDIlib_send_create_t', {
    p_ndi_name: 'const char *',
    p_groups: 'const char *',
    clock_video: 'bool',
    clock_audio: 'bool',
  });
  const VideoFrame = koffi.struct('NDIlib_video_frame_v2_t', {
    xres: 'int',
    yres: 'int',
    FourCC: 'uint32_t',
    frame_rate_N: 'int',
    frame_rate_D: 'int',
    picture_aspect_ratio: 'float',
    frame_format_type: 'int',
    timecode: 'int64_t',
    p_data: 'uint8_t *',
    line_stride_in_bytes: 'int',
    p_metadata: 'const char *',
    timestamp: 'int64_t',
  });
  const AudioFrame = koffi.struct('NDIlib_audio_frame_v3_t', {
    sample_rate: 'int',
    no_channels: 'int',
    no_samples: 'int',
    timecode: 'int64_t',
    FourCC: 'uint32_t',
    p_data: 'uint8_t *',
    channel_stride_in_bytes: 'int',
    p_metadata: 'const char *',
    timestamp: 'int64_t',
  });
  const Instance = koffi.pointer('NDIlib_send_instance_t', koffi.opaque());
  const api: Api = {
    initialize: lib.func('NDIlib_initialize', 'bool', []),
    version: lib.func('NDIlib_version', 'const char *', []),
    sendCreate: lib.func('NDIlib_send_create', Instance, [koffi.pointer(SendCreate)]),
    sendDestroy: lib.func('NDIlib_send_destroy', 'void', [Instance]),
    destroy: lib.func('NDIlib_destroy', 'void', []),
    sendVideo: lib.func('NDIlib_send_send_video_v2', 'void', [Instance, koffi.pointer(VideoFrame)]),
    sendAudio: lib.func('NDIlib_send_send_audio_v3', 'void', [Instance, koffi.pointer(AudioFrame)]),
    connections: lib.func('NDIlib_send_get_no_connections', 'int', [Instance, 'uint32_t']),
  };
  if (!api.initialize()) throw new Error('This computer cannot run NDI (CPU not supported).');
  state.api = api; // only once NDI is really running
  port.postMessage({ type: 'ready', version: String(api.version()) } satisfies NdiWorkerOut);
} catch (err) {
  port.postMessage({
    type: 'failed',
    message: err instanceof Error ? err.message : String(err),
  } satisfies NdiWorkerOut);
}

const senders = new Map<string, unknown>();
const BGRA = fourCC('BGRA');
const FLTP = fourCC('FLTp');

port.on('message', (m: NdiWorkerIn) => {
  const a = state.api;
  if (m.type === 'shutdown') {
    if (a) {
      for (const s of senders.values()) a.sendDestroy(s);
      senders.clear();
      a.destroy();
    }
    process.exit(0); // ends this worker thread only
  }
  if (!a) return;
  try {
    switch (m.type) {
      case 'open': {
        if (senders.has(m.id)) return;
        const s = a.sendCreate({
          p_ndi_name: m.name,
          p_groups: null,
          clock_video: false,
          clock_audio: false,
        }) as unknown;
        if (s) senders.set(m.id, s);
        return;
      }
      case 'close': {
        const s = senders.get(m.id);
        if (s) a.sendDestroy(s);
        senders.delete(m.id);
        return;
      }
      case 'video': {
        const s = senders.get(m.id);
        if (!s) return;
        a.sendVideo(s, {
          xres: m.width,
          yres: m.height,
          FourCC: BGRA,
          frame_rate_N: m.fps * 1000,
          frame_rate_D: 1000,
          picture_aspect_ratio: m.width / m.height,
          frame_format_type: 1, // progressive
          timecode: INT64_MAX, // NDI fills it in
          p_data: new Uint8Array(m.data),
          line_stride_in_bytes: m.width * 4,
          p_metadata: null,
          timestamp: 0n,
        });
        return;
      }
      case 'audio': {
        const s = senders.get(m.id);
        if (!s) return;
        const planar = toPlanar(m.pcm, 2);
        const samples = planar.length / 2;
        a.sendAudio(s, {
          sample_rate: 48_000,
          no_channels: 2,
          no_samples: samples,
          timecode: INT64_MAX,
          FourCC: FLTP,
          p_data: new Uint8Array(planar.buffer),
          channel_stride_in_bytes: samples * 4,
          p_metadata: null,
          timestamp: 0n,
        });
        return;
      }
    }
  } catch {
    /* one bad frame never stops the sender */
  }
});

// Receivers per feed, every two seconds (for the Settings page and the Live panel).
setInterval(() => {
  const a = state.api;
  if (!a) return;
  const counts: Record<string, number> = {};
  for (const [id, s] of senders) counts[id] = Number(a.connections(s, 0));
  port.postMessage({ type: 'connections', counts } satisfies NdiWorkerOut);
}, 2000);

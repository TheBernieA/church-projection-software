import { contextBridge, ipcRenderer } from 'electron';
import { listen } from './listen';
import { receiveGpuFrames } from './gpuFrames';
import { Channels } from '@lampstand/ipc-contract/channels';
import type { StreamApi } from '@lampstand/ipc-contract';

/**
 * Stream window API: it follows the live state and its settings, and sends its sound mix.
 * Nothing else: it can't run commands or queries.
 */
const api: StreamApi = {
  onLiveState: (cb) => listen(Channels.evLive, cb),
  onConfig: (cb) => listen(Channels.evStreamConfig, cb),
  ready: () => ipcRenderer.send(Channels.streamReady),
  sendAudio: (pcm) => ipcRenderer.send(Channels.streamAudio, pcm),
  onFrame: receiveGpuFrames(),
  onEncode: (cb) => listen(Channels.evEncode, cb),
  sendVideo: (data, key, timestampUs, config) =>
    ipcRenderer.send(Channels.streamVideo, data, key, timestampUs, config),
  reportEncoder: (r) => ipcRenderer.send(Channels.streamEncoder, r),
  sendMeters: (m) => ipcRenderer.send(Channels.meters, m),
};

contextBridge.exposeInMainWorld('lampstandStream', api);

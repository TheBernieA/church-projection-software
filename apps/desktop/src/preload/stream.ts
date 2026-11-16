import { contextBridge, ipcRenderer } from 'electron';
import { listen } from './listen';
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
};

contextBridge.exposeInMainWorld('lampstandStream', api);

import { contextBridge, ipcRenderer } from 'electron';
import { listen } from './listen';
import { Channels } from '@lampstand/ipc-contract/channels';
import type { OutputApi } from '@lampstand/ipc-contract';

/** Output/stage API: read-only. Outputs may only subscribe, never mutate (§17.2). */
const api: OutputApi = {
  onLiveState: (cb) => listen(Channels.evLive, cb),
  onInfo: (cb) => listen(Channels.evOutputInfo, cb),
  ready: () => ipcRenderer.send(Channels.outputReady),
  sendMeters: (m) => ipcRenderer.send(Channels.meters, m),
};

contextBridge.exposeInMainWorld('lampstandOutput', api);

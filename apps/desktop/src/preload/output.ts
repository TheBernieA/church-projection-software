import { contextBridge, ipcRenderer } from 'electron';
import { listen } from './listen';
import { Channels, type OutputApi } from '@lampstand/ipc-contract';

/** Output/stage API: read-only. Outputs may only subscribe, never mutate (§17.2). */
const api: OutputApi = {
  onLiveState: (cb) => listen(Channels.evLive, cb),
  onInfo: (cb) => listen(Channels.evOutputInfo, cb),
  ready: () => ipcRenderer.send(Channels.outputReady),
};

contextBridge.exposeInMainWorld('lampstandOutput', api);

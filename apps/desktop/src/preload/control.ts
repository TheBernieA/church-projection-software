import { contextBridge, ipcRenderer } from 'electron';
import { listen } from './listen';
import { receiveGpuFrames } from './gpuFrames';
// Names only (no schemas): keeps the sandboxed preload tiny.
import { Channels, QUERY_NAMES, type QueryName } from '@lampstand/ipc-contract/channels';
import type { ControlApi } from '@lampstand/ipc-contract';

/**
 * Control-window API (§17.1): one named function per contract entry. `ipcRenderer` itself is
 * never exposed, and query names are checked against the contract's allow-list.
 */
const allowed = new Set<string>(QUERY_NAMES);

const api: ControlApi = {
  command: (cmd) => ipcRenderer.invoke(Channels.command, cmd),
  undo: () => ipcRenderer.invoke(Channels.undo),
  redo: () => ipcRenderer.invoke(Channels.redo),
  query: (name: QueryName, args?: unknown) => {
    if (!allowed.has(name))
      return Promise.resolve({
        ok: false,
        error: { code: 'forbidden', message: 'Unknown query.' },
      });
    return ipcRenderer.invoke(Channels.query(name), args);
  },
  onLiveState: (cb) => listen(Channels.evLive, cb),
  onRepoChanged: (cb) => listen(Channels.evRepo, cb),
  onDisplaysChanged: (cb) => listen(Channels.evDisplays, cb),
  onHistoryChanged: (cb) => listen(Channels.evHistory, cb),
  onNotice: (cb) => listen(Channels.evNotice, cb),
  onMenu: (cb) => listen(Channels.evMenu, cb),
  onStream: (cb) => listen(Channels.evStream, cb),
  onMeters: (cb) => listen(Channels.evMeters, cb),
  onNdi: (cb) => listen(Channels.evNdi, cb),
  onLiveConsole: (cb) => listen(Channels.evLiveConsole, cb),
  onStreamPreview: (cb) => listen(Channels.evStreamPreview, cb),
  onStreamFrame: receiveGpuFrames(),
  streamWatch: (fps, ready) => ipcRenderer.send(Channels.streamWatch, { fps, ready }),
  platform: process.platform,
} as ControlApi;

contextBridge.exposeInMainWorld('lampstand', api);

import { ipcRenderer, type IpcRendererEvent } from 'electron';

/**
 * Subscribe to a main → renderer event channel and return an unsubscribe function. The raw
 * IPC event object is never handed to page code (§17.1).
 */
export function listen(channel: string, cb: (payload: never) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: unknown): void => cb(payload as never);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

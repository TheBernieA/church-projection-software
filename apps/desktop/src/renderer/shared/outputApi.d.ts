import type { OutputApi, ControlApi } from '@lampstand/ipc-contract';

declare global {
  interface Window {
    lampstandOutput: OutputApi;
    lampstand: ControlApi;
  }
}
export {};

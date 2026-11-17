import { sharedTexture } from 'electron';
import type { GpuFrame } from '@lampstand/ipc-contract';

/**
 * Receive the stream picture as GPU textures from main (the GPU pipeline): each becomes a
 * `VideoFrame` for the page (which must close it). Without a handler the frame is closed at
 * once. Our reference to the import is released straight away; the frame keeps the texture.
 */
export function receiveGpuFrames(): (cb: (frame: GpuFrame) => void) => void {
  let handler: ((frame: GpuFrame) => void) | null = null;
  // Not in every Electron build (experimental): then main uses the CPU pipeline.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  sharedTexture?.setSharedTextureReceiver(async ({ importedSharedTexture }) => {
    try {
      const frame = importedSharedTexture.getVideoFrame();
      if (handler) handler(frame);
      else frame.close();
    } finally {
      importedSharedTexture.release();
    }
    return Promise.resolve();
  });
  return (cb) => {
    handler = cb;
  };
}

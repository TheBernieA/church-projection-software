import { useEffect, useRef, useState, type RefObject } from 'react';
import type { GpuFrame } from '@lampstand/ipc-contract';
import { api } from './api';

/**
 * The stream picture as the encoder gets it, drawn into a canvas while it's on screen.
 * GPU pipeline: main passes each frame as a GPU texture (no copies), up to `fps` a second, and it
 * is drawn straight into the canvas. CPU pipeline: small JPEGs instead. `ready` also keeps the
 * stream picture up before going live. Returns whether anything has been drawn yet.
 */
export function useStreamPreview(
  canvas: RefObject<HTMLCanvasElement | null>,
  fps: number,
  ready = false,
): boolean {
  const [drawn, setDrawn] = useState(false);
  const drawnRef = useRef(false);
  useEffect(() => {
    let alive = true;
    const ctx = (): CanvasRenderingContext2D | null =>
      canvas.current?.getContext('2d', { alpha: false, desynchronized: true }) ?? null;
    const mark = (): void => {
      if (!drawnRef.current) {
        drawnRef.current = true;
        setDrawn(true);
      }
    };
    const fit = (w: number, h: number): void => {
      const c = canvas.current;
      if (c && (c.width !== w || c.height !== h)) {
        c.width = w;
        c.height = h;
      }
    };
    api.onStreamFrame((f: GpuFrame) => {
      const frame = f as unknown as VideoFrame;
      try {
        const c = ctx();
        if (alive && c && canvas.current) {
          // Draw at the canvas's on-screen size (sharp, and no larger than needed).
          const w = Math.min(
            frame.displayWidth,
            Math.round(canvas.current.clientWidth * devicePixelRatio),
          );
          const h = Math.round((w * frame.displayHeight) / frame.displayWidth);
          fit(w, h);
          c.drawImage(frame, 0, 0, w, h);
          mark();
        }
      } finally {
        frame.close();
      }
    });
    const offJpeg = api.onStreamPreview((jpeg) => {
      void createImageBitmap(
        new Blob([jpeg as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }),
      ).then((img) => {
        const c = ctx();
        if (alive && c) {
          fit(img.width, img.height);
          c.drawImage(img, 0, 0);
          mark();
        }
        img.close();
      });
    });
    const say = (): void => api.streamWatch(fps, ready);
    say();
    // Main forgets a watcher that goes quiet (a closed window), so keep saying it.
    const beat = setInterval(say, 4_000);
    return () => {
      alive = false;
      clearInterval(beat);
      api.streamWatch(0, false);
      api.onStreamFrame((f) => f.close());
      offJpeg();
      drawnRef.current = false;
      setDrawn(false);
    };
  }, [canvas, fps, ready]);
  return drawn;
}

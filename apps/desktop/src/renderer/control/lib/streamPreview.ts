import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * The stream picture, as the encoder gets it, while this component is on screen: main sends
 * small JPEGs at `fps` (only while someone watches). `ready` also asks for the stream picture
 * before going live. Each frame replaces the last (its object URL is freed).
 */
export function useStreamPreview(fps: number, ready = false): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let current: string | null = null;
    const off = api.onStreamPreview((jpeg) => {
      const next = URL.createObjectURL(
        new Blob([jpeg as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }),
      );
      if (current) URL.revokeObjectURL(current);
      current = next;
      setUrl(next);
    });
    const say = (): void => api.streamWatch(fps, ready);
    say();
    // Main forgets a watcher that goes quiet (a closed window), so keep saying it.
    const beat = setInterval(say, 4_000);
    return () => {
      clearInterval(beat);
      api.streamWatch(0, false);
      off();
      if (current) URL.revokeObjectURL(current);
      setUrl(null);
    };
  }, [fps, ready]);
  return url;
}

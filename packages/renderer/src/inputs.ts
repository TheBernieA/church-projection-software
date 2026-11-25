import type { CameraView, VideoInputLayer } from '@lampstand/core';
import { FILL } from './constants';
import { el } from './dom';

/** Microphone settings for the room: call processing (echo/noise/gain) would colour it. */
export const RAW_AUDIO = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
} as const;

/** Ask the device for the chosen capture size (16:9), or whatever it offers. */
function videoConstraints(
  input: Pick<VideoInputLayer, 'deviceId' | 'resolution'>,
): MediaTrackConstraints {
  const h = input.resolution === 'auto' ? 0 : Number(input.resolution);
  return {
    deviceId: { exact: input.deviceId },
    ...(h ? { height: { ideal: h }, width: { ideal: Math.round((h * 16) / 9) } } : {}),
  };
}

/** Stop every track of a stream (releases the camera or microphone). */
function release(stream: MediaStream | null): void {
  for (const t of stream?.getTracks() ?? []) t.stop();
}

/**
 * The CSS transform that shows a camera's digital shot (zoomed about the shot's middle), and its
 * mirror. The picture moves under a fixed frame: the shot's middle comes to the frame's middle.
 */
export function cameraTransform(view: CameraView | undefined, mirror: boolean): string {
  const flip = mirror ? 'scaleX(-1)' : '';
  if (!view || view.zoom <= 1.0001) return flip;
  const tx = ((0.5 - view.x) * 100).toFixed(3);
  const ty = ((0.5 - view.y) * 100).toFixed(3);
  return `${flip} scale(${view.zoom.toFixed(4)}) translate(${tx}%, ${ty}%)`.trim();
}

/** A digital shot glides between updates (following sends about 15 a second). */
const VIEW_GLIDE = 'transform 120ms linear';

/**
 * A live camera / capture card, full screen. Opens the device itself; `dispose` releases it.
 * Thumbnails never open a camera: they show a card naming the input instead.
 */
export function buildVideoInput(
  doc: Document,
  input: VideoInputLayer,
  live: boolean,
  view?: CameraView,
): { node: HTMLElement; dispose: () => void; setView: (v: CameraView | undefined) => void } {
  const wrap = el(doc, 'div', 'ls-input', { ...FILL, background: '#000', overflow: 'hidden' });
  if (!live) {
    const card = el(doc, 'div', 'ls-input-card', {
      ...FILL,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'rgba(255,255,255,0.7)',
      font: '600 48px system-ui, sans-serif',
    });
    card.textContent = input.label;
    wrap.append(card);
    return { node: wrap, dispose: () => undefined, setView: () => undefined };
  }
  const v = el(doc, 'video', '', {
    ...FILL,
    objectFit: input.fit,
    transform: cameraTransform(view, input.mirror),
    transition: VIEW_GLIDE,
  });
  v.muted = true; // a camera's own sound comes through an audio input, if wanted
  v.autoplay = true;
  v.playsInline = true;
  wrap.append(v);
  let stream: MediaStream | null = null;
  let disposed = false;
  const media = doc.defaultView?.navigator.mediaDevices;
  void media
    ?.getUserMedia({ video: videoConstraints(input), audio: false })
    .then((s) => {
      if (disposed) return release(s);
      stream = s;
      v.srcObject = s;
    })
    .catch(() => {
      // The device went away or was refused: show its name rather than a black hole.
      wrap.textContent = input.label;
    });
  let shown = v.style.transform;
  return {
    node: wrap,
    dispose: () => {
      disposed = true;
      release(stream);
    },
    setView: (next) => {
      const t = cameraTransform(next, input.mirror);
      if (t !== shown) v.style.transform = shown = t;
    },
  };
}

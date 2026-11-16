import type { AudioInputCue, VideoInputLayer } from '@lampstand/core';
import { FILL } from './constants';
import { el } from './dom';

/** Stop every track of a stream (releases the camera or microphone). */
function release(stream: MediaStream | null): void {
  for (const t of stream?.getTracks() ?? []) t.stop();
}

/**
 * A live camera / capture card, full screen. Opens the device itself; `dispose` releases it.
 * Thumbnails never open a camera: they show a card naming the input instead.
 */
export function buildVideoInput(
  doc: Document,
  input: VideoInputLayer,
  live: boolean,
): { node: HTMLElement; dispose: () => void } {
  const wrap = el(doc, 'div', 'ls-input', { ...FILL, background: '#000' });
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
    return { node: wrap, dispose: () => undefined };
  }
  const v = el(doc, 'video', '', { ...FILL, objectFit: input.fit });
  v.muted = true; // a camera's own sound comes through an audio input, if wanted
  v.autoplay = true;
  v.playsInline = true;
  wrap.append(v);
  let stream: MediaStream | null = null;
  let disposed = false;
  const media = doc.defaultView?.navigator.mediaDevices;
  void media
    ?.getUserMedia({ video: { deviceId: { exact: input.deviceId } }, audio: false })
    .then((s) => {
      if (disposed) return release(s);
      stream = s;
      v.srcObject = s;
    })
    .catch(() => {
      // The device went away or was refused: show its name rather than a black hole.
      wrap.textContent = input.label;
    });
  return {
    node: wrap,
    dispose: () => {
      disposed = true;
      release(stream);
    },
  };
}

/**
 * Plays a live audio input (microphone, mixer feed) through this window's speakers, with the
 * cue's volume. Processing meant for calls (echo cancellation, noise suppression, auto gain)
 * is off: it would colour music and speech in the room.
 */
export class AudioInputPlayer {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private deviceId: string | null = null;

  constructor(private readonly win: Window) {}

  sync(cue: AudioInputCue | null): void {
    if (!cue) return this.stop();
    if (this.gain) this.gain.gain.value = cue.volume;
    if (cue.deviceId === this.deviceId) return;
    this.stop();
    this.deviceId = cue.deviceId;
    const want = cue.deviceId;
    void this.win.navigator.mediaDevices
      .getUserMedia({
        audio: {
          deviceId: { exact: cue.deviceId },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      })
      .then((s) => {
        if (this.deviceId !== want) return release(s);
        this.stream = s;
        const Ctx = (this.win as Window & { AudioContext: typeof AudioContext }).AudioContext;
        const ctx = new Ctx();
        const gain = ctx.createGain();
        gain.gain.value = cue.volume;
        ctx.createMediaStreamSource(s).connect(gain).connect(ctx.destination);
        this.ctx = ctx;
        this.gain = gain;
      })
      .catch(() => undefined);
  }

  stop(): void {
    release(this.stream);
    this.stream = null;
    void this.ctx?.close();
    this.ctx = null;
    this.gain = null;
    this.deviceId = null;
  }
}

import type { AudioInputCue, VideoInputLayer } from '@lampstand/core';
import { FILL } from './constants';
import { el } from './dom';

/** Microphone settings for the room: call processing (echo/noise/gain) would colour it. */
export const RAW_AUDIO = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
} as const;

/** Ask the device for the chosen capture size (16:9), or whatever it offers. */
export function videoConstraints(
  input: Pick<VideoInputLayer, 'deviceId' | 'resolution'>,
): MediaTrackConstraints {
  const h = input.resolution === 'auto' ? 0 : Number(input.resolution);
  return {
    deviceId: { exact: input.deviceId },
    ...(h ? { height: { ideal: h }, width: { ideal: Math.round((h * 16) / 9) } } : {}),
  };
}

/** Send an AudioContext to an output device (Chromium's AudioContext.setSinkId). */
function routeContext(ctx: AudioContext, sinkId: string): void {
  const c = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  void c.setSinkId?.(sinkId).catch(() => undefined);
}

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
  const v = el(doc, 'video', '', {
    ...FILL,
    objectFit: input.fit,
    transform: input.mirror ? 'scaleX(-1)' : '',
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
  private sinkId = '';

  constructor(private readonly win: Window) {}

  /** Where it plays ('' = this window's default output). */
  setSink(sinkId: string): void {
    this.sinkId = sinkId;
    if (this.ctx) routeContext(this.ctx, sinkId);
  }

  sync(cue: AudioInputCue | null): void {
    if (!cue) return this.stop();
    if (this.gain) this.gain.gain.value = cue.volume;
    if (cue.deviceId === this.deviceId) return;
    this.stop();
    this.deviceId = cue.deviceId;
    const want = cue.deviceId;
    void this.win.navigator.mediaDevices
      .getUserMedia({
        audio: { deviceId: { exact: cue.deviceId }, ...RAW_AUDIO },
        video: false,
      })
      .then((s) => {
        if (this.deviceId !== want) return release(s);
        this.stream = s;
        const Ctx = (this.win as Window & { AudioContext: typeof AudioContext }).AudioContext;
        const ctx = new Ctx();
        if (this.sinkId) routeContext(ctx, this.sinkId);
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

import { useSyncExternalStore } from 'react';
import { mediaUrl } from '../../shared/mediaUrl';
import { setDuration } from './mediaDurations';

/**
 * Listen before it goes live: one track at a time plays on this computer only (headphones or
 * the operator's speakers), never through the room. The room hears it only after "Play in room".
 */
export interface PreviewState {
  mediaId: string | null;
  playing: boolean;
  position: number;
  /** Where preview audio comes out ('' = the computer's default output). */
  sinkId: string;
}

const SINK_KEY = 'lampstand.previewSink';
const readSink = (): string => {
  try {
    return localStorage.getItem(SINK_KEY) ?? '';
  } catch {
    return '';
  }
};

let state: PreviewState = { mediaId: null, playing: false, position: 0, sinkId: readSink() };
const listeners = new Set<() => void>();
let el: HTMLAudioElement | null = null;

function set(patch: Partial<PreviewState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

/** The one preview element, created on first use and routed to the chosen output. */
function audio(): HTMLAudioElement {
  if (el) return el;
  const a = document.createElement('audio');
  a.preload = 'auto';
  a.addEventListener('timeupdate', () => set({ position: a.currentTime }));
  a.addEventListener('play', () => set({ playing: true }));
  a.addEventListener('pause', () => set({ playing: false }));
  a.addEventListener('ended', () => set({ playing: false }));
  a.addEventListener('loadedmetadata', () => {
    if (state.mediaId && Number.isFinite(a.duration)) setDuration(state.mediaId, a.duration);
  });
  void routeTo(a, state.sinkId);
  el = a;
  return a;
}

async function routeTo(a: HTMLAudioElement, sinkId: string): Promise<void> {
  try {
    await a.setSinkId(sinkId);
  } catch {
    /* the device went away: keep the default output */
  }
}

/** Where "Listen on" plays (headphones), and a way to hear when it changes. */
export const previewSink = (): string => state.sinkId;
export function onPreviewChange(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Start listening to a track (from the start, or from `position`). */
export function previewTrack(mediaId: string, position = 0): void {
  const a = audio();
  if (state.mediaId !== mediaId) a.src = mediaUrl(mediaId);
  a.currentTime = position;
  set({ mediaId, position });
  void a.play().catch(() => set({ playing: false }));
}

export function togglePreview(): void {
  const a = audio();
  if (!state.mediaId) return;
  if (a.paused) void a.play().catch(() => undefined);
  else a.pause();
}

export function seekPreview(position: number): void {
  if (!el) return;
  el.currentTime = position;
  set({ position });
}

export function stopPreview(): void {
  if (el) {
    el.pause();
    el.removeAttribute('src');
    el.load();
  }
  set({ mediaId: null, playing: false, position: 0 });
}

/** Choose where preview audio plays ('' = default). Remembered on this computer. */
export function setPreviewOutput(sinkId: string): void {
  try {
    localStorage.setItem(SINK_KEY, sinkId);
  } catch {
    /* private window: just for this session */
  }
  set({ sinkId });
  if (el) void routeTo(el, sinkId);
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useAudioPreview(): PreviewState {
  return useSyncExternalStore(subscribe, () => state);
}

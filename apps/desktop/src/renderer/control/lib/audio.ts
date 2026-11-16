import { audioFadeAt, audioPositionAt, type AudioCue } from '@lampstand/core';
import { AudioPlayer } from '@lampstand/renderer';
import { cmd } from './api';
import { durations, knownDuration } from './mediaDurations';
import { attempt, useStore } from './store';
import { mediaUrl } from '../../shared/mediaUrl';

const get = useStore.getState;

/** Send a room-audio command (Audio tab). */
export const audioCmd = (payload: Record<string, unknown>): Promise<unknown> =>
  attempt(() => cmd('live.audio', payload), 'errors.audio');

/** Play a track through the room; from a playlist, the playlist carries on after it. */
export const playAudio = (mediaId: string, playlistId: string | null = null): Promise<unknown> =>
  audioCmd({ action: 'play', mediaId, playlistId });

/** The tracks an audio playlist plays, in order (missing files skipped). */
export function playlistTracks(playlistId: string): string[] {
  const s = get();
  const p = s.mediaPlaylists.find((x) => x.id === playlistId);
  const audio = new Set(s.media.filter((m) => m.kind === 'audio').map((m) => m.id));
  return (p?.mediaIds ?? []).filter((id) => audio.has(id));
}

/** Next (or previous) track in the playing cue's playlist, if there is one. */
export function neighbourTrack(delta: 1 | -1): string | null {
  const a = get().live?.audio;
  if (!a?.playlistId) return null;
  const tracks = playlistTracks(a.playlistId);
  const at = tracks.indexOf(a.mediaId);
  return tracks[at + delta] ?? null;
}

/** Read a track's length from its file once (metadata only) and cache it. */
const probing = new Set<string>();
export function probeDuration(id: string): void {
  if (durations.has(id) || probing.has(id)) return;
  probing.add(id);
  const el = document.createElement('audio');
  el.preload = 'metadata';
  const done = (): void => {
    if (Number.isFinite(el.duration) && el.duration > 0) durations.set(id, el.duration);
    probing.delete(id);
    el.removeAttribute('src');
    el.load();
  };
  el.addEventListener('loadedmetadata', done, { once: true });
  el.addEventListener('error', done, { once: true });
  el.src = mediaUrl(id);
}

/**
 * Keep room audio moving: a fade-out ends in silence and stops; at the end of a track from a
 * playlist, the next track starts (the last one stops).
 */
export function installAudioWatch(): () => void {
  let handled = '';
  const timer = setInterval(() => {
    const s = get();
    const a = s.live?.audio;
    if (!a) return;
    const key = `${a.mediaId}|${a.syncedAt ?? ''}|${a.fade?.at ?? ''}`;
    if (key === handled) return;
    const now = Date.now();
    if (a.fade && audioFadeAt(a, now) <= 0) {
      handled = key;
      void audioCmd({ action: 'stop' });
      return;
    }
    if (!a.playing || a.loop) return;
    const lib = s.media.find((m) => m.id === a.mediaId)?.durationSec;
    const duration = knownDuration(a.mediaId, lib);
    if (duration === undefined) return probeDuration(a.mediaId);
    if (audioPositionAt(a, now) < duration - 0.15) return;
    handled = key;
    const next = neighbourTrack(1);
    void (next ? playAudio(next, a.playlistId ?? null) : audioCmd({ action: 'stop' }));
  }, 250);
  return () => clearInterval(timer);
}

/**
 * With no output window connected, the control window plays room audio itself (like the
 * Program monitor does for video), so the operator still hears it.
 */
export function installLocalAudio(): () => void {
  let player: AudioPlayer | null = null;
  let last: { cue: AudioCue | null; local: boolean } | null = null;
  const sync = (): void => {
    const s = get();
    const local = !(s.settings?.windowMode || s.displays.some((d) => d.role === 'main'));
    // Only when the cue or where it plays changes (the store changes for everything else too).
    const cue = s.live?.audio ?? null;
    if (last?.cue === cue && last.local === local) return;
    last = { cue, local };
    if (local && !player) player = new AudioPlayer(document, mediaUrl);
    if (!local && player) {
      player.destroy();
      player = null;
    }
    player?.sync(s.live?.audio ?? null);
  };
  sync();
  const off = useStore.subscribe(sync);
  return () => {
    off();
    player?.destroy();
  };
}

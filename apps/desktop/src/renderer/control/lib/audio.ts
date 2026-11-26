import { audioFadeAt, audioPositionAt, type AudioCue, type Mixer } from '@lampstand/core';
import { AudioPlayer, MixerEngine, RoomAudio } from '@lampstand/renderer';
import { onPreviewChange, previewSink } from './audioPreview';
import { publishMeters } from './meters';
import { cmd } from './api';
import { hasDuration, knownDuration, setDuration } from './mediaDurations';
import { attempt, useStore } from './store';
import { mediaUrl } from '../../shared/mediaUrl';
import { meterReport } from '../../shared/meterReport';
import { installMixerWorklet } from '../../shared/mixerWorklet';

installMixerWorklet();

const get = useStore.getState;

/** Send a room-audio command (Audio tab). */
export const audioCmd = (payload: Record<string, unknown>): Promise<unknown> =>
  attempt(() => cmd('live.audio', payload), 'errors.audio');

/** Play a track through the room; from a playlist, the playlist carries on after it. */
export const playAudio = (
  mediaId: string,
  playlistId: string | null = null,
  position = 0,
): Promise<unknown> => {
  // Settings › Audio can start every track at the same volume.
  const start = get().settings?.audio.startVolume;
  return audioCmd({
    action: 'play',
    mediaId,
    playlistId,
    position,
    ...(start != null ? { volume: start } : {}),
  });
};

/** The tracks an audio playlist plays, in order (missing files skipped). */
function playlistTracks(playlistId: string): string[] {
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
  if (hasDuration(id) || probing.has(id)) return;
  probing.add(id);
  const el = document.createElement('audio');
  el.preload = 'metadata';
  const done = (): void => {
    if (Number.isFinite(el.duration) && el.duration > 0) setDuration(id, el.duration);
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
    // Settings › Audio: carry on with the playlist (from the top again, if it loops), or stop.
    const opts = s.settings?.audio;
    const first = a.playlistId ? (playlistTracks(a.playlistId)[0] ?? null) : null;
    const next =
      opts?.afterTrack === 'stop'
        ? null
        : (neighbourTrack(1) ?? (opts?.loopPlaylist ? first : null));
    void (next ? playAudio(next, a.playlistId ?? null) : audioCmd({ action: 'stop' }));
  }, 250);
  return () => clearInterval(timer);
}

let local: RoomAudio | null = null;

/**
 * Video sound for the Program monitor when it plays the room's sound (no output window): it
 * goes through the room mix like on the main output.
 */
export const localVideoTap = (v: HTMLMediaElement): void => local?.tapVideo(v);

/**
 * With no output window connected, the control window plays room audio itself (like the
 * Program monitor does for video), so the operator still hears it, through the room mix.
 */
export function installLocalAudio(): () => void {
  let last: {
    cue: AudioCue | null;
    mixer: Mixer | null;
    scope: string | null;
    on: boolean;
    sink: string;
  } | null = null;
  const sync = (): void => {
    const s = get();
    const on = !(s.settings?.windowMode || s.displays.some((d) => d.role === 'main'));
    // Only when the cue, the mixer or where it plays changes (the store changes for everything).
    const cue = s.live?.audio ?? null;
    const mixer = s.live?.mixer ?? null;
    const scope = s.live?.mixerScope ?? null;
    const sink = s.settings?.audio.roomOutput ?? '';
    if (
      last?.cue === cue &&
      last.mixer === mixer &&
      last.scope === scope &&
      last.on === on &&
      last.sink === sink
    )
      return;
    last = { cue, mixer, scope, on, sink };
    if (on && !local) {
      local = new RoomAudio(window, mediaUrl);
      local.mixer.startMeters((l) => publishMeters(meterReport('room', l)));
    }
    if (!on && local) {
      local.destroy();
      local = null;
    }
    local?.setSink(sink);
    if (mixer) local?.sync(cue, mixer, scope);
  };
  sync();
  const off = useStore.subscribe(sync);
  return () => {
    off();
    local?.destroy();
    local = null;
  };
}

/**
 * Solo: soloed channels play on the "Listen on" output (headphones) in this window, after their
 * fader and EQ, so the operator can check a mic or a track without the room hearing anything new.
 */
export function installCueMix(): () => void {
  let engine: MixerEngine | null = null;
  let player: AudioPlayer | null = null;
  let last: { cue: AudioCue | null; mixer: Mixer | null; sink: string } | null = null;
  const sync = (): void => {
    const s = get();
    const mixer = s.live?.mixer ?? null;
    const cue = s.live?.audio ?? null;
    const sink = previewSink();
    if (last?.cue === cue && last.mixer === mixer && last.sink === sink) return;
    last = { cue, mixer, sink };
    const soloed = mixer?.channels.filter((c) => c.solo) ?? [];
    if (!soloed.length || !mixer) {
      engine?.destroy();
      player?.destroy();
      engine = null;
      player = null;
      return;
    }
    if (!engine) {
      engine = new MixerEngine(window, { bus: 'cue', speakers: true });
      player = new AudioPlayer(document, mediaUrl);
      engine.attach('tracks', player.element);
    }
    engine.setSink(sink);
    // The track plays here only while its channel is soloed.
    player?.sync(soloed.some((c) => c.kind === 'tracks') ? cue : null);
    engine.sync(mixer);
  };
  sync();
  const offStore = useStore.subscribe(sync);
  const offSink = onPreviewChange(sync);
  return () => {
    offStore();
    offSink();
    engine?.destroy();
    player?.destroy();
  };
}

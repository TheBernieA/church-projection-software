import { applyLook, lookLayersFor, withWordsTheme, type LiveState } from '@lampstand/core';
import { buildTestPattern, RoomAudio, SceneRenderer } from '@lampstand/renderer';
import { fontsReady } from '../shared/fonts';
import { mediaUrl } from '../shared/mediaUrl';
import '../shared/outputApi.d';

/**
 * Projector output. Deliberately dumb and resilient (§3.2): it only renders snapshots. If IPC
 * goes quiet it keeps the last frame; if it crashes, main respawns it and resends state.
 */
const host = document.getElementById('host');
if (!host) throw new Error('missing host');
const api = window.lampstandOutput;

let renderer: SceneRenderer | null = null;
let outputId = new URLSearchParams(location.search).get('id') ?? '';
let info = { label: 'Output', width: 1920, height: 1080, audio: false };
let role: 'main' | 'secondary' | 'stage' | 'none' = 'main';
let pattern: HTMLElement | null = null;
let latest: LiveState | null = null;
let ready = false;
/** Room audio plays from the main output only. */
let audio: RoomAudio | null = null;

function draw(state: LiveState): void {
  latest = state;
  audio?.sync(state.audio, state.mixer);
  if (!ready || !renderer) return;
  // The active Look decides which layers this kind of screen shows.
  const layers = lookLayersFor(state.look, role);
  // The main output carries the room's sound: if its Look hides media while a video plays,
  // it keeps playing the video, unseen, so the sound isn't lost.
  const silentVideo =
    info.audio && !!layers && !layers.includes('media') && state.program.media?.kind === 'video';
  // Lower-third mode: the audience screens draw the words with its theme.
  const program =
    role === 'main' || role === 'secondary'
      ? withWordsTheme(state.program, state.lowerThird)
      : state.program;
  renderer.render(applyLook(program, silentVideo ? [...layers, 'media'] : layers));
  renderer.setMediaHidden(silentVideo);
  const showPattern = state.testPatterns.includes(outputId) || state.testPatterns.includes('*');
  if (showPattern && !pattern) {
    pattern = buildTestPattern(document, info);
    pattern.style.zIndex = '10';
    host?.append(pattern);
  } else if (!showPattern && pattern) {
    pattern.remove();
    pattern = null;
  }
}

api.onInfo((i) => {
  outputId = i.outputId;
  role = i.role;
  info = { label: i.label, width: i.width, height: i.height, audio: i.audio };
  if (!renderer) {
    renderer = new SceneRenderer(host, {
      mode: 'output',
      mediaUrl,
      audio: i.audio,
    });
  }
  if (i.audio && !audio) {
    // The room mix lives here: video sound joins it, and its levels feed the Mixer's meters.
    audio = new RoomAudio(window, mediaUrl);
    renderer.setAudioTap(audio.tapVideo);
    audio.mixer.startMeters((l) =>
      api.sendMeters({ bus: 'room', channels: l.channels, level: l.bus }),
    );
  }
  audio?.setSink(i.audioSink);
  renderer.setAudioSink(i.audioSink);
  if (!i.audio && audio) {
    renderer.setAudioTap(undefined);
    audio.destroy();
    audio = null;
  }
  // Info is re-sent whenever the logo or off-air screen changes.
  renderer.setLogo(i.logo);
  renderer.setStandby(i.standby);
  renderer.setMask(i.mask);
  if (latest) draw(latest);
});
api.onLiveState(draw);

void fontsReady().then(() => {
  ready = true;
  api.ready();
  if (latest) draw(latest);
});

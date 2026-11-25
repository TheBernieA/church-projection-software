import {
  applyLook,
  keyFeedScene,
  lookLayersFor,
  withKindThemes,
  withScreenWords,
  withWordsTheme,
  type KeyFeedMode,
  type ResolvedKindThemes,
  type ScreenWords,
} from '@lampstand/core';
import { buildTestPattern, RoomAudio, SceneRenderer } from '@lampstand/renderer';
import type { LiveDelivery, OutputInfo } from '@lampstand/ipc-contract';
import { fitScreen } from './screenFit';
import { fontsReady } from '../shared/fonts';
import { mediaUrl } from '../shared/mediaUrl';
import { meterReport } from '../shared/meterReport';
import { installMixerWorklet } from '../shared/mixerWorklet';
import '../shared/outputApi.d';

installMixerWorklet();

/**
 * Projector output. Deliberately dumb and resilient (§3.2): it only renders snapshots. If IPC
 * goes quiet it keeps the last frame; if it crashes, main respawns it and resends state.
 */
const screenEl = document.getElementById('host');
if (!screenEl) throw new Error('missing host');
const api = window.lampstandOutput;
/** The picture's own element: the whole screen, or (edge blending) this screen's slice of a wider one. */
const host = document.createElement('div');
host.id = 'picture';
screenEl.append(host);
/** Which canvas the renderer was made for (edge blending changes it). */
let canvasKey = '';

let renderer: SceneRenderer | null = null;
let outputId = new URLSearchParams(location.search).get('id') ?? '';
let info = { label: 'Output', width: 1920, height: 1080, audio: false };
let role: 'main' | 'secondary' | 'stage' | 'none' = 'main';
let pattern: HTMLElement | null = null;
let latest: LiveDelivery | null = null;
let themes: ResolvedKindThemes = {};
let key: KeyFeedMode = 'off';
/** How this screen draws the words, over each theme (Words on the screens). */
let words: ScreenWords = { scale: 1, align: 'theme' };
let ready = false;
/** Room audio plays from the main output only. */
let audio: RoomAudio | null = null;

/** The renderer has drawn the current picture (a new renderer hasn't, yet). */
let pictured: SceneRenderer | null = null;

function draw(state: LiveDelivery): void {
  // Kept without the flag, so a later redraw (new renderer, new info) draws it in full.
  latest =
    state.soundOnly || state.viewsOnly ? { ...state, soundOnly: false, viewsOnly: false } : state;
  audio?.sync(state.audio, state.mixer);
  if (!ready || !renderer) return;
  // The cameras' digital shots: moved in place (following someone sends many a second).
  renderer.setCameraViews(state.cameraViews);
  // Only the sound moved (a fader), or only a camera's shot: nothing else to redraw.
  if ((state.soundOnly || state.viewsOnly) && pictured === renderer) return;
  pictured = renderer;
  // The active Look decides which layers this kind of screen shows.
  const layers = lookLayersFor(state.look, role);
  // The main output carries the room's sound: if its Look hides media while a video plays,
  // it keeps playing the video, unseen, so the sound isn't lost.
  const silentVideo =
    info.audio && !!layers && !layers.includes('media') && state.program.media?.kind === 'video';
  // Lower-third mode: the audience screens draw the words with its theme.
  let program =
    role === 'main' || role === 'secondary'
      ? withWordsTheme(state.program, state.lowerThird)
      : state.program;
  // The alternate output: its own themes, and (as a key feed) words only over a flat colour.
  program = applyLook(
    withScreenWords(withKindThemes(program, themes), words),
    silentVideo ? [...layers, 'media'] : layers,
  );
  // After the Look, so the key colour is there whatever layers the Look shows.
  renderer.render(key === 'off' ? program : keyFeedScene(program, key));
  renderer.setMediaHidden(silentVideo);
  const showPattern = state.testPatterns.includes(outputId) || state.testPatterns.includes('*');
  if (showPattern && !pattern) {
    pattern = buildTestPattern(document, info);
    pattern.style.zIndex = '10';
    screenEl?.append(pattern);
  } else if (!showPattern && pattern) {
    pattern.remove();
    pattern = null;
  }
}

api.onInfo((i: OutputInfo) => {
  outputId = i.outputId;
  role = i.role;
  themes = i.themes;
  key = i.key;
  words = i.words;
  info = { label: i.label, width: i.width, height: i.height, audio: i.audio };
  // Fit the picture to the screen (keystone, scale, flips, colour) and lay out its slice when
  // blending; a new canvas size means a new renderer (the scene is drawn into it again below).
  const fit = fitScreen(screenEl, host, i);
  if (!renderer || fit.canvasKey !== canvasKey) {
    if (renderer) {
      renderer.setAudioTap(undefined);
      renderer.destroy();
    }
    canvasKey = fit.canvasKey;
    renderer = new SceneRenderer(host, {
      mode: 'output',
      mediaUrl,
      audio: i.audio,
      canvas: fit.canvas,
    });
    if (audio) renderer.setAudioTap(audio.tapVideo);
  }
  renderer.setAudio(i.audio);
  if (i.audio && !audio) {
    // The room mix lives here: video sound joins it, and its levels feed the Mixer's meters.
    audio = new RoomAudio(window, mediaUrl);
    renderer.setAudioTap(audio.tapVideo);
    audio.mixer.startMeters((l) => api.sendMeters(meterReport('room', l)));
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

import type { LiveState } from '@lampstand/core';
import { buildTestPattern, SceneRenderer } from '@lampstand/renderer';
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
let pattern: HTMLElement | null = null;
let latest: LiveState | null = null;
let ready = false;

function draw(state: LiveState): void {
  latest = state;
  if (!ready || !renderer) return;
  renderer.render(state.program);
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
  info = { label: i.label, width: i.width, height: i.height, audio: i.audio };
  if (!renderer) {
    renderer = new SceneRenderer(host, {
      mode: 'output',
      mediaUrl,
      audio: i.audio,
    });
  }
  // Info is re-sent whenever the logo or off-air screen changes.
  renderer.setLogo(i.logo);
  renderer.setStandby(i.standby);
  if (latest) draw(latest);
});
api.onLiveState(draw);

void fontsReady().then(() => {
  ready = true;
  api.ready();
  if (latest) draw(latest);
});

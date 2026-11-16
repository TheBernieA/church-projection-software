import { applyLook, lookLayersFor, type LiveState, type Scene } from '@lampstand/core';
import type { StreamApi, StreamConfig } from '@lampstand/ipc-contract';
import { AudioPlayer, buildVideoInput, RAW_AUDIO, SceneRenderer } from '@lampstand/renderer';
import { fontsReady } from '../shared/fonts';
import { mediaUrl } from '../shared/mediaUrl';
import pcmTapUrl from './pcmTap.worklet.js?url';

/**
 * The livestream picture and sound, drawn offscreen (main encodes what it paints). Layers, back
 * to front: a camera, the program's background and video, a soft band for lower-third words,
 * then the words, props and messages (and the Black / Logo masks, which cover everything).
 * The sound mixes the room audio (Audio tab tracks and video sound) with chosen microphones.
 */
const api = (window as unknown as { lampstandStream: StreamApi }).lampstandStream;
const $ = (id: string): HTMLElement => {
  const e = document.getElementById(id);
  if (!e) throw new Error(id);
  return e;
};

const back = new SceneRenderer($('back'), {
  mode: 'output',
  mediaUrl,
  transparent: true,
  audio: true,
});
const words = new SceneRenderer($('words'), { mode: 'output', mediaUrl, transparent: true });
let config: StreamConfig | null = null;
let latest: LiveState | null = null;

// ---------- Picture ----------

let camera: { id: string; dispose: () => void } | null = null;
function syncCamera(id: string | null): void {
  if ((camera?.id ?? null) === id) return;
  camera?.dispose();
  $('camera').replaceChildren();
  camera = null;
  if (!id) return;
  const built = buildVideoInput(
    document,
    { deviceId: id, label: '', fit: 'cover', mirror: false, resolution: 'auto' },
    true,
  );
  $('camera').append(built.node);
  camera = { id, dispose: built.dispose };
}

const NO_MASKS = { black: false, logo: false, freeze: false };

function draw(): void {
  if (!latest || !config) return;
  const pic = config.picture;
  // What the audience screens show under the active Look.
  const program: Scene = applyLook(latest.program, lookLayersFor(latest.look, 'main'));
  const onCamera = pic.background === 'camera' && !!pic.camera;
  syncCamera(onCamera ? pic.camera : null);
  back.render(
    {
      ...program,
      background: pic.background === 'program' ? program.background : null,
      input: onCamera ? null : program.input,
      content: null,
      announcement: null,
      web: null,
      overlays: [],
      masks: NO_MASKS,
    },
    { instant: false },
  );
  const showWords = pic.words !== 'none';
  words.render({
    ...program,
    background: null,
    media: null,
    input: null,
    web: null,
    content: showWords ? program.content : null,
    announcement: showWords ? program.announcement : null,
  });
  document.body.classList.toggle('lower-third', pic.words === 'lowerThird');
  document.body.classList.toggle('has-words', showWords && !!program.content);
  room.sync(latest.audio);
}

// ---------- Sound ----------

const ctx = new AudioContext({ sampleRate: 48_000 });
const master = ctx.createGain();
const roomGain = ctx.createGain();
roomGain.connect(master);
const room = new AudioPlayer(document, mediaUrl);
ctx.createMediaElementSource(room.element).connect(roomGain);

// Every video the background draws: its sound into the room mix (not the speakers).
const tapped = new WeakSet<HTMLMediaElement>();
new MutationObserver(() => {
  for (const v of $('back').querySelectorAll('video')) {
    if (tapped.has(v)) continue;
    tapped.add(v);
    ctx.createMediaElementSource(v).connect(roomGain);
  }
}).observe($('back'), { childList: true, subtree: true });

const mics = new Map<string, { stream: MediaStream; gain: GainNode }>();
function syncMics(wanted: { deviceId: string; gain: number }[]): void {
  for (const [id, m] of mics)
    if (!wanted.some((w) => w.deviceId === id)) {
      m.gain.disconnect();
      for (const t of m.stream.getTracks()) t.stop();
      mics.delete(id);
    }
  for (const w of wanted) {
    const have = mics.get(w.deviceId);
    if (have) {
      have.gain.gain.value = w.gain;
      continue;
    }
    void navigator.mediaDevices
      .getUserMedia({ audio: { deviceId: { exact: w.deviceId }, ...RAW_AUDIO }, video: false })
      .then((stream) => {
        const gain = ctx.createGain();
        gain.gain.value = w.gain;
        ctx.createMediaStreamSource(stream).connect(gain).connect(master);
        mics.set(w.deviceId, { stream, gain });
      })
      .catch(() => undefined);
  }
}

// The mix goes to main as interleaved stereo float32 (it never plays on this computer).
const mute = ctx.createGain();
mute.gain.value = 0;
const tapReady = ctx.audioWorklet.addModule(pcmTapUrl).then(() => {
  const tap = new AudioWorkletNode(ctx, 'pcm-tap', { numberOfInputs: 1, outputChannelCount: [2] });
  tap.port.onmessage = (e: MessageEvent<Float32Array>) => api.sendAudio(e.data);
  master.connect(tap);
  tap.connect(mute).connect(ctx.destination);
});

api.onConfig((c) => {
  config = c;
  // The Logo mask covers the stream too. (No off-air card: the words layer is often empty on
  // purpose, and the stream shows its camera or black when nothing is live.)
  words.setLogo(c.logo);
  roomGain.gain.value = c.sound.room ? c.sound.roomGain : 0;
  syncMics(c.sound.mics);
  draw();
});
api.onLiveState((s) => {
  latest = s;
  draw();
});

void Promise.all([fontsReady(), tapReady.catch(() => undefined)]).then(() => {
  void ctx.resume();
  api.ready();
});

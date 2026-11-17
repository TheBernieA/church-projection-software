import {
  applyLook,
  lookLayersFor,
  type LiveState,
  type Mixer,
  type Scene,
  type VideoInputLayer,
} from '@lampstand/core';
import type { StreamApi, StreamConfig } from '@lampstand/ipc-contract';
import { AudioPlayer, buildVideoInput, MixerEngine, SceneRenderer } from '@lampstand/renderer';
import { fontsReady } from '../shared/fonts';
import { mediaUrl } from '../shared/mediaUrl';
// A real file, never inlined: the security policy doesn't run scripts from data: addresses
// (inlined, the tap failed to load and the stream had no sound).
import pcmTapUrl from './pcmTap.worklet.js?url&no-inline';
import { StreamEncoder } from './encoder';

/**
 * The livestream picture and sound, drawn offscreen (main encodes what it paints). Layers, back
 * to front: a camera, the program's background and video, a soft band for lower-third words,
 * then the words, props and messages (and the Black / Logo masks, which cover everything).
 * The sound is the Mixer's stream bus: tracks, video sound and inputs sent to the stream.
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

/** The stream's own camera, with its saved settings (fit, mirror, capture size). */
let camera: { key: string; dispose: () => void } | null = null;
function syncCamera(layer: VideoInputLayer | null): void {
  const key = layer ? `${layer.deviceId}|${layer.fit}|${layer.mirror}|${layer.resolution}` : '';
  if ((camera?.key ?? '') === key) return;
  camera?.dispose();
  $('camera').replaceChildren();
  camera = null;
  if (!layer) return;
  const built = buildVideoInput(document, layer, true);
  $('camera').append(built.node);
  camera = { key, dispose: built.dispose };
}

/**
 * What was last drawn: live updates the stream doesn't show (timers, stage messages, Preview)
 * change nothing here, so they don't redraw anything.
 */
let drawn: unknown[] = [];

const NO_MASKS = { black: false, logo: false, freeze: false };

function draw(): void {
  if (!latest || !config) return;
  const inputs = [config, latest.program, latest.look, latest.audio, latest.mixer];
  if (inputs.length === drawn.length && inputs.every((x, i) => x === drawn[i])) return;
  drawn = inputs;
  const pic = config.picture;
  // What the audience screens show under the active Look.
  const program: Scene = applyLook(latest.program, lookLayersFor(latest.look, 'main'));
  const onCamera = pic.background === 'camera' && !!config.cameraLayer;
  // 'none': only the words, over transparency (the NDI key feed).
  const bare = pic.background === 'none';
  syncCamera(onCamera ? config.cameraLayer : null);
  back.render(
    {
      ...program,
      background: pic.background === 'program' ? program.background : null,
      media: bare ? null : program.media,
      input: onCamera || bare ? null : program.input,
      inputNext: onCamera || bare ? null : (program.inputNext ?? null),
      pip: bare ? null : (program.pip ?? null),
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
    inputNext: null,
    pip: null,
    web: null,
    content: showWords ? program.content : null,
    announcement: showWords ? program.announcement : null,
  });
  document.body.classList.toggle('lower-third', pic.words === 'lowerThird');
  document.body.classList.toggle('has-words', showWords && !!program.content);
  // Getting ready (not live yet): no sound, and no microphones open.
  room.sync(config.mix ? latest.audio : null);
  mix.sync(config.mix ? latest.mixer : silent(latest.mixer));
}

// ---------- Sound ----------

/** The mixer with nothing sent to the stream (inputs close). */
const silentCache = new WeakMap<Mixer, Mixer>();
function silent(m: Mixer): Mixer {
  let s = silentCache.get(m);
  if (!s) {
    s = { ...m, channels: m.channels.map((c) => ({ ...c, stream: false })) };
    silentCache.set(m, s);
  }
  return s;
}

// The stream mix: the same desk as the room (Mixer), each channel sent to the stream or not,
// with the stream bus's own level, limiter and lip-sync delay. It never plays here.
const ctx = new AudioContext({ sampleRate: 48_000 });
const mix = new MixerEngine(window, { bus: 'stream', ctx });
const room = new AudioPlayer(document, mediaUrl);
mix.attach('tracks', room.element);
back.setAudioTap((v) => mix.attach('video', v));
const master = mix.output;

// The mix goes to main as interleaved stereo float32 (it never plays on this computer).
const mute = ctx.createGain();
mute.gain.value = 0;
const tapReady = ctx.audioWorklet.addModule(pcmTapUrl).then(() => {
  const tap = new AudioWorkletNode(ctx, 'pcm-tap', { numberOfInputs: 1, outputChannelCount: [2] });
  tap.port.onmessage = (e: MessageEvent<Float32Array>) => api.sendAudio(e.data);
  master.connect(tap);
  tap.connect(mute).connect(ctx.destination);
});

// GPU pipeline: the hardware encoder (frames never leave the GPU).
const encoder = new StreamEncoder(api);
let probed = '';

api.onConfig((c) => {
  if (c.probe) {
    const key = JSON.stringify(c.probe);
    if (key !== probed) {
      probed = key;
      encoder.probe(c.probe);
    }
  }
  // Only the livestream reports the stream mix's levels (NDI feeds make the same mix).
  if (c.meters && !config?.meters)
    mix.startMeters((l) => api.sendMeters({ bus: 'stream', channels: l.channels, level: l.bus }));
  if (!c.meters) mix.stopMeters();
  document.body.classList.toggle('transparent', c.transparent);
  config = c;
  // The Logo mask covers the stream too. (No off-air card: the words layer is often empty on
  // purpose, and the stream shows its camera or black when nothing is live.)
  words.setLogo(c.logo);
  draw();
});
api.onLiveState((s) => {
  latest = s;
  draw();
});

void Promise.all([
  fontsReady(),
  tapReady.catch((err: unknown) => console.error('stream sound tap failed:', String(err))),
]).then(() => {
  void ctx.resume();
  api.ready();
});

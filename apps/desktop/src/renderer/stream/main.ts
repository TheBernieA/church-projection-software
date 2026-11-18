import {
  applyLook,
  lookLayersFor,
  withKindThemes,
  withWordsTheme,
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
import { lowerThird } from './wordsLayout';

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
  const inputs = [
    config,
    latest.program,
    latest.look,
    latest.audio,
    latest.mixer,
    latest.lowerThird,
  ];
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
  // A lower third drawn with a theme made for it: the stream's own choice, else the one the
  // screens are using (lower-third mode). Without one, the slide's own theme is made smaller.
  // The stream's own theme for this kind of slide (Themes workspace) comes first.
  const own = withKindThemes(program, config.kindThemes);
  const worded =
    own !== program
      ? own
      : pic.words === 'lowerThird'
        ? withWordsTheme(program, config.wordsTheme ?? latest.lowerThird)
        : program;
  themed = worded.content?.theme.layout === 'lower-third';
  words.render({
    ...worded,
    background: null,
    media: null,
    input: null,
    inputNext: null,
    pip: null,
    web: null,
    content: showWords ? worded.content : null,
    announcement: showWords ? program.announcement : null,
  });
  // Behind the words is the camera or black: the projector's pictures and videos stay off the
  // stream (a video keeps playing, unseen, so its sound still reaches the stream mix).
  back.setMediaHidden(pic.background !== 'program');
  document.body.classList.toggle('lower-third', pic.words === 'lowerThird');
  document.body.classList.toggle('has-words', showWords && !!program.content);
  // A lower third sits left, centre or right, whatever the theme says (full-screen words
  // stay as their theme has them).
  for (const align of ALIGNS)
    document.body.classList.toggle(
      `words-${align}`,
      pic.words === 'lowerThird' && pic.wordsAlign === align,
    );
  placeWords();
  // Getting ready (not live yet): no sound, and no microphones open.
  room.sync(config.mix ? latest.audio : null);
  mix.sync(config.mix ? latest.mixer : silent(latest.mixer));
}

/** The words are being drawn with a theme laid out as a lower third. */
let themed = false;
const ALIGNS = ['left', 'center', 'right'] as const;

/**
 * Lower third: size the words and sit them near the bottom. The newest slide's text box is
 * measured where the theme laid it out (layout boxes, so a transition in progress doesn't
 * matter), then the whole words layer is scaled and moved to put it in the band.
 */
function placeWords(): void {
  const layer = $('words').querySelector<HTMLElement>('.ls-layer-content');
  const band = $('band');
  if (!layer) return;
  const pic = config?.picture;
  const slide = layer.lastElementChild as HTMLElement | null;
  const boxes = slide
    ? [...slide.querySelectorAll<HTMLElement>(':scope > .ls-text, :scope > .ls-reference')].map(
        (e) => ({ x: e.offsetLeft, y: e.offsetTop, w: e.offsetWidth, h: e.offsetHeight }),
      )
    : [];
  if (pic?.words !== 'lowerThird' || !slide || boxes.length === 0) {
    layer.style.transform = '';
    band.style.height = '';
    return;
  }
  // A lower-third theme at its own size: it is already where and how big it should be, with
  // its own backing, so nothing is moved and the dark band stays away.
  if (themed && pic.wordsAuto) {
    layer.style.transform = '';
    band.style.height = '0';
    return;
  }
  const placed = lowerThird(
    boxes,
    { width: slide.offsetWidth, height: slide.offsetHeight },
    { auto: pic.wordsAuto, size: pic.wordsSize, align: pic.wordsAlign },
  );
  layer.style.transform = `translate(${placed.x}px, ${placed.y}px) scale(${placed.scale})`;
  band.style.height = `${Math.round(placed.band * 100)}%`;
}

// The words change size after they're drawn (fonts arriving, text fitted to its box, a
// countdown ticking): place them again whenever the words layer changes.
let placing = false;
const replace = (): void => {
  if (placing) return;
  placing = true;
  requestAnimationFrame(() => {
    placing = false;
    placeWords();
  });
};
new MutationObserver(replace).observe($('words'), {
  childList: true,
  subtree: true,
  characterData: true,
});
void fontsReady().then(replace, () => undefined);

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
    mix.startMeters((l) => api.sendMeters({ bus: 'stream', channels: l.channels, level: l.bus, sides: l.sides }));
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

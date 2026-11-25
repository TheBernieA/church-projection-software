import {
  announcementCoversWords,
  sceneIsVisible,
  type ContentLayer,
  type Scene,
  type ScreenVisual,
  type Standby,
  type TransitionSpec,
  type ScreenMask,
  type InputTransition,
  type PipLayer,
  type VideoInputLayer,
  type CameraView,
} from '@lampstand/core';
import {
  buildBackground,
  buildMedia,
  mediaKey,
  syncBackgroundSound,
  syncMedia,
  syncScrim,
} from './background';
import { maskStyle } from './mask';
import { buildVideoInput } from './inputs';
import { buildContent, clearFitCache } from './content';
import { animate, el, releaseMedia, safePlay } from './dom';
import { buildOverlay } from './overlays';
import { backgroundKey } from './style';
import { transitionFrames } from './transitions';
import { VisualSlot } from './visualSlot';
import { type SceneRendererOptions } from './types';
import { BG_FADE_MS, DEFAULT_TRANSITION, FILL, STANDBY_FADE_MS } from './constants';
import { type BuiltContent } from './types';

/** The picture-in-picture box's frame: a white edge and a soft shadow. */
const PIP_FRAME = '0 12px 40px rgba(0,0,0,0.55), 0 0 0 3px rgba(255,255,255,0.85)';

interface InputNode {
  key: string;
  node: HTMLElement;
  dispose: () => void;
  /** The camera it shows, and how to move its digital shot. */
  deviceId?: string;
  setView?: (v: CameraView | undefined) => void;
}

/** Which camera, set up how: a change here reopens it. */
const inputKey = (i: VideoInputLayer | null): string =>
  i ? `${i.deviceId}|${i.fit}|${i.mirror}|${i.resolution}` : '';

interface Slot<T> {
  key: string;
  node: HTMLElement;
  extra?: T;
  /** The layer drawn here, to skip re-keying when the same object comes round again. */
  source?: unknown;
}

/**
 * Renders a {@link Scene} into a host element (§7). One engine for every surface: outputs,
 * stage display, operator monitors and thumbnails — WYSIWYG everywhere.
 *
 * Layers bottom→top: background, media, content, overlays, masks (§3.5).
 */
export class SceneRenderer {
  readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly bgLayer: HTMLElement;
  private readonly mediaLayer: HTMLElement;
  private readonly contentLayer: HTMLElement;
  private readonly announceLayer: HTMLElement;
  private readonly inputLayer: HTMLElement;
  private input: InputNode | null = null;
  /** The camera the T-bar is mixing in (over `input`). */
  private inputNext: InputNode | null = null;
  private pip: InputNode | null = null;
  /** Each camera's digital shot (live state's `cameraViews`), applied to every camera shown. */
  private views: Readonly<Record<string, CameraView>> = {};
  private readonly webLayer: HTMLElement;
  private readonly overlayLayer: HTMLElement;
  private readonly blackMask: HTMLElement;
  /** Logo mask (L): the church's logo card, image or video. */
  private readonly logo: VisualSlot;
  /** Off-air screen: shown whenever nothing is live. */
  private readonly standby: VisualSlot;
  private readonly doc: Document;
  private readonly canvas: { width: number; height: number };
  private bg: Slot<never> | null = null;
  private media: Slot<never> | null = null;
  private content: Slot<BuiltContent> | null = null;
  private announce: Slot<BuiltContent> | null = null;
  private webKey = '';
  private overlaysKey = '[]';
  private overlayNodes = new Map<string, Slot<never>>();
  private frozen = false;
  private resizeObserver: ResizeObserver | null = null;
  private last: Scene | null = null;
  private audio: boolean;
  private audioSink = '';
  /** Where a playing video's sound goes (a mixer), instead of straight to the speakers. */
  private tap: ((v: HTMLMediaElement) => void) | undefined;

  constructor(
    private readonly host: HTMLElement,
    private readonly opts: SceneRendererOptions,
  ) {
    this.doc = host.ownerDocument;
    this.audio = opts.audio ?? false;
    this.tap = opts.audioTap;
    this.canvas = opts.canvas ?? { width: 1920, height: 1080 };
    this.root = el(this.doc, 'div', 'ls-scene-root', {
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      background: opts.transparent ? 'transparent' : '#000',
      // A picture of the screen: never the target of a click, so a preview rebuilding under
      // the pointer (hover to animate) can't swallow the click meant for its tile.
      pointerEvents: 'none',
    });
    this.stage = el(this.doc, 'div', 'ls-stage', {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${this.canvas.width}px`,
      height: `${this.canvas.height}px`,
      transformOrigin: '0 0',
      overflow: 'hidden',
    });
    const layer = (name: string): HTMLElement =>
      el(this.doc, 'div', `ls-layer ls-layer-${name}`, { ...FILL, pointerEvents: 'none' });
    this.bgLayer = layer('background');
    this.mediaLayer = layer('media');
    this.inputLayer = layer('input');
    this.contentLayer = layer('content');
    this.announceLayer = layer('announcements');
    this.webLayer = layer('web');
    this.overlayLayer = layer('overlays');
    this.blackMask = el(this.doc, 'div', 'ls-mask-black', {
      ...FILL,
      background: '#000',
      opacity: '0',
    });
    const url = (id: string): string => opts.mediaUrl(id);
    this.logo = new VisualSlot(el(this.doc, 'div', 'ls-mask-logo', { ...FILL }), 'ls-logo', url);
    this.standby = new VisualSlot(layer('standby'), 'ls-standby', url);
    this.stage.append(
      this.bgLayer,
      this.mediaLayer,
      this.inputLayer,
      this.contentLayer,
      this.webLayer,
      this.announceLayer,
      this.standby.node,
      this.overlayLayer,
      this.blackMask,
      this.logo.node,
    );
    this.root.append(this.stage);
    host.append(this.root);
    this.fitToHost();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.fitToHost());
      this.resizeObserver.observe(host);
    }
  }

  /** Scale the logical canvas into the host, letterboxed (§7.2). */
  fitToHost(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    const scale = Math.min(w / this.canvas.width, h / this.canvas.height);
    const x = (w - this.canvas.width * scale) / 2;
    const y = (h - this.canvas.height * scale) / 2;
    this.stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }

  /** Where a video's sound plays when this renderer plays audio ('' = default output). */
  setAudioSink(sinkId: string): void {
    if (this.audioSink === sinkId) return;
    this.audioSink = sinkId;
    if (this.media && this.last?.media)
      syncMedia(this.media.node, this.last.media, this.opts.mode, this.audio, sinkId, this.tap);
    this.syncBgSound();
  }

  /** A background video's sound, in line with this renderer's audio, room output and mix. */
  /** The readability overlay over the background, changed in place (the background keeps playing). */
  private syncBgScrim(): void {
    if (this.bg) syncScrim(this.doc, this.bg.node, this.last?.background ?? null);
  }

  private syncBgSound(): void {
    // A picture or video over everything covers the background: its sound stops with it
    // (the video keeps going, silent, so it carries on where it was when the media goes).
    const covered = !!this.last?.media;
    if (this.bg)
      syncBackgroundSound(
        this.bg.node,
        covered ? null : (this.last?.background ?? null),
        this.opts.mode,
        this.audio,
        this.audioSink,
        this.tap,
      );
  }

  /** Send video sound through a mixer from now on (videos already playing join it too). */
  setAudioTap(tap: ((v: HTMLMediaElement) => void) | undefined): void {
    this.tap = tap;
    if (this.media && this.last?.media)
      syncMedia(this.media.node, this.last.media, this.opts.mode, this.audio, this.audioSink, tap);
    this.syncBgSound();
  }

  /** Hand the sound to / take it from this renderer (e.g. a projector was plugged in). */
  setAudio(on: boolean): void {
    if (this.audio === on) return;
    this.audio = on;
    if (this.media && this.last?.media)
      syncMedia(this.media.node, this.last.media, this.opts.mode, on, this.audioSink, this.tap);
    this.syncBgSound();
  }

  /** What the Logo mask (L) shows. Rebuilt only when it changes (a looping video keeps going). */
  /**
   * Keep the media layer playing but unseen: the main output carries the room's sound, so a
   * Look that hides media there must not silence a video.
   */
  setMediaHidden(hidden: boolean): void {
    this.mediaLayer.style.visibility = hidden ? 'hidden' : '';
  }

  /** Shape the whole output with a screen mask (null: the full screen). */
  setMask(mask: ScreenMask | null): void {
    Object.assign(
      this.stage.style,
      maskStyle(
        mask,
        (id) => this.opts.mediaUrl(id),
        Math.min(this.canvas.width, this.canvas.height),
      ),
    );
  }

  setLogo(logo: ScreenVisual | null): void {
    this.logo.set(logo && this.opts.mode !== 'thumbnail' ? logo : null);
  }

  /** The off-air screen shown whenever nothing is live (null/black = none, e.g. the preview monitor). */
  setStandby(standby: Standby | null): void {
    const visual = standby && standby.kind !== 'black' && this.opts.mode !== 'thumbnail';
    this.standby.set(visual ? standby : null);
    if (this.last) this.applyStandby(this.last, true);
  }

  render(scene: Scene, opts: { instant?: boolean } = {}): void {
    // Gone: never draw again (a late font-load refresh could start timers or a camera).
    if (this.destroyed) return;
    this.last = scene;
    const instant = opts.instant || this.opts.mode === 'thumbnail';
    this.applyMasks(scene, instant);
    if (this.frozen) return;
    this.renderBackground(scene, instant);
    this.renderMedia(scene, instant);
    this.syncBgSound(); // media over it or gone: the background's sound follows
    this.renderInput(scene, instant);
    this.renderContent(scene.content, scene.transition, instant);
    this.renderWeb(scene);
    this.renderContent(scene.announcement ?? null, undefined, instant, 'announce');
    this.coverWords(announcementCoversWords(scene), instant);
    this.applyStandby(scene, instant);
    this.renderOverlays(scene);
  }

  /**
   * Announcements up: the slide's words fade out under them, and back in when they go. The slide
   * stays drawn underneath, so it's there again at once.
   */
  private coverWords(covered: boolean, instant: boolean): void {
    const st = this.contentLayer.style;
    const opacity = covered ? '0' : '';
    if (st.opacity === opacity) return;
    st.transition = instant ? '' : 'opacity 300ms ease';
    st.opacity = opacity;
  }

  /**
   * The cameras' digital shots (a crop and zoom inside each picture). Cheap: it only moves the
   * camera pictures already on screen, so it can follow someone many times a second.
   */
  setCameraViews(views: Readonly<Record<string, CameraView>>): void {
    if (views === this.views) return;
    this.views = views;
    for (const n of [this.input, this.inputNext, this.pip])
      if (n?.deviceId) n.setView?.(views[n.deviceId]);
  }

  private buildInput(input: VideoInputLayer, key: string): InputNode {
    const built = buildVideoInput(
      this.doc,
      input,
      this.opts.mode !== 'thumbnail',
      this.views[input.deviceId],
    );
    this.inputLayer.append(built.node);
    return {
      key,
      node: built.node,
      deviceId: input.deviceId,
      setView: built.setView,
      dispose: () => {
        built.dispose();
        built.node.remove();
      },
    };
  }

  /**
   * The camera layer: the camera on screen, changed with the switcher's transition (fade, dip
   * through black, wipe) or cut; a second camera mixing in under the T-bar; and the
   * picture-in-picture box. Each camera is opened once and kept while it stays on screen.
   */
  private renderInput(scene: Scene, instant: boolean): void {
    const input = scene.input ?? null;
    const key = inputKey(input);
    if ((this.input?.key ?? '') !== key) {
      const old = this.input;
      let fresh: InputNode | null = null;
      if (input && this.inputNext?.key === key) {
        // The T-bar finished: the camera already mixing in becomes the one on screen.
        fresh = this.inputNext;
        this.inputNext = null;
      } else if (input) fresh = this.buildInput(input, key);
      this.input = fresh;
      this.swapInputs(old, fresh, instant ? undefined : scene.inputTransition);
    }
    const mix = scene.inputNext ?? null;
    const nextKey = mix ? inputKey(mix.input) : '';
    if ((this.inputNext?.key ?? '') !== nextKey) {
      this.inputNext?.dispose();
      this.inputNext = mix ? this.buildInput(mix.input, nextKey) : null;
    }
    if (this.inputNext && mix) this.inputNext.node.style.opacity = String(mix.pos);
    this.renderPip(scene.pip ?? null);
    // Side by side: the camera on screen takes the left half, the second camera the right.
    const half = scene.pip?.side ? '50%' : '';
    if (this.input) this.input.node.style.right = half;
    if (this.inputNext) this.inputNext.node.style.right = half;
  }

  private swapInputs(
    old: InputNode | null,
    fresh: InputNode | null,
    tr: InputTransition | undefined,
  ): void {
    const ms = tr && tr.kind !== 'cut' ? tr.durationMs : 0;
    if (!ms) {
      old?.dispose();
      if (fresh) fresh.node.style.opacity = '';
      return;
    }
    const from = fresh ? Number(fresh.node.style.opacity || '0') : 0;
    const done = (): void => old?.dispose();
    if (tr?.kind === 'dip') {
      // Through black: the old camera goes down, then the new one comes up.
      if (old) void animate(old.node, [{ opacity: 1 }, { opacity: 0 }], { duration: ms / 2 });
      if (fresh) fresh.node.style.opacity = '0';
      if (fresh)
        void animate(fresh.node, [{ opacity: 0 }, { opacity: 1 }], {
          duration: ms / 2,
          delay: ms / 2,
        });
    } else if (tr?.kind === 'wipe' && fresh) {
      fresh.node.style.opacity = '1';
      void animate(
        fresh.node,
        [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }],
        { duration: ms, easing: 'ease-in-out' },
      );
    } else if (fresh) {
      fresh.node.style.opacity = String(from);
      void animate(fresh.node, [{ opacity: from }, { opacity: 1 }], { duration: ms });
    } else if (old) {
      void animate(old.node, [{ opacity: 1 }, { opacity: 0 }], { duration: ms });
    }
    setTimeout(done, ms + 60);
  }

  /** Picture-in-picture: a second camera in a corner box over the picture. */
  private renderPip(pip: PipLayer | null): void {
    const key = pip ? `${inputKey(pip)}|${pip.corner}|${pip.size}|${pip.side ? 'side' : ''}` : '';
    if ((this.pip?.key ?? '') === key) return;
    const reuse = pip && this.pip && this.pip.key.startsWith(`${inputKey(pip)}|`);
    if (!reuse) {
      this.pip?.dispose();
      this.pip = null;
    }
    if (!pip) return;
    if (!this.pip) {
      const box = el(this.doc, 'div', 'ls-pip', {
        position: 'absolute',
        aspectRatio: '16 / 9',
        overflow: 'hidden',
        borderRadius: '14px',
        boxShadow: PIP_FRAME,
        zIndex: '3',
        background: '#000',
      });
      const built = buildVideoInput(
        this.doc,
        pip,
        this.opts.mode !== 'thumbnail',
        this.views[pip.deviceId],
      );
      box.append(built.node);
      this.inputLayer.append(box);
      void animate(
        box,
        [
          { opacity: 0, transform: 'scale(0.96)' },
          { opacity: 1, transform: 'none' },
        ],
        {
          duration: this.opts.mode === 'thumbnail' ? 0 : 250,
        },
      );
      this.pip = {
        key,
        node: box,
        deviceId: pip.deviceId,
        setView: built.setView,
        dispose: () => {
          built.dispose();
          box.remove();
        },
      };
    }
    this.pip.key = key;
    const st = this.pip.node.style;
    if (pip.side) {
      // The right half of the screen, edge to edge, no frame.
      Object.assign(st, {
        width: '50%',
        top: '0',
        bottom: '0',
        right: '0',
        left: '',
        aspectRatio: 'auto',
        borderRadius: '0',
        boxShadow: 'none',
      });
      return;
    }
    const m = '3.5%';
    Object.assign(st, {
      width: `${pip.size * 100}%`,
      top: pip.corner[0] === 't' ? m : '',
      bottom: pip.corner[0] === 'b' ? m : '',
      left: pip.corner[1] === 'l' ? m : '',
      right: pip.corner[1] === 'r' ? m : '',
      aspectRatio: '16 / 9',
      borderRadius: '14px',
      boxShadow: PIP_FRAME,
    });
  }

  /**
   * A live web page. Outputs draw nothing here: the main process lays an isolated web view over
   * the window. Monitors and thumbnails show a card naming the page instead.
   */
  private renderWeb(scene: Scene): void {
    const key = this.opts.mode === 'output' ? '' : (scene.web?.url ?? '');
    if (key === this.webKey) return;
    this.webKey = key;
    this.webLayer.replaceChildren();
    if (!key) return;
    const card = el(this.doc, 'div', 'ls-web', {
      ...FILL,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '28px',
      background: 'radial-gradient(ellipse at 50% 40%, #16343a 0%, #0b1416 75%)',
      color: '#e6f3f1',
      fontFamily: '"Inter", sans-serif',
    });
    const globe = el(this.doc, 'div', '', {
      width: '180px',
      height: '180px',
      borderRadius: '50%',
      border: '10px solid rgba(79,179,168,0.85)',
      boxSizing: 'border-box',
      background:
        'linear-gradient(transparent 46%, rgba(79,179,168,0.85) 46% 54%, transparent 54%), linear-gradient(90deg, transparent 46%, rgba(79,179,168,0.85) 46% 54%, transparent 54%)',
    });
    const label = el(this.doc, 'div', 'ls-web-url', {
      fontSize: '56px',
      fontWeight: '600',
      maxWidth: '80%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
    try {
      label.textContent = new URL(key).host + new URL(key).pathname.replace(/\/$/, '');
    } catch {
      label.textContent = key;
    }
    card.append(globe, label);
    this.webLayer.append(card);
  }

  private applyStandby(scene: Scene, instant: boolean): void {
    const on = this.standby.hasContent && !sceneIsVisible(scene);
    this.standby.show(on, instant ? 0 : STANDBY_FADE_MS);
  }

  private destroyed = false;

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.content?.extra?.dispose();
    this.announce?.extra?.dispose();
    this.input?.dispose();
    this.inputNext?.dispose();
    this.pip?.dispose();
    this.root.remove();
  }

  private applyMasks(scene: Scene, instant: boolean): void {
    const ms = instant ? 0 : 300;
    const black = scene.masks.black;
    if (this.blackMask.style.opacity !== (black ? '1' : '0')) {
      void animate(this.blackMask, [{ opacity: black ? 0 : 1 }, { opacity: black ? 1 : 0 }], {
        duration: ms,
        easing: 'ease',
      });
      this.blackMask.style.opacity = black ? '1' : '0';
    }
    this.logo.show(scene.masks.logo && !black, ms);
    const freeze = scene.masks.freeze;
    if (freeze !== this.frozen) {
      this.frozen = freeze;
      this.logo.setFrozen(freeze);
      this.standby.setFrozen(freeze);
      for (const v of this.stage.querySelectorAll('video')) {
        if (v.closest('.ls-logo, .ls-standby')) continue; // the slots handle their own
        if (freeze) v.pause();
        else if (!v.closest('.ls-media')) safePlay(v); // live media resumes via syncMedia
      }
    }
  }

  /**
   * How long media and backgrounds take to change: the default media transition when one is set
   * (cut: at once), else the usual fade for that layer.
   */
  private mediaFadeMs(scene: Scene, usual: number): number {
    const t = scene.mediaTransition;
    if (!t) return usual;
    return t.kind === 'cut' ? 0 : t.durationMs;
  }

  private renderBackground(scene: Scene, instant: boolean): void {
    const key = backgroundKey(scene.background);
    if (this.bg?.key === key || (!this.bg && key === 'none')) {
      // Continuity: never restart (its overlay may have changed; render() syncs its sound).
      this.syncBgScrim();
      return;
    }
    const old = this.bg;
    const fade = instant ? 0 : this.mediaFadeMs(scene, BG_FADE_MS);
    if (key === 'none' || !scene.background) {
      this.bg = null;
    } else {
      const node = buildBackground(this.doc, scene.background, this.opts, this.opts.mode);
      node.style.opacity = fade ? '0' : '1';
      this.bgLayer.append(node);
      this.bg = { key, node };
      this.syncBgScrim();
      if (fade)
        void animate(node, [{ opacity: 0 }, { opacity: 1 }], { duration: fade, easing: 'ease' });
    }
    if (old) this.retire(old.node, fade);
  }

  private renderMedia(scene: Scene, instant: boolean): void {
    const key = mediaKey(scene.media);
    if ((this.media?.key ?? 'none') === key) {
      // Same clip: apply play/pause/seek/volume in place.
      if (this.media && scene.media)
        syncMedia(
          this.media.node,
          scene.media,
          this.opts.mode,
          this.audio,
          this.audioSink,
          this.tap,
        );
      return;
    }
    const old = this.media;
    this.media = null;
    const fade = instant ? 0 : this.mediaFadeMs(scene, 400);
    if (scene.media) {
      const node = buildMedia(
        this.doc,
        scene.media,
        this.opts,
        this.opts.mode,
        this.audio,
        this.audioSink,
        this.tap,
      );
      this.mediaLayer.append(node);
      this.media = { key, node };
      if (fade)
        void animate(node, [{ opacity: 0 }, { opacity: 1 }], { duration: fade, easing: 'ease' });
    }
    if (old) this.retire(old.node, fade);
  }

  /**
   * Draw a slide into the slide layer, or (`announce`) into the announcements layer above it,
   * crossfading with the theme's transition.
   */
  private renderContent(
    content: ContentLayer | null,
    transition: TransitionSpec | undefined,
    instant: boolean,
    channel: 'content' | 'announce' = 'content',
  ): void {
    const layer = channel === 'content' ? this.contentLayer : this.announceLayer;
    // Stage-only fields (notes, chords, label) never change what the room sees, so they don't
    // re-run the transition.
    // The same object as last time: nothing changed (most renders, e.g. a timer tick).
    if (this[channel] ? this[channel].source === content : content === null) return;
    const key = content ? JSON.stringify({ ...content, notes: 0, chords: 0, label: 0 }) : 'none';
    if ((this[channel]?.key ?? 'none') === key) {
      if (this[channel]) this[channel].source = content;
      return;
    }
    const t = transition ?? content?.theme.transition ?? DEFAULT_TRANSITION;
    const duration = instant || t.kind === 'cut' ? 0 : t.durationMs;
    const frames = transitionFrames(t.kind);
    const old = this[channel];
    this[channel] = null;
    // Remove anything still fading from a previous rapid change so slots never pile up.
    for (const child of [...layer.children]) if (child !== old?.node) child.remove();
    if (content) {
      const built = buildContent(this.doc, content, {
        live: this.opts.mode !== 'thumbnail',
        mediaUrl: (id) => this.opts.mediaUrl(id),
      });
      built.root.style.opacity = '0';
      // A canvas wider than the theme's (edge blending): the words sit in the middle of it.
      const spare = this.canvas.width - content.theme.canvas.width;
      if (spare > 0) built.root.style.left = `${spare / 2}px`;
      layer.append(built.root);
      built.fit();
      built.root.style.opacity = duration ? '0' : '1';
      if (duration) void animate(built.root, frames.enter, { duration, easing: t.easing });
      this[channel] = { key, node: built.root, extra: built, source: content };
    }
    if (old) {
      if (duration)
        void animate(old.node, frames.exit, { duration, easing: t.easing }).then(() =>
          this.dispose(old),
        );
      else this.dispose(old);
    }
  }

  /**
   * Overlays are reconciled by id: unchanged ones keep their node, so a looping prop video or
   * a scrolling ticker doesn't restart when another overlay comes or goes.
   */
  private renderOverlays(scene: Scene): void {
    const key = JSON.stringify(scene.overlays);
    if (key === this.overlaysKey) return;
    this.overlaysKey = key;
    const next = new Map<string, Slot<never>>();
    for (const o of scene.overlays) {
      const k = JSON.stringify(o);
      const kept = this.overlayNodes.get(o.id);
      next.set(
        o.id,
        kept?.key === k
          ? kept
          : {
              key: k,
              node: buildOverlay(this.doc, o, this.opts.mode !== 'thumbnail', (id) =>
                this.opts.mediaUrl(id),
              ),
            },
      );
    }
    // Detaching a <video> pauses it, so unchanged nodes stay put: only drop stale ones and
    // append new ones.
    for (const [id, slot] of this.overlayNodes) if (next.get(id) !== slot) slot.node.remove();
    for (const slot of next.values())
      if (slot.node.parentNode !== this.overlayLayer) this.overlayLayer.append(slot.node);
    this.overlayNodes = next;
  }

  private dispose(slot: Slot<BuiltContent>): void {
    slot.extra?.dispose();
    slot.node.remove();
  }

  private retire(node: HTMLElement, ms: number): void {
    // Gone for good: stop its videos and let go of their files (memory, and no sound later).
    const remove = (): void => {
      node.remove();
      for (const v of node.querySelectorAll('video')) {
        const held = v as HTMLVideoElement & { lsHold?: ReturnType<typeof setTimeout> };
        if (held.lsHold) clearTimeout(held.lsHold);
        releaseMedia(v);
      }
    };
    if (!ms) return remove();
    void animate(node, [{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease' }).then(
      remove,
    );
  }

  /** Re-apply the last scene (e.g. after fonts finish loading). */
  refresh(): void {
    if (!this.last || this.destroyed) return;
    // Fonts may have arrived since the words were sized: size them again.
    clearFitCache();
    const s = this.last;
    this.content?.extra?.dispose();
    this.contentLayer.replaceChildren();
    this.content = null;
    this.announce?.extra?.dispose();
    this.announceLayer.replaceChildren();
    this.announce = null;
    this.render(s, { instant: true });
  }
}

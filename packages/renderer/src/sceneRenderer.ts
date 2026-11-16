import {
  sceneIsVisible,
  type ContentLayer,
  type Scene,
  type ScreenVisual,
  type Standby,
  type TransitionSpec,
  type ScreenMask,
} from '@lampstand/core';
import { buildBackground, buildMedia, mediaKey, syncMedia } from './background';
import { maskStyle } from './mask';
import { buildVideoInput } from './inputs';
import { buildContent } from './content';
import { animate, el, safePlay } from './dom';
import { buildOverlay } from './overlays';
import { backgroundKey } from './style';
import { transitionFrames } from './transitions';
import { VisualSlot } from './visualSlot';
import { type SceneRendererOptions } from './types';
import { BG_FADE_MS, DEFAULT_TRANSITION, FILL, STANDBY_FADE_MS } from './constants';
import { type BuiltContent } from './types';

interface Slot<T> {
  key: string;
  node: HTMLElement;
  extra?: T;
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
  private input: { key: string; dispose: () => void } | null = null;
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

  constructor(
    private readonly host: HTMLElement,
    private readonly opts: SceneRendererOptions,
  ) {
    this.doc = host.ownerDocument;
    this.audio = opts.audio ?? false;
    this.canvas = opts.canvas ?? { width: 1920, height: 1080 };
    this.root = el(this.doc, 'div', 'ls-scene-root', {
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      background: opts.transparent ? 'transparent' : '#000',
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

  /** Hand the sound to / take it from this renderer (e.g. a projector was plugged in). */
  setAudio(on: boolean): void {
    if (this.audio === on) return;
    this.audio = on;
    if (this.media && this.last?.media)
      syncMedia(this.media.node, this.last.media, this.opts.mode, on);
  }

  /** What the Logo mask (L) shows. Rebuilt only when it changes (a looping video keeps going). */
  /** Shape the whole output with a screen mask (null: the full screen). */
  setMask(mask: ScreenMask | null): void {
    Object.assign(
      this.stage.style,
      maskStyle(mask, (id) => this.opts.mediaUrl(id)),
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
    this.last = scene;
    const instant = opts.instant || this.opts.mode === 'thumbnail';
    this.applyMasks(scene, instant);
    if (this.frozen) return;
    this.renderBackground(scene, instant);
    this.renderMedia(scene, instant);
    this.renderInput(scene);
    this.renderContent(scene.content, scene.transition, instant);
    this.renderWeb(scene);
    this.renderContent(scene.announcement ?? null, undefined, instant, 'announce');
    this.applyStandby(scene, instant);
    this.renderOverlays(scene);
  }

  /** A live camera feed in the media layer; rebuilt only when the device or fit changes. */
  private renderInput(scene: Scene): void {
    const input = scene.input ?? null;
    const key = input ? `${input.deviceId}|${input.fit}` : '';
    if ((this.input?.key ?? '') === key) return;
    this.input?.dispose();
    this.inputLayer.replaceChildren();
    this.input = null;
    if (!input) return;
    const built = buildVideoInput(this.doc, input, this.opts.mode !== 'thumbnail');
    this.inputLayer.append(built.node);
    this.input = { key, dispose: built.dispose };
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

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.content?.extra?.dispose();
    this.announce?.extra?.dispose();
    this.input?.dispose();
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

  private renderBackground(scene: Scene, instant: boolean): void {
    const key = backgroundKey(scene.background);
    if (this.bg?.key === key || (!this.bg && key === 'none')) return; // continuity: never restart
    const old = this.bg;
    if (key === 'none' || !scene.background) {
      this.bg = null;
    } else {
      const node = buildBackground(this.doc, scene.background, this.opts, this.opts.mode);
      node.style.opacity = instant ? '1' : '0';
      this.bgLayer.append(node);
      this.bg = { key, node };
      if (!instant)
        void animate(node, [{ opacity: 0 }, { opacity: 1 }], {
          duration: BG_FADE_MS,
          easing: 'ease',
        });
    }
    if (old) this.retire(old.node, instant ? 0 : BG_FADE_MS);
  }

  private renderMedia(scene: Scene, instant: boolean): void {
    const key = mediaKey(scene.media);
    if ((this.media?.key ?? 'none') === key) {
      // Same clip: apply play/pause/seek/volume in place.
      if (this.media && scene.media)
        syncMedia(this.media.node, scene.media, this.opts.mode, this.audio);
      return;
    }
    const old = this.media;
    this.media = null;
    if (scene.media) {
      const node = buildMedia(this.doc, scene.media, this.opts, this.opts.mode, this.audio);
      this.mediaLayer.append(node);
      this.media = { key, node };
      if (!instant)
        void animate(node, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease' });
    }
    if (old) this.retire(old.node, instant ? 0 : 400);
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
    const key = content ? JSON.stringify({ ...content, notes: 0, chords: 0, label: 0 }) : 'none';
    if ((this[channel]?.key ?? 'none') === key) return;
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
      layer.append(built.root);
      built.fit();
      built.root.style.opacity = duration ? '0' : '1';
      if (duration) void animate(built.root, frames.enter, { duration, easing: t.easing });
      this[channel] = { key, node: built.root, extra: built };
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
    if (!ms) {
      node.remove();
      return;
    }
    void animate(node, [{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease' }).then(
      () => node.remove(),
    );
  }

  /** Re-apply the last scene (e.g. after fonts finish loading). */
  refresh(): void {
    if (!this.last) return;
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

import { standbyKey, type ScreenVisual } from '@lampstand/core';
import { animate, el, safePlay } from './dom';
import { FILL } from './constants';
import { buildLogoCard } from './logoCard';

/**
 * A full-screen picture layer (the logo mask, the off-air screen): a text card, an image, or a
 * silent looping video. It fades in and out, rebuilds only when the picture actually changes,
 * and plays its video only while visible, so a hidden loop never costs decoding time.
 */
export class VisualSlot {
  private key = '';
  private shown = false;
  private frozen = false;

  constructor(
    readonly node: HTMLElement,
    private readonly className: string,
    private readonly mediaUrl: (id: string) => string,
  ) {
    node.style.opacity = '0';
  }

  set(visual: ScreenVisual | null): void {
    const key = visual ? standbyKey(visual) : '';
    if (key === this.key) return;
    this.key = key;
    this.node.replaceChildren(...(visual ? [this.build(visual)] : []));
    this.syncPlayback();
  }

  get hasContent(): boolean {
    return this.key !== '';
  }

  show(on: boolean, duration: number): void {
    const target = on ? '1' : '0';
    if (this.node.style.opacity !== target) {
      void animate(
        this.node,
        [{ opacity: Number(this.node.style.opacity || 0) }, { opacity: Number(target) }],
        { duration, easing: 'ease' },
      );
      this.node.style.opacity = target;
    }
    if (on !== this.shown) {
      this.shown = on;
      this.syncPlayback();
    }
  }

  /** Freeze holds every frame on screen, this one included. */
  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
    this.syncPlayback();
  }

  /** Video and motion run only while the slot is on screen and not frozen. */
  private syncPlayback(): void {
    const run = this.shown && !this.frozen;
    if (typeof this.node.getAnimations === 'function')
      for (const a of this.node.getAnimations({ subtree: true }))
        if (a.effect?.getComputedTiming().iterations === Infinity) {
          if (run) a.play();
          else a.pause();
        }
    const v = this.node.querySelector('video');
    if (!v) return;
    if (run) safePlay(v);
    else v.pause();
  }

  private build(visual: ScreenVisual): HTMLElement {
    const doc = this.node.ownerDocument;
    const node = el(doc, 'div', `${this.className} ${this.className}-${visual.kind}`, {
      ...FILL,
      background: '#000',
    });
    if (visual.kind === 'logo') buildLogoCard(doc, node, visual, true);
    else if (visual.kind === 'image') {
      const img = el(doc, 'img', '', { ...FILL, objectFit: 'cover' });
      img.src = this.mediaUrl(visual.mediaId);
      img.alt = '';
      node.append(img);
    } else {
      const v = el(doc, 'video', '', { ...FILL, objectFit: 'cover' });
      v.src = this.mediaUrl(visual.mediaId);
      v.loop = true;
      v.muted = true; // logo and off-air loops never play sound
      v.playsInline = true;
      v.preload = 'auto';
      node.append(v);
    }
    return node;
  }
}

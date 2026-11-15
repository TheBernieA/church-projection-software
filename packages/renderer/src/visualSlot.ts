import { standbyKey, type ScreenVisual } from '@lampstand/core';
import { animate, el, safePlay } from './dom';
import { FILL } from './constants';

/** The text logo card: a name, centred on a soft dark gradient. */
function styleLogoCard(node: HTMLElement, text: string): void {
  Object.assign(node.style, {
    background: 'radial-gradient(ellipse at 50% 40%, #1A1E2C 0%, #0B0D14 70%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '0 120px',
    color: '#ECEEF4',
    fontFamily: '"Inter", sans-serif',
    fontSize: '96px',
    fontWeight: '700',
    letterSpacing: '0.02em',
  });
  node.textContent = text;
}

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

  private syncPlayback(): void {
    const v = this.node.querySelector('video');
    if (!v) return;
    if (this.shown && !this.frozen) safePlay(v);
    else v.pause();
  }

  private build(visual: ScreenVisual): HTMLElement {
    const doc = this.node.ownerDocument;
    const node = el(doc, 'div', `${this.className} ${this.className}-${visual.kind}`, {
      ...FILL,
      background: '#000',
    });
    if (visual.kind === 'logo') styleLogoCard(node, visual.text);
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

import type { Overlay, PropPosition } from '@lampstand/core';
import { el, FILL, loop, safePlay, type StyleInit } from './dom';

const PROP_BOX: Record<PropPosition, StyleInit> = {
  full: { ...FILL },
  'top-left': { left: '56px', top: '48px', width: '22%', height: '22%' },
  'top-right': { right: '56px', top: '48px', width: '22%', height: '22%' },
  'bottom-left': { left: '56px', bottom: '48px', width: '22%', height: '22%' },
  'bottom-right': { right: '56px', bottom: '48px', width: '22%', height: '22%' },
  'lower-third': { left: '20%', right: '20%', bottom: '56px', height: '24%' },
};

/** A prop: a library image/video (contained in its box) or text, in a preset position. */
function buildProp(
  doc: Document,
  o: Overlay,
  mediaUrl: (id: string) => string,
  animated: boolean,
): HTMLElement {
  const pos = o.position ?? 'top-right';
  const box = el(doc, 'div', `ls-prop ls-prop-${pos}`, {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    justifyContent: pos.endsWith('right')
      ? 'flex-end'
      : pos.endsWith('left')
        ? 'flex-start'
        : 'center',
    ...PROP_BOX[pos],
  });
  if (o.mediaId && o.mediaKind === 'video') {
    const v = el(doc, 'video', '', { width: '100%', height: '100%', objectFit: 'contain' });
    v.src = mediaUrl(o.mediaId);
    v.loop = true;
    v.muted = true;
    v.playsInline = true;
    box.append(v);
    if (animated) safePlay(v);
  } else if (o.mediaId) {
    const img = el(doc, 'img', '', { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' });
    img.src = mediaUrl(o.mediaId);
    img.alt = '';
    box.append(img);
  } else {
    const t = el(doc, 'div', '', {
      fontFamily: '"Inter", sans-serif',
      fontWeight: '700',
      fontSize: pos === 'full' ? '120px' : '44px',
      color: '#fff',
      textShadow: '0 2px 12px rgba(0,0,0,0.6)',
      textAlign: 'center',
    });
    t.textContent = o.text;
    box.append(t);
  }
  return box;
}

/** Overlay layer: tickers (nursery calls), lower thirds (speaker name), logo bug, props. */
export function buildOverlay(
  doc: Document,
  o: Overlay,
  animated: boolean,
  mediaUrl: (id: string) => string = (id) => id,
): HTMLElement {
  if (o.kind === 'prop') return buildProp(doc, o, mediaUrl, animated);
  if (o.kind === 'ticker') {
    const bar = el(doc, 'div', 'ls-ticker', {
      position: 'absolute',
      left: '0',
      right: '0',
      bottom: '0',
      height: '84px',
      overflow: 'hidden',
      background: 'rgba(15,17,26,0.9)',
      borderTop: '3px solid #E8B04B',
      display: 'flex',
      alignItems: 'center',
    });
    const text = el(doc, 'div', '', {
      whiteSpace: 'nowrap',
      fontFamily: '"Inter", sans-serif',
      fontWeight: '600',
      fontSize: '42px',
      color: '#fff',
      paddingLeft: '100%',
    });
    text.textContent = o.text;
    bar.append(text);
    if (animated)
      loop(text, [{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }], {
        duration: Math.max(12000, o.text.length * 220),
        easing: 'linear',
      });
    return bar;
  }
  if (o.kind === 'lower-third') {
    const box = el(doc, 'div', 'ls-lower-third', {
      position: 'absolute',
      left: '96px',
      bottom: '96px',
      padding: '20px 36px',
      background: 'rgba(23,26,36,0.9)',
      borderLeft: '6px solid #E8B04B',
      borderRadius: '4px',
      fontFamily: '"Inter", sans-serif',
      color: '#fff',
    });
    const t = el(doc, 'div', '', { fontSize: '44px', fontWeight: '700' });
    t.textContent = o.text;
    box.append(t);
    if (o.subtext) {
      const s = el(doc, 'div', '', {
        fontSize: '28px',
        fontWeight: '500',
        opacity: '0.8',
        marginTop: '4px',
      });
      s.textContent = o.subtext;
      box.append(s);
    }
    return box;
  }
  const bug = el(doc, 'div', 'ls-logo-bug', {
    position: 'absolute',
    right: '64px',
    top: '56px',
    fontFamily: '"Inter", sans-serif',
    fontWeight: '700',
    fontSize: '30px',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: '0.04em',
  });
  bug.textContent = o.text;
  return bug;
}

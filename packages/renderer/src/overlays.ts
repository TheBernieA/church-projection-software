import type { Overlay } from '@lampstand/core';
import { el, loop } from './dom';

/** Overlay layer: tickers (nursery calls), lower thirds (speaker name), logo bug. */
export function buildOverlay(doc: Document, o: Overlay, animated: boolean): HTMLElement {
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

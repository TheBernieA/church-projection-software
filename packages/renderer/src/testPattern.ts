import { el } from './dom';
import { FILL } from './constants';
import type { StyleInit } from './types';

const BARS = ['#C0C0C0', '#C0C000', '#00C0C0', '#00C000', '#C000C0', '#C00000', '#0000C0'];

/** Color bars + resolution + display name for output setup (§7.3). */
export function buildTestPattern(
  doc: Document,
  info: { label: string; width: number; height: number },
): HTMLElement {
  const root = el(doc, 'div', 'ls-test-pattern', {
    ...FILL,
    display: 'flex',
    flexDirection: 'column',
    background: '#000',
  });
  const bars = el(doc, 'div', '', { display: 'flex', flex: '3' });
  for (const c of BARS) bars.append(el(doc, 'div', '', { flex: '1', background: c }));
  const ramp = el(doc, 'div', '', { flex: '1', background: 'linear-gradient(90deg, #000, #fff)' });
  const text = el(doc, 'div', '', {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    padding: '24px 48px',
    background: 'rgba(0,0,0,0.8)',
    color: '#fff',
    fontFamily: '"Inter", sans-serif',
    fontSize: '56px',
    fontWeight: '700',
    textAlign: 'center',
    borderRadius: '12px',
    border: '4px solid #fff',
  });
  const l1 = el(doc, 'div');
  l1.textContent = info.label;
  const l2 = el(doc, 'div', '', {
    fontSize: '40px',
    fontWeight: '500',
    marginTop: '8px',
    fontVariantNumeric: 'tabular-nums',
  });
  l2.textContent = `${info.width} × ${info.height}`;
  text.append(l1, l2);
  // Corner markers show whether the image is cropped by overscan.
  const corner = (pos: StyleInit): HTMLElement =>
    el(doc, 'div', '', {
      position: 'absolute',
      width: '60px',
      height: '60px',
      border: '6px solid #fff',
      ...pos,
    });
  root.append(
    bars,
    ramp,
    text,
    corner({ left: '0', top: '0' }),
    corner({ right: '0', top: '0' }),
    corner({ left: '0', bottom: '0' }),
    corner({ right: '0', bottom: '0' }),
  );
  return root;
}

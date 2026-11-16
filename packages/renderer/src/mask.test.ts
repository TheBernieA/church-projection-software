import { describe, expect, it } from 'vitest';
import type { ScreenMask } from '@lampstand/core';
import { maskStyle } from './mask';

const base: ScreenMask = {
  id: 'm',
  name: 'Mask',
  shape: 'rect',
  top: 5,
  right: 10,
  bottom: 5,
  left: 10,
  radius: 0,
};
const url = (id: string) => `media://${id}`;

describe('maskStyle', () => {
  it('no mask leaves the output whole', () => {
    expect(maskStyle(null, url).clipPath).toBe('');
  });
  it('a box brings the edges in, with optional rounded corners', () => {
    expect(maskStyle(base, url).clipPath).toBe('inset(5% 10% 5% 10%)');
    expect(maskStyle({ ...base, radius: 4 }, url).clipPath).toBe(
      'inset(5% 10% 5% 10% round 4vmin)',
    );
  });
  it('an oval fills the area inside the edges', () => {
    expect(maskStyle({ ...base, shape: 'ellipse' }, url).clipPath).toBe(
      'ellipse(40% 45% at 50% 50%)',
    );
  });
  it('a picture masks by brightness', () => {
    const s = maskStyle({ ...base, shape: 'image', mediaId: 'pic' }, url);
    expect(s.maskImage).toBe('url("media://pic")');
    expect(s.maskMode).toBe('luminance');
    expect(s.clipPath).toBe('');
  });
});

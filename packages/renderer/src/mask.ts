import type { ScreenMask } from '@lampstand/core';

/** The CSS that shapes an output with a screen mask (outside the shape: black). */
export function maskStyle(
  mask: ScreenMask | null,
  mediaUrl: (id: string) => string,
): Partial<CSSStyleDeclaration> {
  const none = { clipPath: '', maskImage: '', maskSize: '', maskMode: '' };
  if (!mask) return none;
  const { top: t, right: r, bottom: b, left: l } = mask;
  if (mask.shape === 'image') {
    if (!mask.mediaId) return none;
    const url = `url("${mediaUrl(mask.mediaId)}")`;
    // The picture's brightness decides: white shows, black hides.
    return {
      ...none,
      maskImage: url,
      maskSize: '100% 100%',
      maskMode: 'luminance',
    };
  }
  if (mask.shape === 'ellipse') {
    const rx = (100 - l - r) / 2;
    const ry = (100 - t - b) / 2;
    return { ...none, clipPath: `ellipse(${rx}% ${ry}% at ${l + rx}% ${t + ry}%)` };
  }
  const round = mask.radius > 0 ? ` round ${mask.radius}vmin` : '';
  return { ...none, clipPath: `inset(${t}% ${r}% ${b}% ${l}%${round})` };
}

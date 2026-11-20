import type { ScreenMask } from '@lampstand/core';

/** The CSS that shapes an output with a screen mask (outside the shape: black). */
export function maskStyle(
  mask: ScreenMask | null,
  mediaUrl: (id: string) => string,
  /** The stage's shorter side in px (corner rounding is a % of it), e.g. 1080 for 1920×1080. */
  shortSide = 1080,
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
  // In stage pixels (the stage is scaled as a whole), so monitors, previews and projectors match.
  const px = Math.round((mask.radius / 100) * shortSide);
  const round = px > 0 ? ` round ${px}px` : '';
  return { ...none, clipPath: `inset(${t}% ${r}% ${b}% ${l}%${round})` };
}

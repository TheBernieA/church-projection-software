/**
 * Boxy icons for an item's header (big: they nearly fill it), in the style of a presentation
 * console. Drawn on a 20-unit grid and shown at 20px, so every edge lands on a pixel; in the text
 * colour (currentColor), like the rest of the tools.
 */

/** An item header's tool button: the icons nearly fill the header. */
export const HEADER_TOOL = '!h-[30px] !w-[30px]';

interface GlyphProps {
  size?: number;
}

const svg = (size: number, children: React.ReactNode) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    aria-hidden
    fill="none"
    shapeRendering="geometricPrecision"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

/**
 * Auto-advance: a film strip with an arrow out of it (the slides move on by themselves). Wider
 * than the rest, as on a console: 26 by 20.
 */
export function AutoAdvanceGlyph({ size = 20 }: GlyphProps) {
  return (
    <svg
      width={(size * 26) / 20}
      height={size}
      viewBox="0 0 26 20"
      aria-hidden
      fill="none"
      shapeRendering="geometricPrecision"
    >
      <path
        fillRule="evenodd"
        fill="currentColor"
        d="M2.5 3h14A1.5 1.5 0 0 1 18 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 1 15.5v-11A1.5 1.5 0 0 1 2.5 3ZM3 5v3h3V5Zm4.5 0v3h3V5ZM12 5v3h3V5ZM3 12v3h3v-3Zm4.5 0v3h3v-3ZM12 12v3h3v-3Z"
      />
      <path d="M19.5 4.5 25 10l-5.5 5.5z" fill="currentColor" />
    </svg>
  );
}

/** Slide actions: a clipboard (what else happens with a slide). */
export function ClipboardGlyph({ size = 20 }: GlyphProps) {
  return svg(
    size,
    <>
      <rect
        x="3.5"
        y="3.5"
        width="13"
        height="14.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <rect x="6.5" y="1.5" width="7" height="4" rx="1" fill="currentColor" />
      <path d="M7 10h6M7 13.5h4" stroke="currentColor" strokeWidth="1.8" />
    </>,
  );
}

/** Timeline: boxes on a track, arrows both ways (timings recorded and played back). */
export function TimelineGlyph({ size = 20 }: GlyphProps) {
  return svg(
    size,
    <>
      <path d="M2.5 4.5h14m-2.5-2.5 2.5 2.5L14 7" stroke="currentColor" strokeWidth="1.7" />
      <path d="M17.5 15.5h-14M6 13l-2.5 2.5L6 18" stroke="currentColor" strokeWidth="1.7" />
      <rect x="2" y="8" width="4" height="4" rx="0.8" stroke="currentColor" strokeWidth="1.5" />
      <rect x="8" y="8" width="4" height="4" rx="0.8" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14" y="8" width="4" height="4" rx="0.8" stroke="currentColor" strokeWidth="1.5" />
    </>,
  );
}

/** A transition: two boxes either side of a divide (one slide giving way to the next). */
export function SplitGlyph({ size = 20 }: GlyphProps) {
  return svg(
    size,
    <>
      <rect x="1.5" y="4" width="17" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 2v16" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="7.5" width="3.5" height="5" rx="0.8" fill="currentColor" />
      <rect x="12.5" y="7.5" width="3.5" height="5" rx="0.8" fill="currentColor" />
    </>,
  );
}

/** Where the slides go (the presentation layer or announcements): a ringed target. */
export function TargetGlyph({ size = 20 }: GlyphProps) {
  return svg(
    size,
    <>
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" />
      <circle cx="10" cy="10" r="4.25" stroke="currentColor" strokeWidth="2" />
      <circle cx="10" cy="10" r="1.6" fill="currentColor" />
    </>,
  );
}

/** Playback (a picture or video's options): a solid arrow in a box. */
export function PlayBoxGlyph({ size = 20 }: GlyphProps) {
  return svg(
    size,
    <>
      <rect x="1.5" y="2.5" width="17" height="15" rx="2.5" fill="currentColor" />
      <path d="M7.5 6.5 13.5 10l-6 3.5z" fill="var(--surface-0)" />
    </>,
  );
}

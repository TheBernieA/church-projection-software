/**
 * Fine-lined icons for an item's header (big: they nearly fill it), in the style of a
 * presentation console. Drawn on a 20-unit grid and shown at 20px with a light stroke, in the
 * text colour (currentColor), like the rest of the tools.
 */

/** An item header's tool button: the icons nearly fill the header. */
export const HEADER_TOOL = '!h-[30px] !w-[30px]';

/** The line weight of every header icon (thin, for a calm, premium look). */
const LINE = 1.25;

interface GlyphProps {
  size?: number;
}

const svg = (size: number, children: React.ReactNode, width = 20) => (
  <svg
    width={(size * width) / 20}
    height={size}
    viewBox={`0 0 ${width} 20`}
    aria-hidden
    fill="none"
    stroke="currentColor"
    strokeWidth={LINE}
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
  return svg(
    size,
    <>
      <rect x="1.5" y="3.5" width="16" height="13" rx="1.75" />
      <path d="M1.5 7.5h16M1.5 12.5h16M5.5 3.5v4M9.5 3.5v4M13.5 3.5v4M5.5 12.5v4M9.5 12.5v4M13.5 12.5v4" />
      <path d="M20.5 6.5 24 10l-3.5 3.5" />
    </>,
    26,
  );
}

/** Slide actions: a clipboard (what else happens with a slide). */
export function ClipboardGlyph({ size = 20 }: GlyphProps) {
  return svg(
    size,
    <>
      <path d="M7 3.5H5.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-11a2 2 0 0 0-2-2H13" />
      <rect x="7" y="2" width="6" height="3" rx="1" />
      <path d="M7 10h6M7 13.5h4" />
    </>,
  );
}

/** Timeline: boxes on a track, arrows both ways (timings recorded and played back). */
export function TimelineGlyph({ size = 20 }: GlyphProps) {
  return svg(
    size,
    <>
      <path d="M2.5 4.5h14m-2-2 2 2-2 2" />
      <path d="M17.5 15.5h-14m2-2-2 2 2 2" />
      <rect x="2.5" y="8.25" width="3.5" height="3.5" rx="0.75" />
      <rect x="8.25" y="8.25" width="3.5" height="3.5" rx="0.75" />
      <rect x="14" y="8.25" width="3.5" height="3.5" rx="0.75" />
    </>,
  );
}

/** A transition: two boxes either side of a divide (one slide giving way to the next). */
export function SplitGlyph({ size = 20 }: GlyphProps) {
  return svg(
    size,
    <>
      <rect x="1.5" y="4.5" width="17" height="11" rx="1.75" />
      <path d="M10 2.5v15" />
      <rect x="4.5" y="7.75" width="2.75" height="4.5" rx="0.6" />
      <rect x="12.75" y="7.75" width="2.75" height="4.5" rx="0.6" />
    </>,
  );
}

/** Where the slides go (the presentation layer or announcements): a ringed target. */
export function TargetGlyph({ size = 20 }: GlyphProps) {
  return svg(
    size,
    <>
      <circle cx="10" cy="10" r="8" />
      <circle cx="10" cy="10" r="4.5" />
      <circle cx="10" cy="10" r="1.25" fill="currentColor" stroke="none" />
    </>,
  );
}

/** Playback (a picture or video's options): an arrow in a box. */
export function PlayBoxGlyph({ size = 20 }: GlyphProps) {
  return svg(
    size,
    <>
      <rect x="1.5" y="3" width="17" height="14" rx="2" />
      <path d="M8 7v6l5-3z" />
    </>,
  );
}

/**
 * Boxy icons for an item's header (big: they nearly fill it), in the style of a presentation console: each drawn on a
 * 16-unit grid in the text colour (currentColor), so they sit with the rest of the tools.
 */

interface GlyphProps {
  size?: number;
}

/** An item header's tool button: the icons nearly fill the header. */
export const HEADER_TOOL = '!h-[30px] !w-[30px]';

const svg = (size: number, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden fill="none">
    {children}
  </svg>
);

/** Auto-advance: a film strip with an arrow out of it (the slides move on by themselves). */
export function AutoAdvanceGlyph({ size = 21 }: GlyphProps) {
  return svg(
    size,
    <>
      <rect x="1" y="4" width="10" height="8" rx="1" fill="currentColor" />
      <path
        d="M2.5 5.4h1.3v1.3H2.5zM5 5.4h1.3v1.3H5zM7.5 5.4h1.3v1.3H7.5zM2.5 9.3h1.3v1.3H2.5zM5 9.3h1.3v1.3H5zM7.5 9.3h1.3v1.3H7.5z"
        fill="var(--surface-0)"
      />
      <path d="M11.5 4.5 15 8l-3.5 3.5z" fill="currentColor" />
    </>,
  );
}

/** Slide actions: a clipboard (what else happens with a slide). */
export function ClipboardGlyph({ size = 21 }: GlyphProps) {
  return svg(
    size,
    <>
      <rect
        x="2.5"
        y="3"
        width="11"
        height="11.5"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <rect x="5.5" y="1.5" width="5" height="3" rx="0.8" fill="currentColor" />
      <path d="M5 8h6M5 10.8h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>,
  );
}

/** Timeline: boxes on a track, arrows both ways (timings recorded and played back). */
export function TimelineGlyph({ size = 21 }: GlyphProps) {
  return svg(
    size,
    <>
      <path
        d="M2 4.5h11.5M13.5 4.5 11.8 2.8M14 11.5H2.5M2.5 11.5l1.7 1.7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <rect x="2.5" y="6.5" width="3" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.1" />
      <rect x="6.5" y="6.5" width="3" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.1" />
      <rect
        x="10.5"
        y="6.5"
        width="3"
        height="3"
        rx="0.5"
        stroke="currentColor"
        strokeWidth="1.1"
      />
    </>,
  );
}

/** A transition: two boxes either side of a divide (one slide giving way to the next). */
export function SplitGlyph({ size = 21 }: GlyphProps) {
  return svg(
    size,
    <>
      <rect x="1.5" y="3" width="13" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 1.5v13" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3.5" y="6" width="3" height="4" rx="0.5" fill="currentColor" />
      <rect x="9.5" y="6" width="3" height="4" rx="0.5" fill="currentColor" />
    </>,
  );
}

/** Where the slides go (the presentation layer or announcements): a ringed target. */
export function TargetGlyph({ size = 21 }: GlyphProps) {
  return svg(
    size,
    <>
      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
    </>,
  );
}

/** Playback (a picture or video's options): a solid arrow in a box. */
export function PlayBoxGlyph({ size = 21 }: GlyphProps) {
  return svg(
    size,
    <>
      <rect x="1.5" y="2" width="13" height="12" rx="1.5" fill="currentColor" />
      <path d="M6 5l4.5 3L6 11z" fill="var(--surface-0)" />
    </>,
  );
}

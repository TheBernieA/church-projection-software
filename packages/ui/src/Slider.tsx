import type { ComponentPropsWithRef, CSSProperties } from 'react';
import { Typography } from './Typography';

/** "85%": a value as a whole percentage of `of`. */
export const percent = (value: number, of = 1): string =>
  `${Math.round(of > 0 ? (value / of) * 100 : 0)}%`;

export interface SliderProps extends Omit<
  ComponentPropsWithRef<'input'>,
  'type' | 'value' | 'min' | 'max' | 'className'
> {
  value: number;
  min?: number;
  max: number;
  /**
   * The readout beside the track (also read out to screen readers). Defaults to how far along
   * the range it is, as a percentage; `null` hides it (e.g. a scrubber with its times elsewhere).
   */
  format?: ((value: number) => string) | null;
  /** Track fill colour (defaults to the text colour; e.g. red as a clip runs out). */
  fill?: string;
  /** Wrapper classes: width and flex behaviour. */
  className?: string;
}

/**
 * The one slider: a thin rounded track that fills up to the value, a crisp round thumb that
 * grows (with a soft halo) while hovered, dragged or focused, and the value beside it in
 * tabular figures so it never jitters. Any input props pass through (refs, change handlers),
 * so it works with `useDraft` and the preview/commit pattern alike.
 */
export function Slider({
  value,
  min = 0,
  max,
  format,
  fill,
  className = '',
  style,
  ...input
}: SliderProps) {
  const span = max - min;
  const at = span > 0 ? Math.min(100, Math.max(0, ((value - min) / span) * 100)) : 0;
  const readout = format === null ? null : format ? format(value) : `${Math.round(at)}%`;
  return (
    <span className={`flex min-w-0 items-center gap-2 ${className}`}>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        aria-valuetext={readout ?? undefined}
        {...input}
        style={
          {
            '--pct': `${at}%`,
            ...(fill ? { '--fill': fill } : {}),
            ...style,
          } as CSSProperties
        }
        className="ls-range min-w-0 flex-1"
      />
      {readout !== null && (
        <Typography size={10} tone="muted" tabular className="min-w-[3.25ch] shrink-0 text-right">
          {readout}
        </Typography>
      )}
    </span>
  );
}

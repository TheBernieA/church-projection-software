import type { ComponentPropsWithRef, ElementType, ReactNode } from 'react';

/**
 * The single source of truth for UI text in the control window. Every size, tone, weight and
 * preset lives here; components use <Typography> for text elements, or typographyClass() for
 * controls whose text is part of the control (buttons, inputs, menu items). A unit test fails if
 * a `text-ui-N` class is written anywhere else.
 *
 * Sizes are px at 100%. Each maps to a `text-ui-N` utility that scales with Settings › Text size,
 * so everything set through here follows the operator's choice.
 */
export type TypographySize = 10 | 11 | 12 | 13 | 14 | 15 | 16 | 18 | 20 | 26 | 28;
/** primary = main text, secondary = supporting, muted = hints and captions. */
export type TypographyTone = 'primary' | 'secondary' | 'muted' | 'white' | 'inherit';
export type TypographyWeight = 'regular' | 'medium' | 'semibold' | 'bold';
export type TypographyLeading = 'none' | 'tight' | 'snug' | 'normal' | 'relaxed';

/** Ready-made styles for the common cases; any prop given alongside overrides the preset. */
export type TypographyVariant =
  'overline' | 'field' | 'caption' | 'body' | 'label' | 'title' | 'heading' | 'display';

interface Style {
  size?: TypographySize;
  tone?: TypographyTone;
  weight?: TypographyWeight;
  caps?: boolean;
  /** Layout that always goes with the preset (a form label sits on its own line above the field). */
  extra?: string;
}

export const TYPOGRAPHY_VARIANTS: Record<TypographyVariant, Style> = {
  /** Small all-caps section heading ("LIBRARY", "APPEARANCE", inspector sections). */
  overline: { size: 11, weight: 'semibold', tone: 'muted', caps: true },
  /** The label above a form field ("Title", "Lyrics"). */
  field: { size: 12, weight: 'medium', tone: 'secondary', extra: 'mb-1.5 block' },
  /** Hints, descriptions and secondary lines under a title. */
  caption: { size: 12, tone: 'muted' },
  /** Ordinary UI text. */
  body: { size: 13 },
  /** Names of rows, fields and options. */
  label: { size: 13, weight: 'medium' },
  /** Card and section titles. */
  title: { size: 14, weight: 'semibold' },
  /** Page and dialog headings. */
  heading: { size: 16, weight: 'semibold' },
  /** Settings page titles. */
  display: { size: 20, weight: 'semibold' },
};

// Written out in full so Tailwind sees every class.
const SIZE: Record<TypographySize, string> = {
  10: 'text-ui-10',
  11: 'text-ui-11',
  12: 'text-ui-12',
  13: 'text-ui-13',
  14: 'text-ui-14',
  15: 'text-ui-15',
  16: 'text-ui-16',
  18: 'text-ui-18',
  20: 'text-ui-20',
  26: 'text-ui-26',
  28: 'text-ui-28',
};
/** The same sizes with `!`, for fields whose own CSS sets a size (see `important`). */
const SIZE_IMPORTANT: Record<TypographySize, string> = {
  10: '!text-ui-10',
  11: '!text-ui-11',
  12: '!text-ui-12',
  13: '!text-ui-13',
  14: '!text-ui-14',
  15: '!text-ui-15',
  16: '!text-ui-16',
  18: '!text-ui-18',
  20: '!text-ui-20',
  26: '!text-ui-26',
  28: '!text-ui-28',
};
const TONE: Record<TypographyTone, string> = {
  primary: 'text-[var(--text-1)]',
  secondary: 'text-[var(--text-2)]',
  muted: 'text-[var(--text-3)]',
  white: 'text-white',
  inherit: '',
};
const WEIGHT: Record<TypographyWeight, string> = {
  regular: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};
const LEADING: Record<TypographyLeading, string> = {
  none: 'leading-none',
  tight: 'leading-tight',
  snug: 'leading-snug',
  normal: 'leading-normal',
  relaxed: 'leading-relaxed',
};

interface OwnProps<E extends ElementType> {
  /** The element to render: 'p', 'span', 'h2', 'label', 'li'… Defaults to 'span'. */
  as?: E;
  variant?: TypographyVariant;
  size?: TypographySize;
  tone?: TypographyTone;
  weight?: TypographyWeight;
  leading?: TypographyLeading;
  /** All caps with a little letter spacing. */
  caps?: boolean;
  /** One line, cut off with an ellipsis. */
  truncate?: boolean;
  /** Numbers of equal width, so clocks and counts don't jiggle. */
  tabular?: boolean;
  /** Monospaced (code, timings). */
  mono?: boolean;
  italic?: boolean;
  /** Make the size win over a component's own CSS (`.field` inputs set theirs). */
  important?: boolean;
  className?: string;
  children?: ReactNode;
}

type StyleKey =
  | 'variant'
  | 'size'
  | 'tone'
  | 'weight'
  | 'leading'
  | 'caps'
  | 'truncate'
  | 'tabular'
  | 'mono'
  | 'italic'
  | 'important';
/** Just the look of <Typography>, without the element. */
export type TypographyStyleProps = { [K in StyleKey]?: OwnProps<'span'>[K] | undefined };

export type TypographyProps<E extends ElementType = 'span'> = OwnProps<E> &
  Omit<ComponentPropsWithRef<E>, keyof OwnProps<E>>;

/**
 * The class string <Typography> would use, for elements that can't be a <Typography> (buttons,
 * inputs, menu items): `className={`h-8 px-3 ${typographyClass({ size: 13 })}`}`.
 */
export function typographyClass({
  variant,
  size,
  tone,
  weight,
  leading,
  caps,
  truncate,
  tabular,
  mono,
  italic,
  important,
}: TypographyStyleProps): string {
  const preset: Style = variant ? TYPOGRAPHY_VARIANTS[variant] : {};
  const s = size ?? preset.size;
  const t = tone ?? preset.tone;
  const w = weight ?? preset.weight;
  return [
    s && (important ? SIZE_IMPORTANT[s] : SIZE[s]),
    t && TONE[t],
    w && WEIGHT[w],
    leading && LEADING[leading],
    (caps ?? preset.caps) && 'uppercase tracking-[0.06em]',
    truncate && 'truncate',
    tabular && 'tnum',
    mono && 'font-mono',
    italic && 'italic',
    preset.extra,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Typography for the control window. Pick the element with `as` and the look with `variant` or
 * the individual props; layout classes (margins, flex…) still go in `className`.
 *
 *   <Typography as="h2" variant="overline">Library</Typography>
 *   <Typography as="p" variant="caption" leading="snug">Dark is easiest on the eyes.</Typography>
 *   <Typography size={13} weight="semibold" truncate>{title}</Typography>
 */
export function Typography<E extends ElementType = 'span'>({
  as,
  variant,
  size,
  tone,
  weight,
  leading,
  caps,
  truncate,
  tabular,
  mono,
  italic,
  important,
  className,
  ...rest
}: TypographyProps<E>) {
  const Tag: ElementType = as ?? 'span';
  const cls = typographyClass({
    variant,
    size,
    tone,
    weight,
    leading,
    caps,
    truncate,
    tabular,
    mono,
    italic,
    important,
  });
  return <Tag className={className ? `${cls} ${className}` : cls} {...rest} />;
}

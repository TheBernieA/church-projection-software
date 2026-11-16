import type { ComponentPropsWithRef, ElementType, ReactNode } from 'react';

/**
 * UI text sizes in px. Each maps to a `text-ui-N` utility that scales with Settings › Text size,
 * so text set through <Text> always follows the operator's choice.
 */
export type TextSize = 10 | 11 | 12 | 13 | 14 | 15 | 16 | 18 | 20 | 26 | 28;
/** primary = main text, secondary = supporting, muted = hints and captions. */
export type TextTone = 'primary' | 'secondary' | 'muted' | 'white' | 'inherit';
export type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold';
export type TextLeading = 'none' | 'tight' | 'snug' | 'normal' | 'relaxed';

/** Ready-made styles for the common cases; any prop given alongside overrides the preset. */
export type TextVariant = 'overline' | 'caption' | 'body' | 'label' | 'title' | 'heading';

interface Style {
  size?: TextSize;
  tone?: TextTone;
  weight?: TextWeight;
  caps?: boolean;
}

export const TEXT_VARIANTS: Record<TextVariant, Style> = {
  /** Small all-caps section heading ("LIBRARY", "APPEARANCE"). */
  overline: { size: 11, weight: 'semibold', tone: 'muted', caps: true },
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
};

// Written out in full so Tailwind sees every class.
const SIZE: Record<TextSize, string> = {
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
const TONE: Record<TextTone, string> = {
  primary: 'text-[var(--text-1)]',
  secondary: 'text-[var(--text-2)]',
  muted: 'text-[var(--text-3)]',
  white: 'text-white',
  inherit: '',
};
const WEIGHT: Record<TextWeight, string> = {
  regular: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};
const LEADING: Record<TextLeading, string> = {
  none: 'leading-none',
  tight: 'leading-tight',
  snug: 'leading-snug',
  normal: 'leading-normal',
  relaxed: 'leading-relaxed',
};

interface OwnProps<E extends ElementType> {
  /** The element to render: 'p', 'span', 'h2', 'label', 'li'… Defaults to 'span'. */
  as?: E;
  variant?: TextVariant;
  size?: TextSize;
  tone?: TextTone;
  weight?: TextWeight;
  leading?: TextLeading;
  /** All caps with a little letter spacing. */
  caps?: boolean;
  /** One line, cut off with an ellipsis. */
  truncate?: boolean;
  /** Numbers of equal width, so clocks and counts don't jiggle. */
  tabular?: boolean;
  className?: string;
  children?: ReactNode;
}

type StyleKey =
  'variant' | 'size' | 'tone' | 'weight' | 'leading' | 'caps' | 'truncate' | 'tabular';
/** Just the look of <Text>, without the element. */
export type TextStyleProps = { [K in StyleKey]?: OwnProps<'span'>[K] | undefined };

export type TextProps<E extends ElementType = 'span'> = OwnProps<E> &
  Omit<ComponentPropsWithRef<E>, keyof OwnProps<E>>;

/** The class string <Text> would use; for elements that can't be a <Text> (buttons, inputs). */
export function textClass({
  variant,
  size,
  tone,
  weight,
  leading,
  caps,
  truncate,
  tabular,
}: TextStyleProps): string {
  const preset: Style = variant ? TEXT_VARIANTS[variant] : {};
  const s = size ?? preset.size;
  const t = tone ?? preset.tone;
  const w = weight ?? preset.weight;
  return [
    s && SIZE[s],
    t && TONE[t],
    w && WEIGHT[w],
    leading && LEADING[leading],
    (caps ?? preset.caps) && 'uppercase tracking-[0.06em]',
    truncate && 'truncate',
    tabular && 'tnum',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Typography for the control window. Pick the element with `as` and the look with `variant` or
 * the individual props; layout classes (margins, flex…) still go in `className`.
 *
 *   <Text as="h2" variant="overline">Library</Text>
 *   <Text as="p" variant="caption" leading="snug">Dark is easiest on the eyes.</Text>
 *   <Text size={13} weight="semibold" truncate>{title}</Text>
 */
export function Text<E extends ElementType = 'span'>({
  as,
  variant,
  size,
  tone,
  weight,
  leading,
  caps,
  truncate,
  tabular,
  className,
  ...rest
}: TextProps<E>) {
  const Tag: ElementType = as ?? 'span';
  const cls = textClass({ variant, size, tone, weight, leading, caps, truncate, tabular });
  return <Tag className={className ? `${cls} ${className}` : cls} {...rest} />;
}

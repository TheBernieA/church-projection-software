import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { typographyClass } from './Typography';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'quiet'
  | 'link'
  | 'live'
  | 'preview'
  | 'danger'
  | 'subtle'
  | 'bare';

const base =
  'inline-flex cursor-pointer items-center justify-center gap-2 font-medium select-none whitespace-nowrap ' +
  'transition-[background-color,color,box-shadow,transform,filter] duration-[var(--dur-fast)] ease-[var(--ease-out)] active:scale-[0.97] ' +
  'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100';

/**
 * `bare`: the button's behaviour (type, ref, disabled cursor) with no look of its own, for
 * clickable surfaces that style themselves: slide cards, tiles, grid cells, tabs, list rows.
 */
const BARE = 'cursor-pointer disabled:cursor-default';

const variants: Record<Exclude<ButtonVariant, 'bare'>, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--accent-ink)] shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_1px_2px_rgba(0,0,0,0.4)] hover:brightness-110',
  secondary:
    'bg-[var(--surface-3)] text-[var(--text-1)] shadow-[var(--shadow-1)] hover:bg-[var(--surface-4)]',
  subtle:
    'bg-[var(--surface-2)] text-[var(--text-1)] shadow-[var(--shadow-1)] hover:bg-[var(--surface-3)]',
  ghost: 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)]',
  /** Dimmer than ghost: small helper icons in headers and strips. */
  quiet: 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)]',
  /** Text link in the accent colour (use with size="inline"). */
  link: 'text-[var(--accent)] hover:underline active:scale-100',
  // Live/preview colours are reserved for actions that change those states.
  live: 'bg-[var(--tally-program)] text-white font-semibold shadow-[0_1px_0_rgba(255,255,255,0.2)_inset,0_6px_20px_rgba(239,74,80,0.35)] hover:brightness-110',
  preview: 'bg-[var(--tally-preview)] text-white hover:brightness-110',
  danger: 'text-[var(--tally-program)] hover:bg-[var(--danger-soft)]',
};

const sizes = {
  /** No box: sits in a line of text (links, "Delete" under a tile). */
  inline: typographyClass({ size: 12 }),
  '3xs': `h-5 px-1.5 rounded-[var(--radius-sm)] ${typographyClass({ size: 11 })}`,
  '2xs': `h-6 px-2 rounded-[var(--radius-sm)] ${typographyClass({ size: 11 })}`,
  xs: `h-7 px-2 rounded-[var(--radius-control)] ${typographyClass({ size: 12 })}`,
  sm: `h-8 px-3 rounded-[var(--radius-control)] ${typographyClass({ size: 13 })}`,
  md: `h-9 px-3.5 rounded-[var(--radius-control)] ${typographyClass({ size: 13 })}`,
  lg: `h-12 px-5 rounded-[var(--radius-control)] ${typographyClass({ size: 15 })}`,
} as const;
export type ButtonSize = keyof typeof sizes;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className = '', type = 'button', icon, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={
        variant === 'bare'
          ? `${BARE} ${className}`
          : `${base} ${variants[variant]} ${sizes[size]} ${className}`
      }
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

const ICON_DIM: Record<ButtonSize, string> = {
  inline: '',
  '3xs': 'h-5 w-5',
  '2xs': 'h-6 w-6',
  xs: 'h-7 w-7',
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
};
/** How an icon button looks while `active`: accent (default), blue selection, or red live. */
const ACTIVE = {
  accent: '!bg-[var(--accent-soft)] !text-[var(--accent)]',
  select: '!bg-[var(--select)] !text-white',
  live: '!bg-[var(--tally-program)] !text-white shadow-[0_0_8px_rgba(239,74,80,0.45)] hover:brightness-110',
  /** Green: something playing on a layer of its own (the announcements layer). */
  preview: '!bg-[var(--tally-preview)] !text-white hover:brightness-110',
} as const;

/**
 * Square icon-only button. Always pass an aria-label (it doubles as the tooltip). `active`
 * marks an engaged toggle; pass `aria-pressed` too when it is one.
 */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, 'icon'> & {
    'aria-label': string;
    active?: boolean;
    activeTone?: keyof typeof ACTIVE;
  }
>(function IconButton(
  {
    size = 'sm',
    className = '',
    active,
    activeTone = 'accent',
    children,
    variant = 'ghost',
    ...rest
  },
  ref,
) {
  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={`${ICON_DIM[size]} !px-0 ${active ? ACTIVE[activeTone] : ''} ${className}`}
      title={rest.title ?? rest['aria-label']}
      {...rest}
    >
      {children}
    </Button>
  );
});

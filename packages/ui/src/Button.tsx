import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant =
  'primary' | 'secondary' | 'ghost' | 'live' | 'preview' | 'danger' | 'subtle';

const base =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium select-none whitespace-nowrap ' +
  'transition-[background-color,color,box-shadow,transform,filter] duration-[var(--dur-fast)] ease-[var(--ease-out)] active:scale-[0.97] ' +
  'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--accent-ink)] shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_1px_2px_rgba(0,0,0,0.4)] hover:brightness-110',
  secondary:
    'bg-[var(--surface-3)] text-[var(--text-1)] shadow-[var(--shadow-1)] hover:bg-[var(--surface-4)]',
  subtle:
    'bg-[var(--surface-2)] text-[var(--text-1)] shadow-[var(--shadow-1)] hover:bg-[var(--surface-3)]',
  ghost: 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)]',
  // Live/preview colours are reserved for actions that change those states.
  live: 'bg-[var(--tally-program)] text-white font-semibold shadow-[0_1px_0_rgba(255,255,255,0.2)_inset,0_6px_20px_rgba(239,74,80,0.35)] hover:brightness-110',
  preview: 'bg-[var(--tally-preview)] text-white hover:brightness-110',
  danger: 'text-[var(--tally-program)] hover:bg-[var(--danger-soft)]',
};

const sizes = {
  xs: 'h-7 px-2 text-[12px]',
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-3.5 text-[13px]',
  lg: 'h-12 px-5 text-[15px]',
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: keyof typeof sizes;
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
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

/** Square icon-only button. Always pass an aria-label. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, 'icon'> & { 'aria-label': string; active?: boolean }
>(function IconButton(
  { size = 'sm', className = '', active, children, variant = 'ghost', ...rest },
  ref,
) {
  const dim =
    size === 'xs' ? 'h-7 w-7' : size === 'sm' ? 'h-8 w-8' : size === 'md' ? 'h-9 w-9' : 'h-11 w-11';
  return (
    <Button
      ref={ref}
      variant={variant}
      className={`${dim} !px-0 ${active ? '!bg-[var(--accent-soft)] !text-[var(--accent)]' : ''} ${className}`}
      title={rest.title ?? rest['aria-label']}
      {...rest}
    >
      {children}
    </Button>
  );
});

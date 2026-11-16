import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { typographyClass, Typography } from './Typography';
import { Button } from './Button';

export interface NavItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon?: ReactNode;
  label: ReactNode;
  /** Shown at the right end: a count, a "Soon" badge… */
  trailing?: ReactNode;
  selected?: boolean;
  /** compact = 26px outline rows (sidebar, bin); comfortable = 36px (Settings). */
  density?: 'compact' | 'comfortable';
  /**
   * select = blue Finder-style selection (lists of things); accent = soft amber (pages of a
   * dialog).
   */
  tone?: 'select' | 'accent';
  /** Dimmed label, for entries that aren't available yet. */
  dim?: boolean;
}

const DENSITY = {
  compact: 'mx-1.5 h-[26px] gap-2 rounded-[4px] px-2',
  comfortable: 'h-9 gap-2.5 rounded-[8px] px-2.5',
} as const;

/**
 * One entry in a navigation list: Library/Playlists in the sidebar, the media bin's categories,
 * the Settings pages. Selected entries are highlighted; everything else is a quiet row.
 */
export function NavItem({
  icon,
  label,
  trailing,
  selected = false,
  density = 'compact',
  tone = 'select',
  dim = false,
  className = '',
  type = 'button',
  ...rest
}: NavItemProps) {
  const look = selected
    ? tone === 'select'
      ? 'bg-[var(--select)] text-white [&_svg]:!text-white'
      : 'bg-[var(--accent-soft)] font-medium text-[var(--text-1)] [&_svg]:!text-[var(--accent)]'
    : `${dim ? 'text-[var(--text-3)]' : tone === 'accent' ? 'text-[var(--text-2)]' : 'text-[var(--text-1)]'} hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]`;
  return (
    <Button
      variant="bare"
      type={type}
      className={`flex cursor-pointer items-center text-left transition-colors duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${typographyClass({ size: 13 })} ${DENSITY[density]} ${look} ${className}`}
      {...rest}
    >
      {icon && <span className="flex shrink-0">{icon}</span>}
      <Typography truncate className="min-w-0 flex-1">
        {label}
      </Typography>
      {trailing}
    </Button>
  );
}

import type { ReactNode } from 'react';
import { Text } from './Text';

/** Small "Soon" pill marking a feature that is planned but not built yet. */
export function SoonBadge({ label = 'Soon' }: { label?: string }) {
  return (
    <Text
      size={10}
      weight="semibold"
      className="inline-flex h-4 shrink-0 items-center rounded-full bg-[var(--soon-soft)] px-1.5 uppercase tracking-[0.04em] text-[var(--soon)]"
      data-soon
    >
      {label}
    </Text>
  );
}

/**
 * A control for a planned feature: looks like the real thing, shows a "Soon" badge, and is
 * disabled with an explanatory tooltip, so operators can see what's coming without
 * mistaking it for something broken.
 */
export function ComingSoonButton({
  icon,
  children,
  title,
  className = '',
  compact = false,
}: {
  icon?: ReactNode;
  children: ReactNode;
  /** Tooltip, e.g. "Record: coming soon". */
  title: string;
  className?: string;
  /** Icon + badge only (label kept for screen readers). */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      disabled
      aria-disabled
      title={title}
      className={`inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 text-ui-12 font-medium text-[var(--text-3)] ${className}`}
    >
      {icon}
      <span className={compact ? 'sr-only' : ''}>{children}</span>
      <SoonBadge />
    </button>
  );
}

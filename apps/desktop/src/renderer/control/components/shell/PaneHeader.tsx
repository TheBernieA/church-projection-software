import type { ReactNode } from 'react';

/** Pane header: small-caps title, an optional count, optional controls on the right. */
export function PaneHeader({
  title,
  count,
  children,
}: {
  title: ReactNode;
  count?: number;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-[var(--hairline)] px-3">
      <h2 className="flex min-w-0 items-baseline gap-1.5 truncate text-[length:var(--fs-xs)] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">
        {title}
        {count !== undefined && (
          <span className="tnum font-medium tracking-normal text-[var(--text-3)]/80">{count}</span>
        )}
      </h2>
      {children && <div className="flex shrink-0 items-center gap-1">{children}</div>}
    </div>
  );
}

/** Small pressed-state tab used in pane headers (Songs | Hymns, bin tabs). */
export function PaneTab({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[length:var(--fs-sm)] font-medium transition-[background-color,color,box-shadow] duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
        active
          ? 'bg-[var(--surface-3)] text-[var(--text-1)] shadow-[var(--highlight-top),0_0_0_1px_var(--hairline)]'
          : 'text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

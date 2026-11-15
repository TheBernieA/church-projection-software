import type { ReactNode } from 'react';

/** Compact pane header: small-caps title, optional controls on the right. */
export function PaneHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-[var(--hairline)] px-3">
      <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-3)]">
        {title}
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
      className={`flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-[5px] px-2 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
        active
          ? 'bg-[var(--surface-3)] text-[var(--text-1)]'
          : 'text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

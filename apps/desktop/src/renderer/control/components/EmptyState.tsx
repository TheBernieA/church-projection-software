import type { ReactNode } from 'react';

/** Centred hint for a workspace with nothing to show yet. */
export function EmptyState({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <div className="text-[var(--text-3)]">{icon}</div>
      <p className="text-ui-14 font-semibold text-[var(--text-2)]">{title}</p>
      {body && <p className="max-w-sm text-ui-12 leading-relaxed text-[var(--text-3)]">{body}</p>}
    </div>
  );
}

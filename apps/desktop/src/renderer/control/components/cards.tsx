import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';

/** Card style shared by bin items (messages, timers) and their "new" forms. */
export const BIN_CARD =
  'flex shrink-0 flex-col gap-2 rounded-[6px] bg-[var(--surface-2)] p-2.5 shadow-[var(--shadow-1)]';

/** Dashed "+ New …" card that starts adding something (slides, props, messages, timers). */
export function AddCard({
  label,
  onClick,
  className = '',
  icon = <Plus size={18} />,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[6px] border-2 border-dashed border-[var(--hairline-strong)] text-[12px] font-medium text-[var(--text-3)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] ${className}`}
    >
      {icon}
      {label}
    </button>
  );
}

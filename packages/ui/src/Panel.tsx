import type { ReactNode } from 'react';

/** Panel header: sentence-case title (13px semibold), optional icon, actions on the right. */
export function PanelHeader({
  title,
  icon,
  actions,
  subtitle,
}: {
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[var(--hairline)] px-4">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="text-[var(--text-3)]">{icon}</span>}
        <h2 className="truncate text-ui-13 font-semibold text-[var(--text-1)]">{title}</h2>
        {subtitle && <span className="truncate text-ui-12 text-[var(--text-3)]">{subtitle}</span>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

/** Tally label for monitors: a coloured dot + label. Colour is meaning, never decoration. */
export function TallyLabel({
  tone,
  children,
  active = true,
}: {
  tone: 'program' | 'preview';
  children: ReactNode;
  active?: boolean;
}) {
  const c = tone === 'program' ? 'var(--tally-program)' : 'var(--tally-preview)';
  return (
    <span
      className="inline-flex items-center gap-1.5 text-ui-12 font-semibold"
      style={{ color: active ? c : 'var(--text-3)' }}
    >
      {/* Static glow, no pulsing: the control UI has no ambient animation (§15.3). */}
      <span
        aria-hidden
        className="inline-flex h-2 w-2 rounded-full"
        style={{
          background: active ? c : 'var(--text-3)',
          boxShadow: active ? `0 0 8px ${c}` : 'none',
        }}
      />
      {children}
    </span>
  );
}

/** Toggle chip used for masks (black / logo / freeze). Red when engaged — it changes the live output. */
export function ToggleChip({
  on,
  onClick,
  icon,
  label,
  hint,
  className = '',
}: {
  on: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  hint?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      title={hint ? `${label} (${hint})` : label}
      className={`group inline-flex h-8 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-3 text-ui-12 font-medium transition-[background-color,box-shadow,color] duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
        on
          ? 'bg-[var(--tally-program)] text-white shadow-[0_4px_16px_rgba(239,74,80,0.35)]'
          : 'bg-[var(--surface-2)] text-[var(--text-1)] shadow-[var(--shadow-1)] hover:bg-[var(--surface-3)]'
      } ${className}`}
    >
      {icon}
      <span className="truncate">{label}</span>
      {hint && (
        <span className={`text-ui-11 ${on ? 'text-white/75' : 'text-[var(--text-3)]'}`}>
          {hint}
        </span>
      )}
    </button>
  );
}

/** Small corner tag on a thumbnail: LIVE (red) or PREVIEW (green). */
export function TallyTag({
  tone,
  children,
  className = '',
}: {
  tone: 'program' | 'preview';
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`absolute right-1.5 top-1.5 rounded-[4px] px-1.5 py-px text-ui-10 font-bold tracking-[0.06em] text-white shadow-[0_2px_8px_rgba(0,0,0,0.35)] ${
        tone === 'program' ? 'bg-[var(--tally-program)]' : 'bg-[var(--tally-preview)]'
      } ${className}`}
    >
      {children}
    </span>
  );
}

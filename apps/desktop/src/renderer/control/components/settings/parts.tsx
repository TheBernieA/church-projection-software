import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { DeferredInput } from '../DeferredControls';

/** One settings page: title, one-line intro, optional header action, then groups. */
export function SettingsPage({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[640px] px-8 pb-10 pt-7">
      <header className="mb-6 flex items-start justify-between gap-4 pr-8">
        <div>
          <h2 className="text-[20px] font-semibold tracking-[-0.015em]">{title}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-2)]">{description}</p>
        </div>
        {action && <div className="shrink-0 pt-1">{action}</div>}
      </header>
      <div className="space-y-7">{children}</div>
    </div>
  );
}

/** A card of related rows, separated by hairlines. */
export function Group({
  title,
  footnote,
  children,
}: {
  title?: string;
  footnote?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      {title && <h3 className="section-label mb-2 px-1">{title}</h3>}
      <div className="divide-y divide-[var(--hairline)] overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-2)] shadow-[var(--shadow-1)]">
        {children}
      </div>
      {footnote && (
        <p className="mt-2 px-1 text-[12px] leading-relaxed text-[var(--text-3)]">{footnote}</p>
      )}
    </section>
  );
}

/** Label + explanation on the left, control on the right. */
export function Row({
  label,
  description,
  htmlFor,
  children,
  stack,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  children: ReactNode;
  stack?: boolean;
}) {
  const Label = htmlFor ? 'label' : 'span';
  return (
    <div
      className={`flex gap-6 px-4 py-3.5 ${stack ? 'flex-col gap-3' : 'items-center justify-between'}`}
    >
      <div className="min-w-0">
        <Label
          {...(htmlFor ? { htmlFor } : {})}
          className="block text-[13px] font-medium text-[var(--text-1)]"
        >
          {label}
        </Label>
        {description && (
          <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-3)]">{description}</p>
        )}
      </div>
      <div className={stack ? '' : 'shrink-0'}>{children}</div>
    </div>
  );
}

/** Numeric/text input that shows its unit ("320 characters") and commits after a pause. */
export function UnitInput({
  id,
  value,
  unit,
  wide,
  onCommit,
  type = 'number',
  ...rest
}: {
  id: string;
  value: string;
  unit?: string;
  wide?: boolean;
  onCommit: (v: string) => void;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <DeferredInput
        id={id}
        type={type}
        value={value}
        onCommit={onCommit}
        className={`field !h-8 ${wide ? '!w-40 text-left' : '!w-20 text-right'} tnum`}
        {...rest}
      />
      {unit && <span className="text-[13px] text-[var(--text-3)]">{unit}</span>}
    </div>
  );
}

/** Visual Dark / Light picker — a tiny mock of the app in each theme. */
export function ThemeTiles({
  value,
  onChange,
  labels,
}: {
  value: 'dark' | 'light';
  onChange: (v: 'dark' | 'light') => void;
  labels: { dark: string; light: string };
}) {
  const tile = (mode: 'dark' | 'light') => {
    const on = value === mode;
    const c =
      mode === 'dark'
        ? { bg: '#0c0e13', panel: '#1a1e27', line: '#2c3242' }
        : { bg: '#e9ebf0', panel: '#ffffff', line: '#d9dde7' };
    return (
      <button
        key={mode}
        type="button"
        role="radio"
        aria-checked={on}
        onClick={() => onChange(mode)}
        className="group flex cursor-pointer flex-col items-center gap-1.5 focus-visible:outline-none"
      >
        <span
          className={`relative block h-[58px] w-[92px] overflow-hidden rounded-[8px] transition-shadow ${on ? 'shadow-[0_0_0_2px_var(--accent)]' : 'shadow-[0_0_0_1px_var(--hairline-strong)] group-hover:shadow-[0_0_0_1px_var(--text-3)]'} group-focus-visible:shadow-[var(--focus-ring)]`}
          style={{ background: c.bg }}
        >
          <span
            className="absolute left-1.5 top-1.5 h-[46px] w-3 rounded-[3px]"
            style={{ background: c.panel }}
          />
          <span
            className="absolute left-6 right-1.5 top-1.5 h-5 rounded-[3px]"
            style={{ background: c.panel }}
          />
          <span
            className="absolute bottom-1.5 left-6 right-1.5 h-[18px] rounded-[3px]"
            style={{ background: c.panel }}
          />
          <span
            className="absolute left-8 top-[13px] h-1 w-8 rounded"
            style={{ background: c.line }}
          />
          <span className="absolute left-[34px] top-[36px] h-[6px] w-[22px] rounded-sm bg-[#e8b04b]" />
          {on && (
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)]">
              <Check size={11} strokeWidth={3} />
            </span>
          )}
        </span>
        <span
          className={`text-[12px] ${on ? 'font-medium text-[var(--text-1)]' : 'text-[var(--text-2)]'}`}
        >
          {labels[mode]}
        </span>
      </button>
    );
  };
  return (
    <div role="radiogroup" aria-label={labels.dark + ' / ' + labels.light} className="flex gap-3">
      {tile('dark')}
      {tile('light')}
    </div>
  );
}

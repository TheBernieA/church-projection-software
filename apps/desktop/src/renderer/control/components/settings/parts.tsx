import { LookLayerSchema, type LookLayer } from '@lampstand/core';
import type { ReactNode } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { DeferredInput } from '../DeferredControls';
import { Button, IconButton, Typography } from '@lampstand/ui';

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
          <Typography as="h2" size={20} weight="semibold" className="tracking-[-0.015em]">
            {title}
          </Typography>
          <Typography as="p" size={13} tone="secondary" leading="relaxed" className="mt-1">
            {description}
          </Typography>
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
  action,
  children,
}: {
  title?: string;
  footnote?: ReactNode;
  /** A small control beside the title (e.g. "Look again"). */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      {(title || action) && (
        <div className="mb-2 flex min-h-6 items-end justify-between gap-3 px-1">
          {title && (
            <Typography as="h3" variant="overline">
              {title}
            </Typography>
          )}
          {action}
        </div>
      )}
      <div className="divide-y divide-[var(--hairline)] overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-2)] shadow-[var(--shadow-1)]">
        {children}
      </div>
      {footnote && (
        <Typography as="p" variant="caption" leading="relaxed" className="mt-2 px-1">
          {footnote}
        </Typography>
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
  return (
    <div
      className={`flex gap-6 px-4 py-3.5 ${stack ? 'flex-col gap-3' : 'items-center justify-between'}`}
    >
      <div className="min-w-0">
        <Typography
          as={htmlFor ? 'label' : 'span'}
          variant="label"
          tone="primary"
          className="block"
          {...(htmlFor ? { htmlFor } : {})}
        >
          {label}
        </Typography>
        {description && (
          <Typography as="p" variant="caption" leading="snug" className="mt-0.5">
            {description}
          </Typography>
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
      {unit && (
        <Typography size={13} tone="muted">
          {unit}
        </Typography>
      )}
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
      <Button
        variant="bare"
        key={mode}
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
        <Typography
          size={12}
          tone={on ? 'primary' : 'secondary'}
          weight={on ? 'medium' : 'regular'}
        >
          {labels[mode]}
        </Typography>
      </Button>
    );
  };
  return (
    <div role="radiogroup" aria-label={labels.dark + ' / ' + labels.light} className="flex gap-3">
      {tile('dark')}
      {tile('light')}
    </div>
  );
}

/** A named entry in a list editor (clear group, Look, mask): its name and a delete button. */
export function NameRow({
  value,
  label,
  deleteLabel,
  onRename,
  onDelete,
}: {
  value: string;
  label: string;
  deleteLabel: string;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <DeferredInput
        aria-label={label}
        value={value}
        maxLength={40}
        onCommit={(name) => name.trim() && onRename(name.trim())}
        className="field !h-8 flex-1"
      />
      <IconButton size="xs" variant="danger" aria-label={deleteLabel} onClick={onDelete}>
        <Trash2 size={14} />
      </IconButton>
    </div>
  );
}

/** Toggle chips picking which screen layers apply (Looks, clear groups). */
export function LayerChips({
  label,
  value,
  onChange,
  names,
  minOne = false,
}: {
  label: string;
  value: readonly LookLayer[];
  onChange: (layers: LookLayer[]) => void;
  /** The chip label for each layer. */
  names: (layer: LookLayer) => string;
  /** At least one layer stays on (a clear group must clear something). */
  minOne?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {LookLayerSchema.options.map((l) => {
        const on = value.includes(l);
        return (
          <Button
            key={l}
            size="2xs"
            variant={on ? 'primary' : 'subtle'}
            aria-pressed={on}
            disabled={minOne && on && value.length === 1}
            onClick={() => onChange(on ? value.filter((x) => x !== l) : [...value, l])}
          >
            {names(l)}
          </Button>
        );
      })}
    </div>
  );
}

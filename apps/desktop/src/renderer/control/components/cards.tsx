import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, Text } from '@lampstand/ui';

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
      className={`flex shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[6px] border-2 border-dashed border-[var(--hairline-strong)] text-ui-12 font-medium text-[var(--text-3)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] ${className}`}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Shows a control only while its card is hovered, or while it has keyboard focus (a hidden
 * delete button must still be reachable from the keyboard). The card needs the `group` class.
 */
export const REVEAL =
  'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100';

/** A column of show-control cards (props, messages, timers): each card takes the full width. */
export function BinRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5 [&>*]:!w-full">
      {children}
    </div>
  );
}

/** Small grey label: "Built-in", a message style, a timer kind. */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <Text
      size={10}
      tone="muted"
      weight="medium"
      className="shrink-0 rounded-[4px] bg-[var(--surface-3)] px-1.5 py-px"
    >
      {children}
    </Text>
  );
}

/** A card's title line: its name, an optional badge, and a delete button revealed on hover. */
export function CardTitle({
  name,
  badge,
  deleteLabel,
  onDelete,
}: {
  name: string;
  badge?: ReactNode;
  deleteLabel: string;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Text size={12} weight="semibold" truncate className="min-w-0 flex-1">
        {name}
      </Text>
      {badge && <Badge>{badge}</Badge>}
      <IconButton
        size="xs"
        type="button"
        aria-label={deleteLabel}
        className={REVEAL}
        onClick={onDelete}
      >
        <Trash2 size={13} />
      </IconButton>
    </div>
  );
}

/** Cancel / confirm buttons at the foot of a "new …" card form (the confirm one submits). */
export function FormActions({
  onCancel,
  submitLabel,
  disabled,
}: {
  onCancel: () => void;
  submitLabel: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-end gap-1.5">
      <Button size="xs" variant="ghost" type="button" onClick={onCancel}>
        {t('song.cancel')}
      </Button>
      <Button size="xs" variant="primary" type="submit" disabled={disabled}>
        {submitLabel}
      </Button>
    </div>
  );
}

/**
 * A pickable picture tile (backgrounds, media, logo looks): the preview, its name underneath,
 * a lift on hover and an accent ring when chosen. Extra props (role, aria-checked, drag
 * handlers, title) pass through to the button.
 */
export function Tile({
  label,
  selected = false,
  children,
  className = '',
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: ReactNode;
  selected?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`group/tile block w-full cursor-pointer text-left focus-visible:outline-none ${className}`}
      {...rest}
    >
      <div
        className={`relative aspect-video w-full overflow-hidden rounded-[8px] bg-black transition-[transform,box-shadow] duration-150 will-change-transform group-hover/tile:-translate-y-0.5 group-focus-visible/tile:shadow-[0_0_0_2px_var(--accent)] ${
          selected
            ? 'shadow-[0_0_0_2px_var(--accent)]'
            : 'shadow-[var(--shadow-1)] group-hover/tile:shadow-[var(--shadow-2)]'
        }`}
      >
        {children}
      </div>
      <Text
        size={12}
        tone={selected ? 'primary' : 'secondary'}
        weight={selected ? 'medium' : 'regular'}
        truncate
        className="mt-1.5 block"
      >
        {label}
      </Text>
    </button>
  );
}

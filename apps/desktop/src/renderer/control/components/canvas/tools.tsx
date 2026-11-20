import type { ReactNode, Ref } from 'react';
import { Button, Typography } from '@lampstand/ui';

/** One tool on an editor's tool bar: an icon over its short name. */
export function Tool({
  icon,
  label,
  title,
  onClick,
  active,
  disabled,
  danger,
  ref,
  ...rest
}: {
  icon: ReactNode;
  label: string;
  /** A longer explanation on hover (else the label). */
  title?: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <Button
      {...rest}
      ref={ref}
      variant="bare"
      title={title ?? label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-12 w-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-[8px] transition-colors disabled:cursor-default disabled:opacity-35 ${
        active
          ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
          : danger
            ? 'text-[var(--text-2)] hover:bg-[color-mix(in_srgb,var(--tally-program)_18%,transparent)] hover:text-[var(--tally-program)]'
            : 'text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]'
      }`}
    >
      {icon}
      <Typography size={10} weight="medium" tone="inherit" truncate className="max-w-full">
        {label}
      </Typography>
    </Button>
  );
}

/** A thin line between groups of tools. */
export const ToolDivider = () => (
  <span aria-hidden className="mx-1 h-8 w-px bg-[var(--hairline-strong)]" />
);

/** The tool bar's frame (above the slide, or floating over it). */
export function ToolBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className="flex items-center gap-0.5 rounded-[12px] bg-[var(--surface-1)] p-1 shadow-[0_0_0_1px_var(--hairline-strong),0_10px_30px_rgba(0,0,0,0.35)]"
    >
      {children}
    </div>
  );
}

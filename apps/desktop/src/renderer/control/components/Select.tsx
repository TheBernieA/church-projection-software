import * as RS from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Secondary text shown under the label in the menu. */
  description?: string;
  /** Leading visual (swatch, icon). */
  leading?: ReactNode;
  /** Style for the label (e.g. render a font name in its own font). */
  labelStyle?: CSSProperties;
  disabled?: boolean;
}

export interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  'aria-label'?: string;
  id?: string;
  size?: 'sm' | 'md';
  className?: string;
  placeholder?: string;
}

/**
 * Styled, accessible dropdown (Radix Select): full keyboard support, type-ahead, and it renders
 * in a portal so it works inside dialogs. Replaces native <select>, which can't be themed.
 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  id,
  size = 'md',
  className = '',
  placeholder,
  ...rest
}: SelectProps<T>) {
  const current = options.find((o) => o.value === value);
  const h = size === 'sm' ? 'h-8 text-ui-13' : 'h-9 text-ui-13';
  return (
    <RS.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <RS.Trigger
        id={id}
        aria-label={rest['aria-label']}
        className={`group inline-flex w-full cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-control)] bg-[var(--surface-1)] pl-3 pr-2 font-medium text-[var(--text-1)] shadow-[inset_0_0_0_1px_var(--hairline-strong)] transition-[box-shadow,background-color] duration-150 hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_var(--accent-soft)] data-[state=open]:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_var(--accent-soft)] ${h} ${className}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {current?.leading}
          <span className="truncate" style={current?.labelStyle}>
            <RS.Value placeholder={placeholder}>{current?.label}</RS.Value>
          </span>
        </span>
        <RS.Icon asChild>
          <ChevronDown
            size={15}
            className="shrink-0 text-[var(--text-3)] transition-transform duration-150 group-data-[state=open]:rotate-180"
          />
        </RS.Icon>
      </RS.Trigger>
      <RS.Portal>
        <RS.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] max-h-[min(360px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[12px] bg-[var(--surface-2)] shadow-[var(--shadow-3)] data-[state=open]:animate-[ls-pop_120ms_ease-out]"
        >
          <RS.Viewport className="p-1.5">
            {options.map((o) => (
              <RS.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="relative flex cursor-pointer select-none items-center gap-2.5 rounded-[8px] py-2 pl-2.5 pr-8 text-ui-13 text-[var(--text-1)] outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[highlighted]:bg-[var(--surface-4)] data-[state=checked]:font-semibold"
              >
                {o.leading}
                <span className="flex min-w-0 flex-col leading-tight">
                  <RS.ItemText>
                    <span style={o.labelStyle}>{o.label}</span>
                  </RS.ItemText>
                  {o.description && (
                    <span className="mt-0.5 truncate text-ui-12 font-normal text-[var(--text-3)]">
                      {o.description}
                    </span>
                  )}
                </span>
                <RS.ItemIndicator className="absolute right-2.5 text-[var(--accent)]">
                  <Check size={15} strokeWidth={2.5} />
                </RS.ItemIndicator>
              </RS.Item>
            ))}
          </RS.Viewport>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  );
}

/** Small colour swatch for background options. */
export function Swatch({ background }: { background: string }) {
  return (
    <span
      aria-hidden
      className="h-5 w-8 shrink-0 rounded-[5px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
      style={{ background }}
    />
  );
}

import type { ReactNode } from 'react';
import { typographyClass } from './Typography';
import { Button } from './Button';

export interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  /** Shown, but can't be changed just now. */
  disabled?: boolean;
}

/** Accessible segmented control (radio group semantics). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled = false,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={`inline-flex rounded-[var(--radius-control)] bg-[var(--surface-1)] p-0.5 shadow-[inset_0_0_0_1px_var(--hairline)] ${disabled ? 'opacity-60' : ''}`}
    >
      {options.map((o) => (
        <Button
          variant="bare"
          key={o.value}
          role="radio"
          disabled={disabled}
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[5px] px-3 transition-[background-color,color,box-shadow] duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${typographyClass({ size: 12, weight: 'medium' })} ${
            value === o.value
              ? 'bg-[var(--surface-3)] text-[var(--text-1)] shadow-[0_1px_2px_rgba(0,0,0,0.3),0_0_0_1px_var(--hairline),var(--highlight-top)]'
              : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
          }`}
        >
          {o.icon && <span className="-ml-0.5 inline-flex">{o.icon}</span>}
          {o.label}
        </Button>
      ))}
    </div>
  );
}

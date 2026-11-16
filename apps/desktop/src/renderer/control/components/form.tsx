import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Text } from '@lampstand/ui';

/**
 * Shared form controls for editors and inspectors, so every label, colour well, number box,
 * slider and checkbox looks and behaves the same everywhere.
 */

/**
 * A labelled control with an optional hint.
 * - `htmlFor`: the label points at the control's id.
 * - `group`: a caption over a group of buttons (Segmented etc.), which a <label> must not wrap.
 * - neither: the label wraps the control (implicit association).
 */
export function Field({
  label,
  htmlFor,
  group = false,
  hint,
  children,
  className = '',
}: {
  label: ReactNode;
  htmlFor?: string;
  group?: boolean;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  const hintNode = hint && (
    <Text as="p" variant="caption" className="mt-1.5">
      {hint}
    </Text>
  );
  if (htmlFor || group)
    return (
      <div className={className}>
        {htmlFor ? (
          <label className="label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="label">{label}</span>
        )}
        {children}
        {hintNode}
      </div>
    );
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hintNode}
    </label>
  );
}

type InputRest = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>;

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Colour well. The native picker only takes #rrggbb, so other values (rgba, names) show
 * `fallback` until a colour is picked. `swatch` is a small well for inline use.
 */
export function ColorInput({
  value,
  onChange,
  fallback = '#ffffff',
  variant = 'field',
  className = '',
  ...rest
}: InputRest & {
  value: string;
  onChange: (hex: string) => void;
  fallback?: string;
  variant?: 'field' | 'swatch';
}) {
  const hex = HEX.test(value) ? value : HEX.test(value.slice(0, 7)) ? value.slice(0, 7) : fallback;
  return (
    <input
      type="color"
      title={rest['aria-label']}
      value={hex}
      onChange={(e) => onChange(e.target.value)}
      className={`cursor-pointer ${variant === 'swatch' ? 'h-6 w-8 rounded border-0 bg-transparent p-0' : 'field !p-1'} ${className}`}
      {...rest}
    />
  );
}

/**
 * Number box that only reports real numbers. While typing, the box may be empty or half-typed
 * (it keeps its own draft); it shows the stored value again when it loses focus.
 */
export function NumberInput({
  value,
  onChange,
  round = false,
  className = '',
  onBlur,
  ...rest
}: InputRest & {
  value: number;
  onChange: (v: number) => void;
  /** Show whole numbers (canvas pixels). */
  round?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      className={`field ${className}`}
      value={draft ?? (round ? Math.round(value) : value)}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(v)) onChange(v);
      }}
      onBlur={(e) => {
        setDraft(null);
        onBlur?.(e);
      }}
      {...rest}
    />
  );
}

/** A labelled slider with its value shown; reports every move (live preview). */
export function RangeField({
  label,
  value,
  min,
  max,
  step,
  format = (v) => String(v),
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <Text
      as="label"
      size={12}
      tone="secondary"
      className="grid grid-cols-[96px_minmax(0,1fr)_minmax(44px,auto)] items-center gap-2"
    >
      <span>{label}</span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 cursor-pointer accent-[var(--accent)]"
      />
      <span className="tnum text-right text-[var(--text-3)]">{format(value)}</span>
    </Text>
  );
}

/** A checkbox with its label, and an optional line of help under the label. */
export function Checkbox({
  label,
  description,
  checked,
  onChange,
  className = '',
  ...rest
}: Omit<InputRest, 'checked'> & {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const box = (
    <input
      type="checkbox"
      className={description ? 'mt-1' : ''}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      {...rest}
    />
  );
  if (!description)
    return (
      <label className={`flex cursor-pointer items-center gap-1.5 ${className}`}>
        {box}
        {label}
      </label>
    );
  return (
    <label className={`flex cursor-pointer items-start gap-2 ${className}`}>
      {box}
      <span>
        <span className="font-medium">{label}</span>
        <Text size={12} tone="secondary" className="block">
          {description}
        </Text>
      </span>
    </label>
  );
}

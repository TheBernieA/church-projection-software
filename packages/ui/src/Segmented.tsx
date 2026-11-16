export interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}

/** Accessible segmented control (radio group semantics). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-[var(--radius-control)] bg-[var(--surface-1)] p-0.5 shadow-[inset_0_0_0_1px_var(--hairline)]"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-7 cursor-pointer rounded-[5px] px-3 text-[12px] font-medium transition-[background-color,color,box-shadow] duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
            value === o.value
              ? 'bg-[var(--surface-3)] text-[var(--text-1)] shadow-[0_1px_2px_rgba(0,0,0,0.3),0_0_0_1px_var(--hairline),var(--highlight-top)]'
              : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

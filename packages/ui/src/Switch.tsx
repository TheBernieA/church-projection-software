import { Button } from './Button';
/** Accessible on/off switch (role="switch"). Gold when on — gold means interaction, never live state. */
export function Switch({
  checked,
  onChange,
  label,
  id,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="bare"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-40 ${
        checked
          ? 'bg-[var(--accent)]'
          : 'bg-[var(--switch-off)] shadow-[inset_0_0_0_1px_var(--hairline-strong)]'
      }`}
    >
      <span
        aria-hidden
        className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-transform duration-150 ${checked ? 'translate-x-[18px]' : 'translate-x-[2px]'}`}
      />
    </Button>
  );
}

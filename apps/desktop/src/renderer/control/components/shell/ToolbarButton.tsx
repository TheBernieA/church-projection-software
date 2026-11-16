import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { SoonBadge, Text } from '@lampstand/ui';

/**
 * A toolbar item in the operator-console style: icon above a small label. `pressed` marks the
 * active workspace or an engaged toggle; `soon` shows the item as planned (disabled, badged).
 */
export const ToolbarButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    icon: ReactNode;
    label: string;
    pressed?: boolean;
    soon?: boolean;
    /** Extra mark on the icon (a status dot). */
    badge?: ReactNode;
  }
>(function ToolbarButton({ icon, label, pressed, soon, badge, className = '', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={pressed}
      disabled={soon || rest.disabled}
      className={`relative flex h-[46px] min-w-[46px] shrink-0 cursor-pointer flex-col items-center justify-center gap-[3px] rounded-[6px] px-1.5 transition-colors duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-default ${
        pressed
          ? 'bg-[color-mix(in_srgb,var(--text-1)_12%,transparent)] text-[var(--text-1)]'
          : soon
            ? 'text-[var(--text-3)]'
            : 'text-[var(--text-2)] hover:bg-[color-mix(in_srgb,var(--text-1)_7%,transparent)] hover:text-[var(--text-1)]'
      } ${className}`}
      {...rest}
    >
      <span className="relative flex h-[22px] items-center justify-center">
        {icon}
        {badge}
      </span>
      <Text size={11} leading="none" className="whitespace-nowrap">
        {label}
      </Text>
      {soon && (
        <span className="pointer-events-none absolute -right-1 -top-0.5 scale-[0.8]">
          <SoonBadge />
        </span>
      )}
    </button>
  );
});

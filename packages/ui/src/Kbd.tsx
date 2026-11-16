import type { ReactNode } from 'react';
import { typographyClass } from './Typography';

export function Kbd({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: 'default' | 'onColor';
}) {
  const cls =
    tone === 'onColor'
      ? 'bg-black/20 text-white/90'
      : 'bg-[var(--surface-1)] text-[var(--text-3)] shadow-[0_0_0_1px_var(--hairline-strong)]';
  return (
    <kbd
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] px-1.5 font-sans ${typographyClass({ size: 11, weight: 'medium' })} ${cls}`}
    >
      {children}
    </kbd>
  );
}

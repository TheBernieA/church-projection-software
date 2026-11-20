import type { ReactNode } from 'react';
import { Typography } from './Typography';

/** Tally label for monitors: a coloured dot + label. Colour is meaning, never decoration. */
export function TallyLabel({
  tone,
  children,
  active = true,
}: {
  tone: 'program' | 'preview';
  children: ReactNode;
  active?: boolean;
}) {
  const c = tone === 'program' ? 'var(--tally-program)' : 'var(--tally-preview)';
  return (
    <Typography
      size={12}
      weight="semibold"
      className="inline-flex items-center gap-1.5"
      style={{ color: active ? c : 'var(--text-3)' }}
    >
      {/* Static glow, no pulsing: the control UI has no ambient animation (§15.3). */}
      <span
        aria-hidden
        className="inline-flex h-2 w-2 rounded-full"
        style={{
          background: active ? c : 'var(--text-3)',
          boxShadow: active ? `0 0 8px ${c}` : 'none',
        }}
      />
      {children}
    </Typography>
  );
}

/** Small corner tag on a thumbnail: LIVE (red) or PREVIEW (green). */
export function TallyTag({
  tone,
  children,
  className = '',
}: {
  tone: 'program' | 'preview';
  children: ReactNode;
  className?: string;
}) {
  return (
    <Typography
      size={10}
      tone="white"
      weight="bold"
      className={`absolute right-1.5 top-1.5 rounded-[4px] px-1.5 py-px tracking-[0.06em] shadow-[0_2px_8px_rgba(0,0,0,0.35)] ${
        tone === 'program' ? 'bg-[var(--tally-program)]' : 'bg-[var(--tally-preview)]'
      } ${className}`}
    >
      {children}
    </Typography>
  );
}

import { useState, type ReactNode } from 'react';
import { Typography } from '@lampstand/ui';
import { cmd } from '../../lib/api';
import { attempt } from '../../lib/store';

/** Send a stream command; a failure shows as a toast. */
export const run = (type: string, payload: object = {}): void =>
  void attempt(() => cmd(type, payload), 'errors.stream');

/** "1.2 GB" / "340 MB". */
export const formatBytes = (bytes: number): string =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${Math.max(0, Math.round(bytes / 1024 ** 2))} MB`;

export function readPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

/** A yes/no the operator chose in the console, remembered on this computer. */
export function usePref(key: string, fallback: boolean): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => readPref(key, fallback));
  const set = (next: boolean): void => {
    setOn(next);
    try {
      localStorage.setItem(key, next ? '1' : '0');
    } catch {
      /* this session only */
    }
  };
  return [on, set];
}

/** A titled block of the console. */
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-2.5 border-t border-[var(--hairline)] px-4 py-3.5"
    >
      <div className="flex min-h-5 items-center justify-between gap-2">
        <Typography as="h3" variant="overline">
          {title}
        </Typography>
        {action}
      </div>
      {children}
    </section>
  );
}

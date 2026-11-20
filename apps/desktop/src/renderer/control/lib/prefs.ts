import { useState } from 'react';

/**
 * Small choices the operator made, remembered on this computer (localStorage). Storage can be
 * unavailable (a private session): then they last this session only.
 */

/** A remembered text value (null: never set, or storage unavailable). */
export function remembered(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Remember a text value. */
export function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* this session only */
  }
}

/** A yes/no the operator chose (a panel open or folded…), remembered on this computer. */
export function usePref(key: string, fallback: boolean): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    const v = remembered(key);
    return v === null ? fallback : v === '1';
  });
  const set = (next: boolean): void => {
    setOn(next);
    remember(key, next ? '1' : '0');
  };
  return [on, set];
}

import { useSyncExternalStore } from 'react';

/** A question waiting for the operator's answer (shown by ConfirmHost). */
export interface Ask {
  message: string;
  /** The button that says yes ("Delete", "Go live"…); OK by default. */
  confirm?: string;
  /** What yes does: removes something (red), puts something on air (live), or neither. */
  tone?: 'danger' | 'live';
}

let current: (Ask & { answer: (ok: boolean) => void }) | null = null;
const listeners = new Set<() => void>();
const changed = (): void => listeners.forEach((l) => l());

/**
 * Ask before doing something that can't be taken back, in the app's own dialog (never the
 * system's pop-up, which freezes the window and ignores the theme). Resolves true for yes.
 * Asking again while a question is open answers the open one "no".
 */
export function ask(question: Ask | string): Promise<boolean> {
  current?.answer(false);
  const q = typeof question === 'string' ? { message: question } : question;
  return new Promise((resolve) => {
    const entry = {
      ...q,
      answer: (ok: boolean) => {
        if (current === entry) {
          current = null;
          changed();
        }
        resolve(ok);
      },
    };
    current = entry;
    changed();
  });
}

export function useAsk(): typeof current {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

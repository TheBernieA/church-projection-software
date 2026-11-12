/**
 * Typed result values. Errors carry a stable `code` (used as an i18n key suffix)
 * and never include stack traces or file-system paths, so they are safe to send to renderers.
 */
export type Result<T, E = AppErrorShape> = { ok: true; value: T } | { ok: false; error: E };

export interface AppErrorShape {
  code: string;
  message: string;
}

export class AppError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AppError';
  }
  toShape(): AppErrorShape {
    return { code: this.code, message: this.message };
  }
}

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = (code: string, message: string): Result<never> => ({
  ok: false,
  error: { code, message },
});

/** Convert anything thrown into a safe error shape (no stack, no paths). */
export function toErrorShape(e: unknown): AppErrorShape {
  if (e instanceof AppError) return e.toShape();
  return { code: 'internal', message: 'Something went wrong. Check the logs for details.' };
}

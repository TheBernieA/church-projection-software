/** Small helpers shared across the main process. */

/** A safe, loggable message for anything thrown (never the whole object, which may hold data). */
export function errorMessage(e: unknown, fallback = 'unknown'): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

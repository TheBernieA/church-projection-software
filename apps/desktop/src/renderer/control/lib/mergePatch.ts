const isPlain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Two changes as one, the later winning, nested sections merged (an EQ change to band 2 then
 * band 3 keeps both).
 */
export function mergePatch<T extends Record<string, unknown>>(a: T, b: T): T {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k];
    out[k] = isPlain(prev) && isPlain(v) ? mergePatch(prev, v) : v;
  }
  return out as T;
}

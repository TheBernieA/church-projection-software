/**
 * Pure migration runner. Each step migrates `vN → vN+1`. Run on read; persisted on next write (§6.2).
 */
export type Migration = (input: Record<string, unknown>) => Record<string, unknown>;

export function migrate(
  input: unknown,
  currentVersion: number,
  steps: Record<number, Migration>,
): { value: unknown; migrated: boolean } {
  if (typeof input !== 'object' || input === null) return { value: input, migrated: false };
  let obj = input as Record<string, unknown>;
  let v = typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 1;
  let migrated = false;
  while (v < currentVersion) {
    const step = steps[v];
    if (!step) throw new Error(`Missing migration from v${v}`);
    obj = { ...step(obj), schemaVersion: v + 1 };
    v += 1;
    migrated = true;
  }
  return { value: obj, migrated };
}

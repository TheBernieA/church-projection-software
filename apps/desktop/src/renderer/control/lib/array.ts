/** Return a copy of `arr` with the element at `from` moved to `to`. Out-of-range is a no-op copy. */
export function moveItem<T>(arr: readonly T[], from: number, to: number): T[] {
  const copy = [...arr];
  if (from < 0 || from >= copy.length || to < 0 || to >= copy.length) return copy;
  const [x] = copy.splice(from, 1);
  if (x !== undefined) copy.splice(to, 0, x);
  return copy;
}

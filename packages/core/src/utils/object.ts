/** A shallow copy of `obj` without `keys` (the original is left untouched). */
export function omit<T extends object, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
  const drop = new Set<PropertyKey>(keys);
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !drop.has(k))) as Omit<T, K>;
}

/** What a subscribe call returns: call it to stop listening. */
export type Unsubscribe = () => void;

import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * Resolve `rel` inside `root`, rejecting traversal and symlink escapes (§17.3).
 * Returns null if the result would fall outside `root` or does not exist.
 */
export async function resolveInside(root: string, rel: string): Promise<string | null> {
  if (!rel || rel.includes('\0') || isAbsolute(rel)) return null;
  const candidate = resolve(root, rel);
  if (!isWithin(resolve(root), candidate)) return null;
  try {
    const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
    return isWithin(realRoot, realCandidate) ? realCandidate : null;
  } catch {
    return null;
  }
}

export function isWithin(root: string, target: string): boolean {
  const r = relative(root, target);
  return r === '' || (!r.startsWith('..') && !isAbsolute(r) && !r.split(sep).includes('..'));
}

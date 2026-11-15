import type { DisplayAssignment, OutputRole } from '@lampstand/core';
import { type DisplayLike } from '../types';

/** Fingerprint = name + resolution + position (§7.3). Survives reconnects; ids may not. */
export function fingerprint(d: DisplayLike): string {
  return `${d.label || 'display'}|${d.size.width}x${d.size.height}|${d.bounds.x},${d.bounds.y}`;
}

/** Looser match used when the exact fingerprint changed (e.g. display re-arranged). */
function nameAndSize(fp: string): string {
  return fp.split('|').slice(0, 2).join('|');
}

/**
 * Resolve roles for the currently connected displays from saved assignments. The control
 * display never gets an output role unless the operator explicitly assigned it.
 */
export function resolveRoles(
  displays: DisplayLike[],
  saved: DisplayAssignment[],
): Map<number, OutputRole> {
  const roles = new Map<number, OutputRole>();
  const used = new Set<DisplayAssignment>();
  for (const d of displays) {
    const fp = fingerprint(d);
    const exact = saved.find((s) => s.fingerprint === fp && !used.has(s));
    const loose =
      exact ?? saved.find((s) => !used.has(s) && nameAndSize(s.fingerprint) === nameAndSize(fp));
    if (loose) {
      used.add(loose);
      roles.set(d.id, loose.role);
    } else roles.set(d.id, 'none');
  }
  return roles;
}

export function upsertAssignment(
  saved: DisplayAssignment[],
  d: DisplayLike,
  role: OutputRole,
): DisplayAssignment[] {
  const fp = fingerprint(d);
  const rest = saved.filter((s) => s.fingerprint !== fp);
  // Only one display may be the main output at a time.
  const cleaned =
    role === 'main'
      ? rest.map((s) => (s.role === 'main' ? { ...s, role: 'none' as const } : s))
      : rest;
  return [...cleaned, { fingerprint: fp, label: d.label || 'Display', role }];
}

import { createHash } from 'node:crypto';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

/** Hex SHA-256 of some bytes. Used for package checksums and per-file manifest checks. */
export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Parse JSON from bytes; returns null for anything malformed (callers Zod-validate next). */
export function parseJsonBytes(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/**
 * Write a package into a staging folder, then swap it into `<root>/<id>` with one rename, so a
 * crash or a failed write never leaves a half-installed package. Shared by Bible and hymnal installs.
 */
export async function installIntoPlace(
  root: string,
  id: string,
  write: (dir: string) => Promise<void>,
): Promise<void> {
  const staging = join(root, `.staging-${id}-${Date.now()}`);
  const target = join(root, id);
  await mkdir(staging, { recursive: true });
  try {
    await write(staging);
    await rm(target, { recursive: true, force: true });
    await rename(staging, target);
  } catch (e) {
    await rm(staging, { recursive: true, force: true });
    throw e;
  }
}

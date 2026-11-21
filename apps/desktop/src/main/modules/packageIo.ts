import { createHash } from 'node:crypto';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
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
  const stamp = Date.now();
  const staging = join(root, `.staging-${id}-${stamp}`);
  const old = join(root, `.old-${id}-${stamp}`);
  const target = join(root, id);
  await mkdir(staging, { recursive: true });
  try {
    await write(staging);
  } catch (e) {
    await rm(staging, { recursive: true, force: true });
    throw e;
  }
  // The installed copy steps aside first and is deleted only once the new one is in place, so
  // there's never a moment with neither (a crash leaves the old copy, or the new one).
  let movedOld = false;
  try {
    await rename(target, old);
    movedOld = true;
  } catch {
    /* nothing installed yet */
  }
  try {
    await rename(staging, target);
  } catch (e) {
    if (movedOld) await rename(old, target).catch(() => undefined);
    await rm(staging, { recursive: true, force: true });
    throw e;
  }
  if (movedOld) await rm(old, { recursive: true, force: true });
}

/** Leftovers of an install a crash interrupted (`.staging-…`, `.old-…`), cleared at start-up. */
export async function clearInstallLeftovers(root: string): Promise<void> {
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return;
  }
  await Promise.all(
    names
      .filter((n) => n.startsWith('.staging-') || n.startsWith('.old-'))
      .map((n) => rm(join(root, n), { recursive: true, force: true }).catch(() => undefined)),
  );
}

/** Does it start with a zip's local-file signature ("PK\x03\x04")? */
export function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

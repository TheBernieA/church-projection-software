import { mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { z } from 'zod';

/**
 * Atomic write (§6.2): write `file.tmp`, fsync, rename over the original. A crash never leaves
 * half-written JSON.
 */
export async function writeFileAtomic(file: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  const fh = await open(tmp, 'w');
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, file);
}

export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await writeFileAtomic(file, JSON.stringify(value, null, 2));
}

export type ReadResult<T> =
  | { status: 'ok'; value: T; raw: unknown }
  | { status: 'missing' }
  | { status: 'invalid'; reason: string };

/** Read + Zod-validate a JSON file. Never throws for bad content. */
export async function readJson<T>(
  file: string,
  schema: z.ZodType<T>,
  prepare?: (raw: unknown) => unknown,
): Promise<ReadResult<T>> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'missing' };
    return { status: 'invalid', reason: 'unreadable' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { status: 'invalid', reason: 'not-json' };
  }
  const parsed = schema.safeParse(prepare ? prepare(raw) : raw);
  if (!parsed.success)
    return { status: 'invalid', reason: parsed.error.issues[0]?.message ?? 'schema' };
  return { status: 'ok', value: parsed.data, raw };
}

/** Move an invalid file into `<root>/quarantine/` so it never crashes the app again (§6.2). */
export async function quarantine(file: string, root: string): Promise<string> {
  const dir = join(root, 'quarantine');
  await mkdir(dir, { recursive: true });
  const target = join(dir, `${Date.now()}-${basename(file)}`);
  await rename(file, target);
  return target;
}

/** Entries of a folder, or an empty list if it doesn't exist (yet) or can't be read. */
export async function listDir(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Crash recovery: remove stale `.tmp` files left by an interrupted write. */
export async function cleanupTempFiles(dir: string): Promise<number> {
  let n = 0;
  for (const e of await listDir(dir)) {
    if (e.isFile() && e.name.endsWith('.tmp')) {
      await rm(join(dir, e.name), { force: true });
      n++;
    }
  }
  return n;
}

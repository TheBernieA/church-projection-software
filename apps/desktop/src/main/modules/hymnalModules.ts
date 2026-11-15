import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { AppError, HymnalFileSchema, type HymnalFile } from '@lampstand/core';
import { listDir, writeJsonAtomic } from '../storage/atomic';
import { installIntoPlace, parseJsonBytes, sha256 } from './packageIo';
import { safeUnzip, ZipError } from './zip';
import { MODULE_LIMITS } from '../constants';

/** `manifest.json` inside a `.lshymnal` zip. See docs/module-format.md. */
const HymnalManifestSchema = z.object({
  format: z.literal('lampstand-hymnal-module'),
  formatVersion: z.literal(1),
  file: z.object({
    path: z.literal('hymnal.json'),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    size: z.number().int().nonnegative(),
  }),
});

/**
 * Install a hymnal package (§9.2): a `.lshymnal` zip (manifest + hymnal.json, checksummed) or a
 * plain hymnal `.json`. Same rules as Bibles: size/zip guards, Zod validation, atomic move.
 */
export async function installHymnalModule(bytes: Uint8Array, root: string): Promise<HymnalFile> {
  if (bytes.byteLength > MODULE_LIMITS.maxTotalBytes)
    throw new AppError('module-too-large', 'Hymnal package is too large.');
  let hymnalBytes: Uint8Array;
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip) {
    let entries: Map<string, Uint8Array>;
    try {
      entries = safeUnzip(bytes, MODULE_LIMITS);
    } catch (e) {
      throw new AppError(
        'module-invalid',
        e instanceof ZipError
          ? `Hymnal archive rejected (${e.code}).`
          : 'Hymnal archive is invalid.',
      );
    }
    const manifest = HymnalManifestSchema.safeParse(
      parseJsonBytes(entries.get('manifest.json') ?? new Uint8Array()),
    );
    const file = entries.get('hymnal.json');
    if (!manifest.success || !file)
      throw new AppError('module-invalid', 'Hymnal package manifest is missing or invalid.');
    if (file.byteLength !== manifest.data.file.size || sha256(file) !== manifest.data.file.sha256) {
      throw new AppError('module-tampered', 'Hymnal contents do not match its manifest.');
    }
    hymnalBytes = file;
  } else hymnalBytes = bytes;

  const parsed = HymnalFileSchema.safeParse(parseJsonBytes(hymnalBytes));
  if (!parsed.success)
    throw new AppError('module-invalid', 'This is not a valid Lampstand hymnal.');
  const hymnal = parsed.data;
  await installIntoPlace(root, hymnal.id, (dir) =>
    writeJsonAtomic(join(dir, 'hymnal.json'), hymnal),
  );
  return hymnal;
}

/** Read every valid hymnal from a directory of `<id>/hymnal.json` (installed) or `*.json` (bundled). */
export async function readHymnals(
  dir: string,
  layout: 'installed' | 'bundled',
): Promise<HymnalFile[]> {
  const out: HymnalFile[] = [];
  for (const { name: n } of await listDir(dir)) {
    if (n.startsWith('.')) continue;
    const file =
      layout === 'installed'
        ? join(dir, n, 'hymnal.json')
        : n.endsWith('.json')
          ? join(dir, n)
          : null;
    if (!file) continue;
    try {
      const parsed = HymnalFileSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
      if (parsed.success) out.push(parsed.data);
    } catch {
      /* skip unreadable */
    }
  }
  return out;
}

export async function removeInstalled(root: string, id: string): Promise<void> {
  if (!/^[a-z0-9-]{1,40}$/.test(id)) throw new AppError('invalid', 'Invalid id.');
  await rm(join(root, id), { recursive: true, force: true });
}

import { isZip, parseJsonBytes } from './packageIo';
import { safeUnzip } from './zip';
import { MODULE_LIMITS } from '../constants';

/**
 * What a package file holds, read from its contents rather than its name (a renamed file, or a
 * hymnal saved as .lsbible, still installs as what it is): a Bible, a hymnal, or neither.
 * Only the zip's manifest is inflated to tell.
 */
export async function packageKind(bytes: Uint8Array): Promise<'bible' | 'hymnal' | null> {
  if (!isZip(bytes)) {
    const json = parseJsonBytes(bytes);
    return json &&
      typeof json === 'object' &&
      (json as { format?: unknown }).format === 'lampstand-hymnal'
      ? 'hymnal'
      : null;
  }
  try {
    const entries = await safeUnzip(bytes, {
      ...MODULE_LIMITS,
      include: (name) => name === 'manifest.json',
    });
    const manifest = parseJsonBytes(entries.get('manifest.json') ?? new Uint8Array());
    const format =
      manifest && typeof manifest === 'object' ? (manifest as { format?: unknown }).format : null;
    if (format === 'lampstand-bible') return 'bible';
    if (format === 'lampstand-hymnal-module') return 'hymnal';
    return null;
  } catch {
    return null;
  }
}

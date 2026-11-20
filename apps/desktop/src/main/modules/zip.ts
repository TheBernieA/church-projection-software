import { unzip, type Unzipped } from 'fflate';
import { type ZipLimits } from '../types';

export class ZipError extends Error {
  constructor(
    readonly code:
      'zip-slip' | 'zip-too-large' | 'zip-too-many' | 'zip-ratio' | 'zip-invalid' | 'zip-path',
  ) {
    super(code);
  }
}

/** Reject absolute paths, `..` segments, backslashes and drive letters (zip-slip, §17.3). */
export function isSafeEntryName(name: string): boolean {
  if (!name || name.length > 260) return false;
  if (name.startsWith('/') || name.includes('\\') || name.includes('\0') || /^[A-Za-z]:/.test(name))
    return false;
  return !name.split('/').some((seg) => seg === '..' || seg === '.');
}

/**
 * Unzip with zip-slip and zip-bomb protection. Limits are enforced on the declared sizes BEFORE
 * inflating, then re-checked on the actual output. Inflating happens off the main thread, so a
 * big import never stalls the app (or the stream's picture and sound) while it runs.
 */
export async function safeUnzip(
  data: Uint8Array,
  limits: ZipLimits,
): Promise<Map<string, Uint8Array>> {
  let count = 0;
  let declared = 0;
  // Held in an object because the filter callback assigns it (keeps narrowing honest).
  const state: { failure: ZipError | null } = { failure: null };
  let files: Unzipped;
  try {
    files = await new Promise<Unzipped>((resolve, reject) => {
      unzip(
        data,
        {
          filter: (f) => {
            if (state.failure) return false;
            if (f.name.endsWith('/')) return false; // directories
            if (limits.include && !limits.include(f.name)) return false;
            if (!isSafeEntryName(f.name)) state.failure = new ZipError('zip-slip');
            else if (limits.allowedPath && !limits.allowedPath.test(f.name))
              state.failure = new ZipError('zip-path');
            else if (++count > limits.maxFiles) state.failure = new ZipError('zip-too-many');
            else if (
              f.originalSize > limits.maxFileBytes ||
              (declared += f.originalSize) > limits.maxTotalBytes
            )
              state.failure = new ZipError('zip-too-large');
            else if (f.size > 0 && f.originalSize / f.size > limits.maxRatio)
              state.failure = new ZipError('zip-ratio');
            return !state.failure;
          },
        },
        (err, out) => (err ? reject(err) : resolve(out)),
      );
    });
  } catch {
    throw new ZipError('zip-invalid');
  }
  if (state.failure) throw state.failure;
  let total = 0;
  const out = new Map<string, Uint8Array>();
  for (const [name, bytes] of Object.entries(files)) {
    total += bytes.byteLength;
    if (bytes.byteLength > limits.maxFileBytes || total > limits.maxTotalBytes)
      throw new ZipError('zip-too-large');
    out.set(name, bytes);
  }
  return out;
}

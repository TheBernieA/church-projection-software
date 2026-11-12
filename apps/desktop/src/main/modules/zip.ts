import { unzipSync } from 'fflate';

export interface ZipLimits {
  maxFiles: number;
  maxTotalBytes: number;
  maxFileBytes: number;
  /** Max uncompressed/compressed ratio per entry (zip-bomb guard). */
  maxRatio: number;
  /** Allowed entry path pattern. */
  allowedPath?: RegExp;
}

export const MODULE_LIMITS: ZipLimits = {
  maxFiles: 300,
  maxTotalBytes: 64 * 1024 * 1024,
  maxFileBytes: 8 * 1024 * 1024,
  maxRatio: 200,
  // Linear: segments are separated by a literal '/'; names are capped at 260 chars first.
  // eslint-disable-next-line security/detect-unsafe-regex
  allowedPath: /^[A-Za-z0-9_\-.]+(\/[A-Za-z0-9_\-.]+)*$/,
};

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
 * Unzip in memory with zip-slip and zip-bomb protection. Limits are enforced on the declared
 * sizes BEFORE inflating, then re-checked on the actual output.
 */
export function safeUnzip(data: Uint8Array, limits: ZipLimits): Map<string, Uint8Array> {
  let count = 0;
  let declared = 0;
  // Held in an object because the filter callback assigns it (keeps narrowing honest).
  const state: { failure: ZipError | null } = { failure: null };
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, {
      filter: (f) => {
        if (state.failure) return false;
        if (f.name.endsWith('/')) return false; // directories
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

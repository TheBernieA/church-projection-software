import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where the NDI runtime is, in order: LAMPSTAND_NDI_LIB; the NDI SDK or NDI Tools install
 * (macOS: /Library/NDI SDK for Apple, /usr/local/lib; Windows: the NDI_RUNTIME_DIR_V6/V5
 * folder; Linux: /usr/lib, /usr/local/lib). Lampstand never ships it: people install NDI Tools
 * (free) and Lampstand uses it. Null: NDI is off.
 */
export function findNdiRuntime(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (p: string) => boolean = existsSync,
  list: (dir: string) => string[] = (d) => {
    try {
      return readdirSync(d);
    } catch {
      return [];
    }
  },
): string | null {
  const candidates: string[] = [];
  if (env.LAMPSTAND_NDI_LIB) candidates.push(env.LAMPSTAND_NDI_LIB);
  if (platform === 'darwin') {
    candidates.push(
      '/Library/NDI SDK for Apple/lib/macOS/libndi.dylib',
      '/Library/NDI SDK for Apple/lib/macOS/libndi_advanced.dylib',
    );
    for (const dir of ['/usr/local/lib', '/opt/homebrew/lib', '/Library/NDI/lib'])
      for (const f of list(dir)
        .filter((f) => f.startsWith('libndi') && f.endsWith('.dylib'))
        .sort()
        .reverse())
        candidates.push(join(dir, f));
  } else if (platform === 'win32') {
    for (const v of ['NDI_RUNTIME_DIR_V6', 'NDI_RUNTIME_DIR_V5']) {
      const dir = env[v];
      if (dir) candidates.push(join(dir, 'Processing.NDI.Lib.x64.dll'));
    }
  } else {
    for (const dir of ['/usr/lib', '/usr/local/lib', '/usr/lib/x86_64-linux-gnu'])
      for (const f of list(dir)
        .filter((f) => f.startsWith('libndi.so'))
        .sort()
        .reverse())
        candidates.push(join(dir, f));
  }
  return candidates.find((p) => exists(p)) ?? null;
}

/** NDI's four-character codes. */
export const fourCC = (s: string): number =>
  (s.charCodeAt(0) | (s.charCodeAt(1) << 8) | (s.charCodeAt(2) << 16) | (s.charCodeAt(3) << 24)) >>>
  0;

/** Interleaved stereo float32 (what the feed window sends) as NDI's planar float (FLTp). */
export function toPlanar(interleaved: Float32Array, channels = 2): Float32Array {
  const frames = Math.floor(interleaved.length / channels);
  const out = new Float32Array(frames * channels);
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < channels; c++) out[c * frames + i] = interleaved[i * channels + c] ?? 0;
  return out;
}

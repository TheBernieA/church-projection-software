import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, join } from 'node:path';
import { app } from 'electron';

const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

/**
 * Where ffmpeg is, in order: LAMPSTAND_FFMPEG; the copy shipped with the app
 * (resources/ffmpeg); the `ffmpeg-static` package when installed (development); then a system
 * install (Homebrew, /usr/local, PATH). Null: none, so no streaming or recording.
 */
export function findFfmpeg(): string | null {
  const candidates: string[] = [];
  if (process.env.LAMPSTAND_FFMPEG) candidates.push(process.env.LAMPSTAND_FFMPEG);
  if (app.isPackaged) candidates.push(join(process.resourcesPath, 'resources', 'ffmpeg', exe));
  try {
    const fromPackage = createRequire(__filename)('ffmpeg-static') as unknown;
    if (typeof fromPackage === 'string') candidates.push(fromPackage);
  } catch {
    /* not installed: fine */
  }
  candidates.push(
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
    ...(process.env.PATH ?? '')
      .split(delimiter)
      .filter(Boolean)
      .map((d) => join(d, exe)),
  );
  return candidates.find((p) => existsSync(p)) ?? null;
}

let encoders: Promise<string[]> | null = null;

/** The H.264 encoders this ffmpeg has (asked once). */
export function probeEncoders(ffmpeg: string): Promise<string[]> {
  encoders ??= new Promise((resolve) => {
    execFile(ffmpeg, ['-hide_banner', '-encoders'], { timeout: 10_000 }, (err, stdout) => {
      if (err) return resolve([]);
      resolve(
        stdout
          .split('\n')
          .map((l) => /^\s*V\S*\s+(\S+)/.exec(l)?.[1])
          .filter((n): n is string => !!n && /264/.test(n)),
      );
    });
  });
  return encoders;
}

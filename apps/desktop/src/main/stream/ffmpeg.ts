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
let found: { env: string | undefined; path: string } | null = null;

export function findFfmpeg(): string | null {
  // Found once (until LAMPSTAND_FFMPEG changes); not found is looked for again next time.
  if (found && found.env === process.env.LAMPSTAND_FFMPEG) return found.path;
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
  const path = candidates.find((p) => existsSync(p)) ?? null;
  found = path ? { env: process.env.LAMPSTAND_FFMPEG, path } : null;
  return path;
}

let protocols: Promise<string[]> | null = null;

/** The protocols this ffmpeg can send over (asked once): 'rtmp', 'srt', 'udp'… */
export function probeProtocols(ffmpeg: string): Promise<string[]> {
  protocols ??= new Promise((resolve) => {
    execFile(ffmpeg, ['-hide_banner', '-protocols'], { timeout: 10_000 }, (err, stdout) => {
      if (err) return resolve([]);
      const out = stdout.split(/Output:/i)[1] ?? '';
      resolve(out.split(/\s+/).filter(Boolean));
    });
  });
  return protocols;
}

let encoders: Promise<{ video: string[]; audio: string[] }> | null = null;

/** The encoders this ffmpeg has, video and audio (asked once). */
function probeAll(ffmpeg: string): Promise<{ video: string[]; audio: string[] }> {
  encoders ??= new Promise((resolve) => {
    execFile(ffmpeg, ['-hide_banner', '-encoders'], { timeout: 10_000 }, (err, stdout) => {
      if (err) return resolve({ video: [], audio: [] });
      // Lines like " V....D h264_videotoolbox  …" or " A....D aac  …".
      const rows = stdout.split('\n').map((l) => /^\s*([VA])\S*\s+(\S+)/.exec(l));
      const of = (kind: 'V' | 'A'): string[] =>
        rows.flatMap((m) => (m?.[1] === kind && m[2] ? [m[2]] : []));
      resolve({ video: of('V'), audio: of('A') });
    });
  });
  return encoders;
}

/** The H.264 encoders this ffmpeg has. */
export async function probeEncoders(ffmpeg: string): Promise<string[]> {
  return (await probeAll(ffmpeg)).video.filter((n) => /264/.test(n));
}

/**
 * The AAC encoder to use: Apple's (AudioToolbox, macOS) when this ffmpeg has it, which sounds
 * clearly better at stream bitrates (speech sibilance, music); else ffmpeg's own.
 */
export async function probeAacEncoder(ffmpeg: string): Promise<'aac_at' | 'aac'> {
  return (await probeAll(ffmpeg)).audio.includes('aac_at') ? 'aac_at' : 'aac';
}

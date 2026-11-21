import { execFile, execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, join } from 'node:path';
import { app } from 'electron';
import type { TlsOptions } from './ffmpegArgs';

const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

/** Each ffmpeg's build configuration (asked once per file; empty when it can't be asked). */
const confs = new Map<string, string>();

function buildConf(ffmpeg: string): string {
  let conf = confs.get(ffmpeg);
  if (conf === undefined) {
    try {
      conf = execFileSync(ffmpeg, ['-hide_banner', '-buildconf'], {
        encoding: 'utf8',
        timeout: 5_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      conf = '';
    }
    confs.set(ffmpeg, conf);
  }
  return conf;
}

/**
 * Can this ffmpeg stream over a secure connection (RTMPS: YouTube's and Facebook's usual
 * address)? On a Mac, an ffmpeg built without OpenSSL, GnuTLS, mbedTLS or libtls falls back on
 * Apple's old SecureTransport, whose uploads stall after a few frames: the stream never gets
 * going. Elsewhere the built-in TLS (Windows' Schannel) streams fine.
 */
export function hasGoodTls(ffmpeg: string): boolean {
  if (process.platform !== 'darwin') return true;
  return /--enable-(openssl|gnutls|mbedtls|libtls)\b/.test(buildConf(ffmpeg));
}

/** The Mac's trusted root certificates, written out for ffmpeg (once per run). */
let roots: string | null | undefined;

function macRoots(): string | null {
  if (roots !== undefined) return roots;
  roots = null;
  try {
    const pem = execFileSync(
      '/usr/bin/security',
      ['find-certificate', '-a', '-p', '/System/Library/Keychains/SystemRootCertificates.keychain'],
      { encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 << 20 },
    );
    if (pem.includes('BEGIN CERTIFICATE')) {
      const file = join(app.getPath('userData'), 'stream-roots.pem');
      writeFileSync(file, pem);
      roots = file;
    }
  } catch {
    /* can't read them: stream without checking (see tlsOptionsFor) */
  }
  return roots;
}

/**
 * How this ffmpeg checks a secure server's certificate. Lampstand's Mac build uses mbedTLS,
 * which has no trust store of its own: it's given the Mac's trusted roots (kept current by
 * macOS updates). If those can't be read, it streams without checking, as ffmpeg used to by
 * default, rather than not at all. Other builds use their TLS library's own trust store.
 */
export function tlsOptionsFor(ffmpeg: string): TlsOptions | undefined {
  if (process.platform !== 'darwin' || !/--enable-mbedtls\b/.test(buildConf(ffmpeg)))
    return undefined;
  const caFile = macRoots();
  return caFile ? { caFile } : { verify: false };
}

/**
 * Where ffmpeg is: LAMPSTAND_FFMPEG if set; else, of the copy shipped with the app
 * (resources/ffmpeg), a system install (Homebrew, /usr/local, PATH) and the `ffmpeg-static`
 * package (development), the first that can stream securely (see hasGoodTls), else the first
 * there is. Null: none, so no streaming or recording.
 */
let found: { env: string | undefined; path: string } | null = null;

export function findFfmpeg(): string | null {
  // Found once (until LAMPSTAND_FFMPEG changes); not found is looked for again next time.
  if (found && found.env === process.env.LAMPSTAND_FFMPEG) return found.path;
  const own = process.env.LAMPSTAND_FFMPEG;
  const candidates: string[] = [];
  if (app.isPackaged) candidates.push(join(process.resourcesPath, 'resources', 'ffmpeg', exe));
  candidates.push(
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
    ...(process.env.PATH ?? '')
      .split(delimiter)
      .filter(Boolean)
      .map((d) => join(d, exe)),
  );
  try {
    const fromPackage = createRequire(__filename)('ffmpeg-static') as unknown;
    if (typeof fromPackage === 'string') candidates.push(fromPackage);
  } catch {
    /* not installed: fine */
  }
  const existing = [...new Set(candidates)].filter((p) => existsSync(p));
  const path =
    own && existsSync(own) ? own : (existing.find((p) => hasGoodTls(p)) ?? existing[0] ?? null);
  found = path ? { env: own, path } : null;
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

import { execFile, execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, join } from 'node:path';
import { STREAM_ENCODERS } from '@lampstand/core';
import { app } from 'electron';
import { caFileLoads, usableRoots } from './certificates';
import { colourFilter, videoCodecArgs, type Encoder, type TlsOptions } from './ffmpegArgs';

const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

/**
 * Each ffmpeg's build configuration, asked once per file. Empty when it can't be asked; that
 * isn't kept, so a computer too busy to answer in time (at start-up, say) is asked again later
 * rather than taken for an ffmpeg that can't stream securely for the whole session.
 */
const confs = new Map<string, string>();

function buildConf(ffmpeg: string): string {
  const known = confs.get(ffmpeg);
  if (known !== undefined) return known;
  try {
    const conf = execFileSync(ffmpeg, ['-hide_banner', '-buildconf'], {
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    confs.set(ffmpeg, conf);
    return conf;
  } catch {
    return '';
  }
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

/**
 * The Mac's trusted root certificates (Apple's, plus any an administrator added), as a file
 * mbedTLS can read; null if there are none to be had.
 */
function macRoots(): string | null {
  const keychains = [
    '/System/Library/Keychains/SystemRootCertificates.keychain',
    '/Library/Keychains/System.keychain',
  ];
  let pem = '';
  for (const keychain of keychains) {
    try {
      pem += execFileSync('/usr/bin/security', ['find-certificate', '-a', '-p', keychain], {
        encoding: 'utf8',
        timeout: 10_000,
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 8 << 20,
      });
    } catch {
      /* that keychain can't be read: the other may still do */
    }
  }
  const certs = usableRoots(pem);
  if (certs.length === 0) return null;
  try {
    const file = join(app.getPath('userData'), 'stream-roots.pem');
    writeFileSync(file, `${certs.join('\n')}\n`);
    return file;
  } catch {
    return null;
  }
}

/** Per ffmpeg: how it checks certificates, once settled (an unsettled answer is asked again). */
const tlsSettled = new Map<string, TlsOptions | undefined>();

/**
 * How this ffmpeg checks a secure server's certificate. Lampstand's Mac build uses mbedTLS,
 * which has no trust store of its own: it's given the Mac's trusted roots (kept current by
 * macOS updates), once ffmpeg is found to accept them. Failing that, it streams without
 * checking, as ffmpeg used to by default, rather than not at all. Other builds use their TLS
 * library's own trust store.
 */
export async function tlsOptionsFor(ffmpeg: string): Promise<TlsOptions | undefined> {
  if (process.platform !== 'darwin') return undefined;
  if (tlsSettled.has(ffmpeg)) return tlsSettled.get(ffmpeg);
  const conf = buildConf(ffmpeg);
  if (!conf) return { verify: false }; // can't tell what it is just now: never refuse to stream
  if (!/--enable-mbedtls\b/.test(conf)) {
    tlsSettled.set(ffmpeg, undefined);
    return undefined;
  }
  const caFile = macRoots();
  const options: TlsOptions =
    caFile && (await caFileLoads(ffmpeg, caFile)) ? { caFile } : { verify: false };
  tlsSettled.set(ffmpeg, options);
  return options;
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

/**
 * Does this hardware encoder work on this computer? ffmpeg lists every encoder it was built
 * with: the Windows build has NVENC, Quick Sync, AMF and Media Foundation whatever the graphics
 * card, and each fails to open without its hardware. So a few frames are encoded, with the
 * settings a stream uses. Only a definite failure counts: too slow to answer (a busy computer)
 * leaves it in, and a stream that then fails at start drops it (see streamController).
 */
function encoderWorks(ffmpeg: string, encoder: Encoder): Promise<boolean> {
  const args = [
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=640x360:r=30',
    '-frames:v',
    '10',
    '-vf',
    colourFilter(encoder),
    ...videoCodecArgs({ encoder, fps: 30, videoKbps: 1000 }),
    '-f',
    'null',
    '-',
  ];
  return new Promise((resolve) => {
    execFile(ffmpeg, args, { timeout: 15_000, windowsHide: true }, (err) => {
      resolve(!err || (err as { killed?: boolean }).killed === true);
    });
  });
}

let working: { ffmpeg: string; list: Promise<string[]> } | null = null;

/** The H.264 encoders this ffmpeg has that work on this computer (tried once, side by side). */
export function probeEncoders(ffmpeg: string): Promise<string[]> {
  if (working?.ffmpeg !== ffmpeg) {
    const list = probeAll(ffmpeg).then(async ({ video }) => {
      const known = video.filter((n): n is Encoder =>
        (STREAM_ENCODERS as readonly string[]).includes(n),
      );
      const ok = await Promise.all(
        known.map((e) => (e === 'libx264' ? Promise.resolve(true) : encoderWorks(ffmpeg, e))),
      );
      return known.filter((_, i) => ok[i]);
    });
    working = { ffmpeg, list };
  }
  return working.list;
}

/**
 * The AAC encoder to use: Apple's (AudioToolbox, macOS) when this ffmpeg has it, which sounds
 * clearly better at stream bitrates (speech sibilance, music); else ffmpeg's own.
 */
export async function probeAacEncoder(ffmpeg: string): Promise<'aac_at' | 'aac'> {
  return (await probeAll(ffmpeg)).audio.includes('aac_at') ? 'aac_at' : 'aac';
}

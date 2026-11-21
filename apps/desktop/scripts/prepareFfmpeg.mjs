// Puts ffmpeg (livestream and recording) where electron-builder packages it from:
// resources/ffmpeg/<os>-<arch>/ (see electron-builder.yml and resources/ffmpeg/README.md).
//
//   node scripts/prepareFfmpeg.mjs <mac|win> [arm64|x64]     (arch defaults to this computer's)
//
// Mac: Lampstand's own ffmpeg build (scripts/buildFfmpegMac.sh: secure streaming through
// mbedTLS, GPU encoding), built here the first time (a few minutes) and kept for later builds.
// Windows: a pinned release of Gyan's Windows build (the one ffmpeg.org links to), downloaded
// once, checked against its SHA-256 and kept; on any computer, so the Windows installer made on
// a Mac gets it too. If either can't be had: the ffmpeg-static package (an older ffmpeg), which
// `pnpm install` downloads for this computer; for another platform, an ffmpeg already placed in
// the folder by hand, or none, with a warning (the app works, but can't stream or record).
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [os, arch = process.arch] = process.argv.slice(2);
if (os !== 'mac' && os !== 'win') {
  console.error('usage: node scripts/prepareFfmpeg.mjs <mac|win> [arm64|x64]');
  process.exit(1);
}
const exe = os === 'win' ? 'ffmpeg.exe' : 'ffmpeg';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const dest = join(root, 'resources', 'ffmpeg', `${os}-${arch}`);
const target = join(dest, exe);
const here = { darwin: 'mac', win32: 'win' }[process.platform];

/**
 * Can this (Mac) ffmpeg stream securely? Built without OpenSSL, GnuTLS, mbedTLS or libtls, it
 * falls back on Apple's SecureTransport, whose RTMPS uploads stall: YouTube then has to use its
 * standard RTMP address (the app does that by itself) and Facebook, secure only, won't work.
 */
function secureOnMac(ffmpeg) {
  if (os !== 'mac' || here !== 'mac') return true; // can't run it here to ask
  try {
    const conf = execFileSync(ffmpeg, ['-hide_banner', '-buildconf'], { encoding: 'utf8' });
    return /--enable-(openssl|gnutls|mbedtls|libtls)\b/.test(conf);
  } catch {
    // Can't run it (the Intel build on an Apple-silicon Mac without Rosetta): Lampstand's own
    // build says how it was made in SOURCES.txt.
    const sources = join(dirname(ffmpeg), 'SOURCES.txt');
    return existsSync(sources) && readFileSync(sources, 'utf8').includes('--enable-mbedtls');
  }
}

const WEAK_TLS = `\n⚠ ffmpeg: this Mac build can't stream securely (no OpenSSL or mbedTLS). YouTube
  will use its standard RTMP address and Facebook (secure only) won't work. To fix it, install
  what Lampstand's own build needs (xcode-select --install; brew install nasm pkgconf) and build
  again: bash apps/desktop/scripts/buildFfmpegMac.sh ${arch}\n`;

/** The Windows ffmpeg: Gyan's "essentials" build of this release (GPL v3), pinned. */
const WIN = {
  version: '9.0.2',
  url: 'https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip',
  sha256: '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba',
  folder: 'ffmpeg-9.0.2-essentials_build',
};
const winMarker = `ffmpeg ${WIN.version} for Windows (Gyan essentials build)`;

const sha256Of = (file) =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (d) => hash.update(d))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });

/** Download (once), check and unpack the pinned Windows ffmpeg; false if it can't be had. */
async function fetchWindowsFfmpeg() {
  const cache = join(root, 'resources', 'ffmpeg', '.build', 'src');
  const zip = join(cache, `${WIN.folder}.zip`);
  try {
    mkdirSync(cache, { recursive: true });
    if (!existsSync(zip) || (await sha256Of(zip)) !== WIN.sha256) {
      console.log(`ffmpeg: downloading ffmpeg ${WIN.version} for Windows (about 110 MB, once)…`);
      const res = await fetch(WIN.url);
      if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
      await writeFile(`${zip}.part`, Buffer.from(await res.arrayBuffer()));
      renameSync(`${zip}.part`, zip);
      if ((await sha256Of(zip)) !== WIN.sha256) {
        rmSync(zip, { force: true });
        throw new Error('checksum mismatch (the download was deleted)');
      }
    }
    // tar unpacks zip files on Windows 10+ and macOS alike.
    const unpack = join(cache, 'win-unpack');
    rmSync(unpack, { recursive: true, force: true });
    mkdirSync(unpack, { recursive: true });
    execFileSync('tar', [
      '-xf',
      zip,
      '-C',
      unpack,
      `${WIN.folder}/bin/ffmpeg.exe`,
      `${WIN.folder}/LICENSE`,
    ]);
    mkdirSync(dest, { recursive: true });
    copyFileSync(join(unpack, WIN.folder, 'bin', 'ffmpeg.exe'), target);
    copyFileSync(join(unpack, WIN.folder, 'LICENSE'), join(dest, 'LICENSE.txt'));
    writeFileSync(
      join(dest, 'SOURCES.txt'),
      `${winMarker}, licensed under the GNU GPL version 3 (see LICENSE.txt).\n\n` +
        `Binary: ${WIN.url}\n  sha256 ${WIN.sha256}\n` +
        `Source: https://ffmpeg.org/releases/ffmpeg-${WIN.version}.tar.xz, built by\n` +
        `  https://www.gyan.dev/ffmpeg/builds/ (its build configuration: ffmpeg -buildconf)\n`,
    );
    rmSync(unpack, { recursive: true, force: true });
    return true;
  } catch (err) {
    console.warn(`\n⚠ ffmpeg: couldn't get ffmpeg ${WIN.version} for Windows: ${err.message}`);
    return false;
  }
}

if (os === 'win' && arch === 'x64') {
  const sources = join(dest, 'SOURCES.txt');
  if (
    existsSync(target) &&
    existsSync(sources) &&
    readFileSync(sources, 'utf8').includes(winMarker)
  ) {
    console.log(`ffmpeg: using ffmpeg ${WIN.version} in resources/ffmpeg/win-x64/`);
    process.exit(0);
  }
  if (await fetchWindowsFfmpeg()) {
    console.log(`ffmpeg: ffmpeg ${WIN.version} → resources/ffmpeg/win-x64/`);
    process.exit(0);
  }
  console.warn('  Falling back on what else there is (an older ffmpeg).\n');
}

// An ffmpeg that streams securely (Lampstand's own build, from an earlier run or placed here by
// hand) is kept, not overwritten.
if (existsSync(target) && os === 'mac' && secureOnMac(target)) {
  console.log(`ffmpeg: using the one in resources/ffmpeg/${os}-${arch}/ (streams securely)`);
  process.exit(0);
}

// Mac, on a Mac: make Lampstand's own build (either Mac kind builds both).
if (os === 'mac' && here === 'mac') {
  console.log(`ffmpeg: building Lampstand's own for mac-${arch} (first time only, a few minutes)…`);
  const script = join(dirname(fileURLToPath(import.meta.url)), 'buildFfmpegMac.sh');
  const built = spawnSync('bash', [script, arch], { stdio: 'inherit' });
  if (built.status === 0 && existsSync(target) && secureOnMac(target)) process.exit(0);
  console.warn(
    "\n⚠ ffmpeg: Lampstand's own build failed (see above); falling back on ffmpeg-static.",
  );
}

if (here === os && arch === process.arch) {
  const require = createRequire(import.meta.url);
  let source = null;
  try {
    source = require('ffmpeg-static');
  } catch {
    /* not installed */
  }
  if (source && existsSync(source)) {
    mkdirSync(dest, { recursive: true });
    copyFileSync(source, target);
    if (os !== 'win') chmodSync(target, 0o755);
    const licence = join(dirname(source), `${exe.replace('.exe', '')}.LICENSE`);
    if (existsSync(licence)) copyFileSync(licence, join(dest, 'LICENSE.txt'));
    console.log(`ffmpeg: packaged from ffmpeg-static → resources/ffmpeg/${os}-${arch}/`);
    if (!secureOnMac(target)) console.warn(WEAK_TLS);
    process.exit(0);
  }
  // Building for this very computer, ffmpeg should always be there: stop, rather than make an
  // installer that can't stream or record. (A copy placed in the folder by hand still counts.)
  if (!existsSync(target)) {
    console.error(
      '\n✖ ffmpeg: the ffmpeg-static download is missing, so this installer could not stream or\n' +
        '  record. Run `pnpm install` again (it downloads ffmpeg), then build again.\n',
    );
    process.exit(1);
  }
}

if (existsSync(target)) {
  console.log(`ffmpeg: using the one already in resources/ffmpeg/${os}-${arch}/`);
} else {
  console.warn(
    `\n⚠ ffmpeg: none for ${os}-${arch}. This installer won't be able to livestream or record.\n` +
      `  Put ${exe} (and its LICENSE.txt) in resources/ffmpeg/${os}-${arch}/, or build on a\n` +
      `  ${os === 'win' ? 'Windows PC' : arch === 'x64' ? 'Intel Mac' : 'Apple-silicon Mac'}, where it's added automatically.\n`,
  );
}

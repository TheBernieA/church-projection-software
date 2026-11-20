// Puts ffmpeg (livestream and recording) where electron-builder packages it from:
// resources/ffmpeg/<os>-<arch>/ (see electron-builder.yml and resources/ffmpeg/README.md).
//
//   node scripts/prepareFfmpeg.mjs <mac|win> [arm64|x64]     (arch defaults to this computer's)
//
// The copy comes from the ffmpeg-static package, which `pnpm install` downloads for this
// computer. A build for another platform (the Windows installer made on a Mac, say) can't use
// it: then an ffmpeg already placed in the folder by hand is used, or the build goes ahead
// without one, with a warning (the app works, but can't stream or record).
import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
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

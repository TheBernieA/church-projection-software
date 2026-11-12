import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { listDir, writeFileAtomic } from '../storage/atomic';
import { safeUnzip } from '../modules/zip';

const DATA_DIRS = ['songs', 'services', 'themes', join('media', '.meta')];
const KEEP_BACKUPS = 14;

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await listDir(dir)) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.isFile() && !e.name.endsWith('.tmp')) out.push(p);
  }
  return out;
}

/**
 * Stream a zip of the library to `target` without holding media in memory. JSON is deflated;
 * media is stored (already compressed). Set `includeMedia` for full exports.
 */
export async function zipLibrary(
  library: string,
  target: string,
  includeMedia: boolean,
): Promise<void> {
  const files: string[] = [];
  for (const d of DATA_DIRS) files.push(...(await walk(join(library, d))));
  files.push(join(library, 'library.manifest.json'));
  if (includeMedia) {
    for (const f of await walk(join(library, 'media')))
      if (!f.includes(`${sep}.meta${sep}`) && !f.includes(`${sep}.thumbs${sep}`)) files.push(f);
    files.push(...(await walk(join(library, 'backgrounds'))));
  }
  await mkdir(join(target, '..'), { recursive: true });
  const tmp = `${target}.tmp`;
  const out = createWriteStream(tmp);
  await new Promise<void>((resolve, reject) => {
    const zip = new Zip((err, chunk, final) => {
      if (err) return reject(err);
      out.write(chunk);
      if (final) out.end(resolve);
    });
    void (async () => {
      try {
        for (const f of files) {
          let s;
          try {
            s = await stat(f);
          } catch {
            continue;
          }
          if (!s.isFile()) continue;
          const name = relative(library, f).split(sep).join('/');
          const isJson = name.endsWith('.json');
          const entry = isJson ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
          zip.add(entry);
          if (isJson) entry.push(new Uint8Array(await readFile(f)), true);
          else {
            for await (const chunk of createReadStream(f))
              entry.push(new Uint8Array(chunk as Buffer), false);
            entry.push(new Uint8Array(0), true);
          }
        }
        zip.end();
      } catch (e) {
        reject(e instanceof Error ? e : new Error('zip failed'));
      }
    })();
  });
  await rename(tmp, target);
}

/** Daily automatic snapshot of library data; keeps the last 14 (§6.2). */
export async function dailyBackup(
  library: string,
  backupsDir: string,
  force = false,
): Promise<boolean> {
  await mkdir(backupsDir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const target = join(backupsDir, `library-${day}.zip`);
  if (!force) {
    try {
      await stat(target);
      return false;
    } catch {
      /* not yet backed up today */
    }
  }
  await zipLibrary(library, target, false);
  const all = (await listDir(backupsDir))
    .map((e) => e.name)
    .filter((f) => /^library-\d{4}-\d{2}-\d{2}\.zip$/.test(f))
    .sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS)))
    await rm(join(backupsDir, old), { force: true });
  return true;
}

const IMPORT_PATH =
  /^(songs\/[A-Za-z0-9-]+\.song\.json|services\/[A-Za-z0-9-]+\.service\.json|themes\/[A-Za-z0-9-]+\.theme\.json|media\/\.meta\/[A-Za-z0-9-]+\.media\.json|media\/[A-Za-z0-9-]+\.[a-z0-9]{2,5}|backgrounds\/[A-Za-z0-9._-]+|library\.manifest\.json)$/;

/**
 * Import a library export. Only known entry paths are accepted; everything goes through the
 * zip-slip/bomb guard. Files are written atomically; repositories reload afterwards and
 * validate every JSON (invalid ones are quarantined).
 */
export async function importLibraryZip(zipFile: string, library: string): Promise<number> {
  const data = new Uint8Array(await readFile(zipFile));
  const entries = safeUnzip(data, {
    maxFiles: 50000,
    maxTotalBytes: 1024 * 1024 * 1024,
    maxFileBytes: 900 * 1024 * 1024,
    maxRatio: 400,
    allowedPath: IMPORT_PATH,
  });
  let n = 0;
  for (const [name, bytes] of entries) {
    if (name === 'library.manifest.json') continue;
    await writeFileAtomic(join(library, ...name.split('/')), bytes);
    n++;
  }
  return n;
}

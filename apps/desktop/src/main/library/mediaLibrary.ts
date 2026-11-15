import { nativeImage } from 'electron';
import { copyFile, mkdir, mkdtemp, open, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { MEDIA_SCHEMA_VERSION, newId, nowIso, type MediaItem } from '@lampstand/core';
import type { Logger } from '../app/logger';
import type { JsonFileRepository } from '../storage/jsonFileRepository';
import { sniffMedia } from './sniff';

const MAX_IMAGE = 200 * 1024 * 1024;
const MAX_VIDEO = 16 * 1024 * 1024 * 1024;

/** Imports user media into the library (copy, never reference in place) with thumbnails (§12). */
export class MediaLibrary {
  constructor(
    private readonly dir: string,
    private readonly repo: JsonFileRepository<MediaItem>,
    private readonly log: Logger,
  ) {}

  thumbsDir(): string {
    return join(this.dir, '.thumbs');
  }

  async importFiles(
    paths: string[],
    asBackground: boolean,
  ): Promise<{ imported: number; rejected: number }> {
    await mkdir(this.thumbsDir(), { recursive: true });
    let imported = 0;
    let rejected = 0;
    for (const p of paths) {
      try {
        const item = await this.importOne(p, asBackground);
        if (item) imported++;
        else rejected++;
      } catch (e) {
        rejected++;
        this.log.warn('media import failed', { err: e instanceof Error ? e.message : 'unknown' });
      }
    }
    return { imported, rejected };
  }

  /**
   * Store generated image bytes (e.g. a rendered PDF page) as a library picture, through the
   * same checks as a file import (type sniffing, size limits, thumbnail).
   */
  async importBytes(name: string, data: Uint8Array): Promise<MediaItem | null> {
    const safe =
      name
        .replace(/[^\w .()-]+/g, '')
        .slice(0, 120)
        .trim() || 'Image';
    const dir = await mkdtemp(join(tmpdir(), 'lampstand-import-'));
    const path = join(dir, `${safe}.png`);
    try {
      await mkdir(this.thumbsDir(), { recursive: true });
      await writeFile(path, data);
      return await this.importOne(path, false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async importOne(path: string, asBackground: boolean): Promise<MediaItem | null> {
    const st = await stat(path);
    if (!st.isFile()) return null;
    const fh = await open(path, 'r');
    const head = new Uint8Array(32);
    try {
      await fh.read(head, 0, 32, 0);
    } finally {
      await fh.close();
    }
    const sniffed = sniffMedia(head);
    if (!sniffed) return null;
    if (st.size > (sniffed.kind === 'image' ? MAX_IMAGE : MAX_VIDEO)) return null;
    const id = newId();
    const fileName = `${id}.${sniffed.ext}`;
    await copyFile(path, join(this.dir, fileName));
    let hasThumbnail = false;
    let width: number | undefined;
    let height: number | undefined;
    try {
      // OS thumbnailer handles images and (on macOS/Windows) video frames.
      const thumb = await nativeImage.createThumbnailFromPath(join(this.dir, fileName), {
        width: 384,
        height: 216,
      });
      if (!thumb.isEmpty()) {
        await writeFile(join(this.thumbsDir(), `${id}.png`), thumb.toPNG());
        hasThumbnail = true;
      }
      if (sniffed.kind === 'image') {
        const img = nativeImage.createFromPath(join(this.dir, fileName));
        if (!img.isEmpty()) ({ width, height } = img.getSize());
      }
    } catch {
      /* thumbnails are best-effort */
    }
    const now = nowIso();
    const name = basename(path, extname(path)).slice(0, 200) || 'Untitled';
    const item: MediaItem = {
      id,
      schemaVersion: MEDIA_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
      name,
      kind: sniffed.kind,
      fileName,
      mimeType: sniffed.mime,
      sizeBytes: st.size,
      hasThumbnail,
      isBackground: asBackground,
      tags: [],
    };
    if (width) item.width = width;
    if (height) item.height = height;
    return this.repo.upsert(item);
  }

  async remove(item: MediaItem): Promise<void> {
    await this.repo.remove(item.id);
    await rm(join(this.dir, item.fileName), { force: true });
    await rm(join(this.thumbsDir(), `${item.id}.png`), { force: true });
  }
}

import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { app, dialog, type BrowserWindow } from 'electron';
import { AppError, STARTER_THEMES, type AuditEntry } from '@lampstand/core';
import type { ModuleSummary, QueryArgs, QueryResults } from '@lampstand/ipc-contract';
import type { SearchService } from '../search/searchService';
import type { WindowManager } from '../windows/windowManager';
import { dailyBackup, importLibraryZip, zipLibrary } from '../library/backup';
import { parsePptx } from '../library/pptx';
import { type QueryHandlers, type Services } from '../types';
import { MAX_DECK_BYTES } from '../constants';

interface QueryDeps {
  installModules: (files: string[]) => Promise<QueryResults['modules.install']>;
  listModules: () => ModuleSummary[];
  s: Services;
  search: SearchService;
  windows: WindowManager;
  audit: () => AuditEntry[];
  control: () => BrowserWindow | null;
}

/** Read-side handlers for the control window. Args are already Zod-validated by the router. */
export function createQueries({
  s,
  search,
  windows,
  audit,
  control,
  installModules,
  listModules,
}: QueryDeps): QueryHandlers {
  const parent = (): BrowserWindow | undefined => control() ?? undefined;
  const openDialog = async (opts: Electron.OpenDialogOptions): Promise<string[]> => {
    const w = parent();
    const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
    return res.canceled ? [] : res.filePaths;
  };

  return {
    'slides.import': async () => {
      const [file] = await openDialog({
        title: 'Import slides',
        properties: ['openFile'],
        filters: [{ name: 'PowerPoint or PDF', extensions: ['pptx', 'pdf'] }],
      });
      if (!file) return { kind: 'none' as const };
      const st = await stat(file);
      if (st.size > MAX_DECK_BYTES)
        throw new AppError('import-too-large', 'That file is too large to import.');
      const data = new Uint8Array(await readFile(file));
      const title = basename(file, extname(file)).slice(0, 200) || 'Imported slides';
      if (extname(file).toLowerCase() === '.pdf') return { kind: 'pdf' as const, title, data };
      try {
        return { kind: 'pptx' as const, title, ...parsePptx(data) };
      } catch {
        throw new AppError('import-failed', 'That file could not be read as a PowerPoint deck.');
      }
    },
    'media.importBytes': (a: QueryArgs<'media.importBytes'>) =>
      s.mediaLibrary.importBytes(a.name, a.data),
    'app.info': () => ({
      version: app.getVersion(),
      platform: process.platform,
      electron: process.versions.electron,
    }),
    'live.get': () => s.live.get(),
    'settings.get': () => s.settings.get(),
    'songs.list': async () => [...(await s.songs.list()), ...s.hymnSongs],
    'services.list': async () =>
      (await s.services.list())
        .map((p) => ({
          id: p.id,
          name: p.name,
          date: p.date,
          updatedAt: p.updatedAt,
          isTemplate: p.isTemplate,
          itemCount: p.items.length,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    'services.get': (a: QueryArgs<'services.get'>) => s.services.get(a.id),
    'themes.list': async () => [...STARTER_THEMES, ...(await s.themes.list())],
    'media.list': () => s.media.list(),
    'bible.versions': () => s.bibles.list(),
    'bible.chapter': async (a: QueryArgs<'bible.chapter'>) => ({
      verses: await s.bibles.chapter(a.versionId, a.book, a.chapter),
    }),
    'bible.verseCounts': (a: QueryArgs<'bible.verseCounts'>) => s.bibles.verseCounts(a.versionId),
    'search.query': (a: QueryArgs<'search.query'>) =>
      search.query(a.text, a.limit ?? 30, a.versionId),
    'displays.list': () => windows.listDisplays(),
    'history.state': () => ({ canUndo: s.bus.canUndo(), canRedo: s.bus.canRedo() }),
    'media.import': async (a: QueryArgs<'media.import'>) => {
      const files = await openDialog({
        title: 'Add media',
        properties: ['openFile', 'multiSelections'],
        filters: [
          {
            name: 'Images, video and audio',
            extensions: [
              'jpg',
              'jpeg',
              'png',
              'gif',
              'webp',
              'mp4',
              'm4v',
              'mov',
              'webm',
              'mp3',
              'm4a',
              'wav',
            ],
          },
        ],
      });
      if (!files.length) return { imported: 0, rejected: 0 };
      return s.mediaLibrary.importFiles(files, a.asBackground ?? false);
    },
    'library.export': async () => {
      const w = parent();
      const opts: Electron.SaveDialogOptions = {
        title: 'Export library',
        defaultPath: `Lampstand Library ${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [{ name: 'Zip', extensions: ['zip'] }],
      };
      const res = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts);
      if (res.canceled || !res.filePath) return { done: false };
      await zipLibrary(s.paths.library, res.filePath, true);
      return { done: true };
    },
    'library.import': async () => {
      const [file] = await openDialog({
        title: 'Import library',
        properties: ['openFile'],
        filters: [{ name: 'Lampstand library export', extensions: ['zip'] }],
      });
      if (!file) return { done: false, imported: 0 };
      // Safety net: snapshot the current library before merging anything in.
      await dailyBackup(s.paths.library, s.paths.backups, true);
      const imported = await importLibraryZip(file, s.paths.library);
      await Promise.all([
        s.songs.reload(),
        s.services.reload(),
        s.themes.reload(),
        s.media.reload(),
      ]);
      return { done: true, imported };
    },
    'library.backupNow': async () => ({
      done: await dailyBackup(s.paths.library, s.paths.backups, true),
    }),
    'audit.recent': () => audit().slice(-200),
    'modules.list': () => listModules(),
    'modules.install': async () => {
      const files = await openDialog({
        title: 'Install Bible or hymnal package',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Lampstand packages', extensions: ['lsbible', 'lshymnal', 'json'] }],
      });
      return files.length ? installModules(files) : { installed: [], failed: [] };
    },
  };
}

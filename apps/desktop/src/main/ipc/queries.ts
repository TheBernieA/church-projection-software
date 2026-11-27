import type { NdiController } from '../ndi/ndiController';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { app, dialog, shell, systemPreferences, type BrowserWindow } from 'electron';
import {
  AppError,
  OnlineBibleSchema,
  parseEqText,
  ProcessingPresetSchema,
  ProcessingSchema,
  presetFileText,
  readDeskProfileFile,
  readPresetFile,
  STARTER_THEMES,
  type AuditEntry,
} from '@lampstand/core';
import type { ModuleSummary, Notice, QueryArgs, QueryResults } from '@lampstand/ipc-contract';
import type { SearchService } from '../search/searchService';
import type { WindowManager } from '../windows/windowManager';
import { dailyBackup, importLibraryZip, zipLibrary } from '../library/backup';
import { parsePptx } from '../library/pptx';
import { type QueryHandlers, type Services } from '../types';
import type { SecretStore } from '../secrets/secretStore';
import type { DeskLink } from '../desk/deskLink';
import { isWithin } from '../security/safePath';
import { keyName, recordingsFolder, type StreamController } from '../stream/streamController';
import { MAX_DECK_BYTES, MAX_SONG_FILE_BYTES } from '../constants';
import { decodeTextFile, SONG_FILE_EXTENSIONS } from '@lampstand/lyrics';

/** The largest presets file, text EQ or desk profile read (1 MB). */
const MAX_SMALL_TEXT = 1024 * 1024;

interface QueryDeps {
  installModules: (files: string[]) => Promise<QueryResults['modules.install']>;
  listModules: () => ModuleSummary[];
  s: Services;
  search: SearchService;
  windows: WindowManager;
  audit: () => AuditEntry[];
  missedNotices: () => Notice[];
  control: () => BrowserWindow | null;
  stream: StreamController;
  ndi: NdiController;
  secrets: SecretStore;
  desk: DeskLink;
}

/** Read-side handlers for the control window. Args are already Zod-validated by the router. */
export function createQueries({
  s,
  search,
  windows,
  audit,
  missedNotices,
  control,
  installModules,
  listModules,
  stream,
  ndi,
  secrets,
  desk,
}: QueryDeps): QueryHandlers {
  const parent = (): BrowserWindow | undefined => control() ?? undefined;
  const openDialog = async (opts: Electron.OpenDialogOptions): Promise<string[]> => {
    const w = parent();
    const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
    return res.canceled ? [] : res.filePaths;
  };

  /** A small text file (presets, an EQ, a desk profile); anything big isn't one. */
  const readSmallText = async (file: string): Promise<string> => {
    if ((await stat(file)).size > MAX_SMALL_TEXT)
      throw new AppError('import-too-large', 'That file is too large to be presets or a profile.');
    return readFile(file, 'utf8');
  };

  return {
    'songs.importFiles': async () => {
      const paths = await openDialog({
        title: 'Import songs',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Song files', extensions: [...SONG_FILE_EXTENSIONS] },
          { name: 'All files', extensions: ['*'] },
        ],
      });
      const files: { name: string; text: string }[] = [];
      const skipped: string[] = [];
      for (const path of paths.slice(0, 500)) {
        const name = basename(path).slice(0, 200);
        try {
          if ((await stat(path)).size > MAX_SONG_FILE_BYTES) skipped.push(name);
          else files.push({ name, text: decodeTextFile(await readFile(path)) });
        } catch {
          skipped.push(name);
        }
      }
      return { files, skipped };
    },
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
        return { kind: 'pptx' as const, title, ...(await parsePptx(data)) };
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
    'mediaPlaylists.list': () => s.mediaPlaylists.list(),
    // Installed Bibles, then those read from APIs as they're used.
    'bible.versions': () => [...s.bibles.list(), ...s.onlineBibles.infos()],
    'bible.chapter': async (a: QueryArgs<'bible.chapter'>) => ({
      verses: s.onlineBibles.has(a.versionId)
        ? await s.onlineBibles.chapter(a.versionId, a.book, a.chapter)
        : await s.bibles.chapter(a.versionId, a.book, a.chapter),
    }),
    'bible.verseCounts': (a: QueryArgs<'bible.verseCounts'>) =>
      s.onlineBibles.has(a.versionId)
        ? s.onlineBibles.verseCounts(a.versionId)
        : s.bibles.verseCounts(a.versionId),
    'bible.bookNames': (a: QueryArgs<'bible.bookNames'>) =>
      s.onlineBibles.has(a.versionId)
        ? s.onlineBibles.bookNames(a.versionId)
        : s.bibles.bookNames(a.versionId),
    'onlineBible.status': () => s.onlineBibles.status(),
    'onlineBible.probe': (a: QueryArgs<'onlineBible.probe'>) =>
      s.onlineBibles.probe(OnlineBibleSchema.parse({ ...a.source, id: 'ol-probe' }), a.key ?? ''),
    'onlineBible.catalog': (a: QueryArgs<'onlineBible.catalog'>) =>
      s.onlineBibles.apiBibleCatalog(a.key),
    // The assistant: the key is checked and kept in main; the page only learns whether one is
    // saved. A plan sends only what was typed, and the song titles when both allow it.
    'assistant.status': async () => ({ hasKey: await s.assistant.hasKey() }),
    'assistant.setKey': async (a: QueryArgs<'assistant.setKey'>) => {
      await s.assistant.setKey(a.key);
      return { saved: true };
    },
    'assistant.forgetKey': async () => {
      await s.assistant.forgetKey();
      return { forgotten: true };
    },
    'assistant.plan': async (a: QueryArgs<'assistant.plan'>) => {
      const share = a.useLibrary !== false && s.settings.get().assistant.sendSongTitles;
      const titles = share
        ? [...new Set([...(await s.songs.list()), ...s.hymnSongs].map((x) => x.title))].sort()
        : [];
      return s.assistant.planService({
        text: a.text,
        ...(a.date ? { date: a.date } : {}),
        ...(titles.length ? { songTitles: titles } : {}),
      });
    },
    'assistant.lyrics': (a: QueryArgs<'assistant.lyrics'>) => s.assistant.structureLyrics(a.text),
    'speech.models': () => s.speechModels.status(),
    // Runs on after answering; progress and the outcome come as evSpeechModel.
    'speech.download': (a: QueryArgs<'speech.download'>) => {
      void s.speechModels.download(a.id).catch(() => undefined);
      return { started: true };
    },
    'speech.cancel': (a: QueryArgs<'speech.cancel'>) => {
      s.speechModels.cancel(a.id);
      return { cancelled: true };
    },
    'speech.remove': async (a: QueryArgs<'speech.remove'>) => {
      await s.speechModels.remove(a.id);
      return { removed: true };
    },
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
      if (!files.length) return { imported: 0, rejected: 0, ids: [] };
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
        s.mediaPlaylists.reload(),
        s.media.reload(),
      ]);
      return { done: true, imported };
    },
    'library.backupNow': async () => ({
      done: await dailyBackup(s.paths.library, s.paths.backups, true),
    }),
    'audit.recent': () => audit().slice(-200),
    'notices.missed': () => missedNotices(),
    'stream.status': () => stream.getStatus(),
    'ndi.status': () => ndi.getStatus(),
    'stream.keys': async () => {
      const saved = await secrets.names();
      return Object.fromEntries(
        s.settings.get().stream.destinations.map((d) => [d.id, saved.has(keyName(d.id))]),
      );
    },
    'recording.chooseFolder': async () => {
      const folders = await openDialog({
        title: 'Recordings folder',
        properties: ['openDirectory', 'createDirectory'],
      });
      return { folder: folders.at(0) ?? null };
    },
    'desk.status': () => desk.status(),
    'desk.read': ({ channel }: QueryArgs<'desk.read'>) => desk.read(channel),
    'desk.write': ({ channel, processing }: QueryArgs<'desk.write'>) =>
      desk.write(channel, ProcessingSchema.parse(processing)),
    'desk.channels': () => desk.channels(),
    'desk.importProfile': async () => {
      const [file] = await openDialog({
        title: 'Import a sound desk profile',
        properties: ['openFile'],
        filters: [{ name: 'Lampstand desk profile', extensions: ['json'] }],
      });
      if (!file) return { profile: null, file: null };
      const text = await readSmallText(file);
      return { profile: readDeskProfileFile(text), file: basename(file) };
    },
    'presets.export': async ({ presets, name }: QueryArgs<'presets.export'>) => {
      const w = parent();
      const safe = (name ?? 'Lampstand presets').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Presets';
      const opts: Electron.SaveDialogOptions = {
        title: 'Export presets',
        defaultPath: `${safe}.lampstand-presets.json`,
        filters: [{ name: 'Lampstand presets', extensions: ['json'] }],
      };
      const res = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts);
      if (res.canceled || !res.filePath) return { done: false };
      await writeFile(
        res.filePath,
        presetFileText(ProcessingPresetSchema.array().parse(presets)),
        'utf8',
      );
      return { done: true };
    },
    'presets.import': async () => {
      const [file] = await openDialog({
        title: 'Import presets or an EQ',
        properties: ['openFile'],
        filters: [
          { name: 'Presets or EQ (Lampstand, Equalizer APO, REW)', extensions: ['json', 'txt'] },
          { name: 'All files', extensions: ['*'] },
        ],
      });
      if (!file) return { kind: 'none' as const };
      const text = await readSmallText(file);
      const name = basename(file);
      const presets = readPresetFile(text);
      if (presets) return { kind: 'presets' as const, file: name, presets };
      const eq = parseEqText(text);
      if (eq) return { kind: 'eqText' as const, file: name, eq };
      return { kind: 'unreadable' as const, file: name };
    },
    'recording.reveal': async ({ path }: QueryArgs<'recording.reveal'>) => {
      const folder = recordingsFolder(s.settings.get().stream.recording.folder);
      // Only a recording Lampstand made: the current one, or one in the recordings folder.
      if (path && (path === stream.getStatus().recordingPath || isWithin(folder, path))) {
        shell.showItemInFolder(path);
        return { done: true };
      }
      await mkdir(folder, { recursive: true });
      return { done: (await shell.openPath(folder)) === '' };
    },
    'devices.access': async ({ kind, action }) => {
      const mac = process.platform === 'darwin';
      if (!mac && process.platform !== 'win32') return { status: 'granted' };
      if (action === 'open')
        await shell.openExternal(
          mac
            ? `x-apple.systempreferences:com.apple.preference.security?Privacy_${kind === 'camera' ? 'Camera' : 'Microphone'}`
            : `ms-settings:privacy-${kind === 'camera' ? 'webcam' : 'microphone'}`,
        );
      if (action === 'ask' && mac) await systemPreferences.askForMediaAccess(kind);
      return { status: systemPreferences.getMediaAccessStatus(kind) };
    },
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

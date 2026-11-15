import { app } from 'electron';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { watch } from 'chokidar';
import { z } from 'zod';
import {
  AppError,
  CommandBus,
  LiveStateStore,
  registerLiveCommands,
  resolveLogo,
  resolveStandby,
  standbyKey,
  type AuditEntry,
  type Song,
  type ScreenVisual,
  type Standby,
} from '@lampstand/core';
import {
  Channels,
  DisplayAssignSchema,
  type ModuleSummary,
  type Notice,
  type RepoKind,
} from '@lampstand/ipc-contract';
import { stripChords } from '@lampstand/lyrics';
import { registerIpc } from '../ipc/router';
import { createQueries } from '../ipc/queries';
import { registerLibraryCommands } from '../commands/libraryCommands';
import { dailyBackup } from '../library/backup';
import { MediaLibrary } from '../library/mediaLibrary';
import { BibleStore, installBibleModule } from '../modules/bibleModules';
import { installHymnalModule, removeInstalled } from '../modules/hymnalModules';
import { SearchService } from '../search/searchService';
import { handleAppProtocol, handleMediaProtocol, rendererRootDir } from '../security/protocols';
import {
  installDevCsp,
  installGlobalGuards,
  installPermissionHandlers,
} from '../security/hardening';
import { SettingsStore } from '../storage/settingsStore';
import { WindowManager } from '../windows/windowManager';
import { upsertAssignment } from '../windows/displays';
import type { SongDoc } from '../../workers/search/protocol';
import { createLogger, type Logger } from './logger';
import { resolvePaths } from './paths';
import { sampleService } from './sampleService';
import {
  createRepos,
  ensureLibrary,
  installBundledBibles,
  loadHymnals,
  type Services,
} from './services';

function songDoc(s: Song): SongDoc {
  const lines = s.sections
    .flatMap((x) => x.lines)
    .map(stripChords)
    .filter((l) => l.trim());
  const hymn = s.hymnNumber?.[0]?.number ?? '';
  return {
    id: s.id,
    title: s.title,
    firstLine: lines[0] ?? '',
    lyrics: lines.join(' '),
    authors: s.authors.join(' '),
    ccli: s.ccliNumber ?? '',
    hymn: hymn ? `h${hymn}` : '',
    tags: s.tags.join(' '),
    isHymn: s.origin === 'hymnal',
  };
}

/** Composition root of the main process (§3.1). */
export class AppController {
  private s!: Services;
  private windows!: WindowManager;
  private search!: SearchService;
  private auditLog: AuditEntry[] = [];
  private log!: Logger;
  private started = false;
  private logo: ScreenVisual = { kind: 'logo', text: 'Lampstand' };
  private standby: Standby = this.logo;

  /** Re-resolve the logo and off-air screen (settings or media library changed); push changes. */
  private async refreshScreens(): Promise<void> {
    const { logo, offAir } = this.s.settings.get();
    const ids = [logo.mediaId, offAir.mediaId].filter((id): id is string => !!id);
    const kinds = new Map<string, string>();
    for (const id of ids) {
      const item = await this.s.media.get(id);
      if (item) kinds.set(id, item.kind);
    }
    const kindOf = (id: string): string | undefined => kinds.get(id);
    const nextLogo = resolveLogo(logo, kindOf);
    const nextStandby = resolveStandby(offAir, logo, kindOf);
    if (
      standbyKey(nextLogo) === standbyKey(this.logo) &&
      standbyKey(nextStandby) === standbyKey(this.standby)
    )
      return;
    this.logo = nextLogo;
    this.standby = nextStandby;
    this.windows.refreshOutputInfo();
  }

  async start(): Promise<void> {
    const bootPaths = resolvePaths();
    this.log = createLogger(bootPaths.logs);
    const log = this.log;
    installGlobalGuards(log);
    installDevCsp();
    const settings = new SettingsStore(
      bootPaths.settingsFile,
      bootPaths.userData,
      log.child('settings'),
    );
    await settings.load();
    const paths = resolvePaths(settings.get().libraryPath);
    await ensureLibrary(paths.library);

    const repos = createRepos(paths, log.child('storage'), (file) =>
      this.notice({ level: 'warning', key: 'quarantined', params: { file } }),
    );
    const bibles = new BibleStore(paths.bibles);
    await installBundledBibles(paths, bibles, log.child('bibles'));
    const { songs: hymnSongs, hymnals } = await loadHymnals(paths, log);
    const bus = new CommandBus();
    const live = new LiveStateStore();
    const mediaLibrary = new MediaLibrary(
      join(paths.library, 'media'),
      repos.media,
      log.child('media'),
    );
    this.s = {
      paths,
      log,
      settings,
      bus,
      live,
      ...repos,
      mediaLibrary,
      bibles,
      hymnSongs,
      hymnals,
    };

    this.registerCommands();
    this.windows = new WindowManager({
      log: log.child('windows'),
      getSettings: () => settings.get(),
      getLiveState: () => live.get(),
      logo: () => this.logo,
      standby: () => this.standby,
      onDisplaysChanged: () => this.windows.sendToControl(Channels.evDisplays),
      onNewDisplay: (label) => this.notice({ level: 'info', key: 'newDisplay', params: { label } }),
    });

    handleAppProtocol(rendererRootDir());
    handleMediaProtocol(async (kind, id) => {
      const mediaDir = join(paths.library, 'media');
      if (kind === 'thumb') return { root: join(mediaDir, '.thumbs'), rel: `${id}.png` };
      if (kind !== 'media') return null;
      const item = await repos.media.get(id);
      return item ? { root: mediaDir, rel: item.fileName } : null;
    });
    installPermissionHandlers(() => false); // camera/mic arrive with detection & streaming (Phase 2/3)

    this.search = new SearchService(
      { biblesDir: paths.bibles, cacheDir: paths.cache },
      log.child('search'),
    );
    this.search.start();
    this.search.setBibles(bibles.list().map((v) => ({ id: v.id, checksum: v.checksumSha256 })));
    await this.reindexSongs();

    registerIpc({
      bus,
      queries: createQueries({
        s: this.s,
        search: this.search,
        windows: this.windows,
        audit: () => this.auditLog,
        control: () => this.windows.control,
        installModules: (files) => this.installModules(files),
        listModules: () => this.listModules(),
      }),
      kindOf: (e) => this.windows.kindOf(e.sender),
      onOutputReady: (e) => this.windows.outputReady(e.sender),
      log,
    });

    live.subscribe((state) => this.windows.broadcastLive(state));
    bus.onHistoryChange(() =>
      this.windows.sendToControl(Channels.evHistory, {
        canUndo: bus.canUndo(),
        canRedo: bus.canRedo(),
      }),
    );
    bus.onAudit((e) => {
      this.auditLog.push(e);
      if (this.auditLog.length > 2000) this.auditLog.splice(0, 500);
      if (e.type.startsWith('live.')) log.info('command', { ...e });
    });

    const repoEvents: [RepoKind, { watch: (cb: () => void) => () => void }][] = [
      ['songs', repos.songs],
      ['services', repos.services],
      ['themes', repos.themes],
      ['media', repos.media],
    ];
    for (const [kind, repo] of repoEvents) {
      repo.watch(() => {
        this.windows.sendToControl(Channels.evRepo, kind);
        if (kind === 'songs') this.debouncedReindex();
        if (kind === 'media') void this.refreshScreens(); // a logo/off-air pick may have been deleted
      });
    }
    await this.refreshScreens();
    // Only display assignments / window mode affect output windows; skip the reconcile otherwise.
    let outputKey = JSON.stringify([settings.get().displays, settings.get().windowMode]);
    settings.onChange((next) => {
      this.windows.sendToControl(Channels.evRepo, 'settings');
      const key = JSON.stringify([next.displays, next.windowMode]);
      if (key !== outputKey) {
        outputKey = key;
        this.windows.reconcile();
      }
      void this.refreshScreens();
    });
    this.watchLibrary();

    if ((await repos.services.list()).length === 0) {
      const plan = sampleService(hymnSongs.map((h) => h.id));
      await repos.services.upsert(plan);
      settings.update({ lastServiceId: plan.id });
    }

    this.windows.createControlWindow();
    this.windows.start();
    void dailyBackup(paths.library, paths.backups).catch((e: unknown) =>
      log.warn('backup failed', { err: String(e) }),
    );
    this.started = true;
    log.info('started', { version: app.getVersion() });
  }

  private registerCommands(): void {
    const { bus, live, settings } = this.s;
    registerLiveCommands(bus, live);
    registerLibraryCommands(bus, {
      songs: this.s.songs,
      services: this.s.services,
      themes: this.s.themes,
    });
    bus.register({
      type: 'settings.update',
      // Don't use SettingsSchema.partial(): in Zod 4 it still fills each field's *default*, so a
      // patch of `{ uiScale }` would silently reset windowMode, displays, shortcuts… Instead the
      // store validates the merged result against the full schema.
      schema: z.object({ patch: z.record(z.string().max(60), z.unknown()) }),
      undoable: false,
      handle: ({ patch }) => ({ result: settings.update(patch) }),
    });
    bus.register({
      type: 'display.assign',
      schema: DisplayAssignSchema,
      undoable: false,
      handle: ({ displayId, role }) => {
        const d = this.windows.findDisplay(displayId);
        if (!d) throw new AppError('display-not-found', 'That display is no longer connected.');
        settings.update({ displays: upsertAssignment(settings.get().displays, d, role) });
        return { result: null };
      },
    });
    bus.register({
      type: 'module.remove',
      schema: z.object({ kind: z.enum(['bible', 'hymnal']), id: z.string().max(40) }),
      undoable: false,
      handle: async ({ kind, id }) => {
        const mod = this.listModules().find((m) => m.kind === kind && m.id === id);
        if (!mod?.removable) throw new AppError('read-only', 'Bundled packages cannot be removed.');
        await removeInstalled(kind === 'bible' ? this.s.paths.bibles : this.s.paths.hymnals, id);
        if (kind === 'bible') await this.reloadBibles();
        else await this.reloadHymnals();
        return { result: true };
      },
    });
    bus.register({
      type: 'media.delete',
      schema: z.object({ id: z.string().max(64) }),
      undoable: false,
      handle: async ({ id }) => {
        const item = await this.s.media.get(id);
        if (item) await this.s.mediaLibrary.remove(item);
        return { result: !!item };
      },
    });
    bus.register({
      type: 'media.update',
      schema: z.object({
        id: z.string().max(64),
        name: z.string().min(1).max(260).optional(),
        isBackground: z.boolean().optional(),
      }),
      undoable: false,
      handle: async ({ id, name, isBackground }) => {
        const item = await this.s.media.get(id);
        if (!item) throw new AppError('not-found', 'Media not found.');
        const next = {
          ...item,
          ...(name ? { name } : {}),
          ...(isBackground !== undefined ? { isBackground } : {}),
        };
        return { result: await this.s.media.upsert(next) };
      },
    });
  }

  /** Bible/hymnal packages are installed by users from files (§8.3 import, §9.2). */
  private async installModules(
    files: string[],
  ): Promise<{ installed: ModuleSummary[]; failed: { file: string; message: string }[] }> {
    const installed: ModuleSummary[] = [];
    const failed: { file: string; message: string }[] = [];
    let bibles = false;
    let hymns = false;
    for (const file of files) {
      const name = basename(file);
      try {
        const st = await stat(file);
        if (st.size > 64 * 1024 * 1024)
          throw new AppError('module-too-large', 'Package is too large.');
        const bytes = new Uint8Array(await readFile(file));
        if (file.toLowerCase().endsWith('.lsbible')) {
          await mkdir(this.s.paths.bibles, { recursive: true });
          const v = await installBibleModule(bytes, {
            root: this.s.paths.bibles,
            source: 'imported',
          });
          installed.push({
            kind: 'bible',
            id: v.id,
            name: v.name,
            detail: v.abbreviation,
            source: 'imported',
            removable: true,
          });
          bibles = true;
        } else {
          await mkdir(this.s.paths.hymnals, { recursive: true });
          const h = await installHymnalModule(bytes, this.s.paths.hymnals);
          installed.push({
            kind: 'hymnal',
            id: h.id,
            name: h.name,
            detail: `${h.hymns.length} hymns`,
            source: 'installed',
            removable: true,
          });
          hymns = true;
        }
      } catch (e) {
        failed.push({
          file: name,
          message: e instanceof AppError ? e.message : 'Could not read this package.',
        });
        this.log.warn('module install failed', { file: name });
      }
    }
    if (bibles) await this.reloadBibles();
    if (hymns) await this.reloadHymnals();
    return { installed, failed };
  }

  private listModules(): ModuleSummary[] {
    const bibles: ModuleSummary[] = this.s.bibles.list().map((v) => ({
      kind: 'bible',
      id: v.id,
      name: v.name,
      detail: v.abbreviation,
      source: v.source,
      removable: v.source !== 'bundled',
    }));
    const hymnals: ModuleSummary[] = this.s.hymnals.map((h) => ({
      kind: 'hymnal',
      id: h.id,
      name: h.name,
      detail: `${h.count} hymns`,
      source: h.source,
      removable: h.source === 'installed',
    }));
    return [...bibles, ...hymnals];
  }

  private async reloadBibles(): Promise<void> {
    await this.s.bibles.refresh();
    this.search.setBibles(
      this.s.bibles.list().map((v) => ({ id: v.id, checksum: v.checksumSha256 })),
    );
    this.windows.sendToControl(Channels.evRepo, 'bibles');
  }

  private async reloadHymnals(): Promise<void> {
    const { songs, hymnals } = await loadHymnals(this.s.paths, this.log);
    this.s.hymnSongs = songs;
    this.s.hymnals = hymnals;
    await this.reindexSongs();
    this.windows.sendToControl(Channels.evRepo, 'songs');
  }

  private reindexTimer: ReturnType<typeof setTimeout> | null = null;
  private debouncedReindex(): void {
    if (this.reindexTimer) clearTimeout(this.reindexTimer);
    this.reindexTimer = setTimeout(() => void this.reindexSongs(), 400);
  }

  private async reindexSongs(): Promise<void> {
    const songs = [...(await this.s.songs.list()), ...this.s.hymnSongs];
    this.search.setSongs(songs.map(songDoc));
  }

  /** External edits / shared folders (Dropbox, OneDrive) refresh live (§6.2). */
  private watchLibrary(): void {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const map: Record<string, { reload: () => Promise<void> }> = {
      songs: this.s.songs,
      services: this.s.services,
      themes: this.s.themes,
    };
    const watcher = watch(
      Object.keys(map).map((d) => join(this.s.paths.library, d)),
      {
        ignoreInitial: true,
        depth: 0,
        awaitWriteFinish: { stabilityThreshold: 300 },
        ignored: (p: string) => p.endsWith('.tmp'),
      },
    );
    watcher.on('all', (_ev, path) => {
      const dir = Object.keys(map).find((d) => path.includes(join(this.s.paths.library, d)));
      if (!dir) return;
      const prev = timers.get(dir);
      if (prev) clearTimeout(prev);
      timers.set(
        dir,
        setTimeout(() => void map[dir]?.reload(), 1000),
      );
    });
    app.on('before-quit', () => void watcher.close());
  }

  private notice(n: Notice): void {
    if (this.started) this.windows.sendToControl(Channels.evNotice, n);
  }

  async shutdown(): Promise<void> {
    if (!this.started) return;
    this.windows.setQuitting();
    this.search.stop();
    await this.s.settings.flush();
  }
}

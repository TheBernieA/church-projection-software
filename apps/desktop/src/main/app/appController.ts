import { app } from 'electron';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { watch } from 'chokidar';
import { z } from 'zod';
import {
  AppError,
  CommandBus,
  initialLiveState,
  LiveStateStore,
  mixerFromSettings,
  registerLiveCommands,
  resolveKindThemes,
  resolveLogo,
  resolveStandby,
  standbyKey,
  STARTER_THEMES,
  type AuditEntry,
  type LiveState,
  type Song,
  type ScreenVisual,
  type KindThemes,
  type ResolvedKindThemes,
  type Standby,
  type Theme,
} from '@lampstand/core';
import {
  Channels,
  DisplayAssignSchema,
  type ModuleSummary,
  type Notice,
  type RepoKind,
} from '@lampstand/ipc-contract';
import { stripChords } from '@lampstand/lyrics';
import { OscServer } from '../surfaces/oscServer';
import { registerIpc } from '../ipc/router';
import { installAppMenu } from './menu';
import { createQueries } from '../ipc/queries';
import { SecretStore } from '../secrets/secretStore';
import { keyName, StreamController } from '../stream/streamController';
import type { PictureSources } from '../stream/pictureWindow';
import { NdiController } from '../ndi/ndiController';
import { cleanStreamKey, isStreamKey, pasteShape, plausibleKey } from '../stream/ffmpegArgs';
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
import { createLogger } from './logger';
import { resolvePaths } from './paths';
import { sampleService } from './sampleService';
import { createRepos, ensureLibrary, installBundledBibles, loadHymnals } from './services';
import { type Logger, type Services } from '../types';
import { errorMessage } from '../utils';

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
  private stream!: StreamController;
  private ndi!: NdiController;
  private osc!: OscServer;
  private secrets!: SecretStore;
  private auditLog: AuditEntry[] = [];
  private log!: Logger;
  private started = false;
  private logo: ScreenVisual = { kind: 'logo', text: 'Lampstand' };
  private standby: Standby = this.logo;
  /** The theme chosen for the stream's lower third, looked up from its id. */
  private wordsTheme: Theme | null = null;
  /** Each output's own themes by kind of slide, looked up from their ids. */
  private outputThemes: { alternate: ResolvedKindThemes; stream: ResolvedKindThemes } = {
    alternate: {},
    stream: {},
  };

  /** Look the outputs' themes up again (a choice or a theme itself changed). */
  private async refreshWordsTheme(): Promise<void> {
    const settings = this.s.settings.get();
    const all = [...STARTER_THEMES, ...(await this.s.themes.list())];
    const find = (id: string | null | undefined): Theme | null =>
      (id ? all.find((t) => t.id === id) : null) ?? null;
    const byKind = (ids: KindThemes): ResolvedKindThemes => resolveKindThemes(ids, all);
    const words = find(settings.stream.picture.wordsTheme);
    const themes = {
      alternate: byKind(settings.outputThemes.alternate),
      stream: byKind(settings.outputThemes.stream),
    };
    if (JSON.stringify([words, themes]) === JSON.stringify([this.wordsTheme, this.outputThemes]))
      return;
    this.wordsTheme = words;
    this.outputThemes = themes;
    this.windows.refreshOutputInfo();
    this.stream.settingsChanged();
    this.ndi.settingsChanged();
  }

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
    // The sound desk carries on where it was left (saved a moment after each change).
    const live = new LiveStateStore({
      ...initialLiveState(),
      mixer: mixerFromSettings(settings.get()),
    });
    let savedMixer = live.get().mixer;
    live.subscribe((state) => {
      if (state.mixer === savedMixer) return;
      savedMixer = state.mixer;
      const mixer = savedMixer;
      this.saveLater('mixer', 1000, () => settings.update({ mixer }));
    });
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
      alternateThemes: () => this.outputThemes.alternate,
      onDisplaysChanged: () => this.windows.sendToControl(Channels.evDisplays),
      onNewDisplay: (label) => this.notice({ level: 'info', key: 'newDisplay', params: { label } }),
      onLiveConsoleBounds: (b) =>
        this.saveLater('liveConsole', 800, () =>
          settings.update({
            layout: {
              ...settings.get().layout,
              liveConsoleX: b.x,
              liveConsoleY: b.y,
              liveConsoleW: b.width,
              liveConsoleH: b.height,
            },
          }),
        ),
      onLiveConsoleClosed: () => this.windows.sendToControl(Channels.evLiveConsole, false),
    });

    // Livestream and recording; stream keys encrypted on this computer (never in settings).
    this.secrets = new SecretStore(join(paths.userData, 'secrets.json'));
    // What every stream picture (the livestream, each NDI feed) is drawn from.
    const pictures = (mod: string): PictureSources => ({
      log: log.child(mod),
      windows: this.windows,
      getSettings: () => settings.get(),
      getLiveState: () => live.get(),
      logo: () => this.logo,
      standby: () => this.standby,
      wordsTheme: () => this.wordsTheme,
      kindThemes: () => this.outputThemes.stream,
      alternateThemes: () => this.outputThemes.alternate,
    });
    this.stream = new StreamController({
      ...pictures('stream'),
      secrets: this.secrets,
      updateSettings: (patch) => settings.update(patch),
      onStatus: (status) => this.windows.sendToControl(Channels.evStream, status),
      notice: (n) => this.notice(n),
    });
    // NDI feeds (Settings › NDI), with the NDI runtime from NDI Tools when it's installed.
    this.ndi = new NdiController({
      ...pictures('ndi'),
      onStatus: (status) => this.windows.sendToControl(Channels.evNdi, status),
    });
    this.ndi.settingsChanged();
    this.osc = new OscServer({
      log: log.child('osc'),
      getSettings: () => settings.get(),
      onMessages: (m) => this.windows.sendToControl(Channels.evOsc, m),
      onStatus: (s) => this.windows.sendToControl(Channels.evOscStatus, s),
    });
    this.osc.settingsChanged();

    handleAppProtocol(rendererRootDir());
    handleMediaProtocol(async (kind, id) => {
      const mediaDir = join(paths.library, 'media');
      if (kind === 'thumb') return { root: join(mediaDir, '.thumbs'), rel: `${id}.png` };
      if (kind !== 'media') return null;
      const item = await repos.media.get(id);
      return item ? { root: mediaDir, rel: item.fileName } : null;
    });
    // Camera/mic for video and audio inputs: Lampstand's own control and output windows only.
    installPermissionHandlers((wc) => this.windows.mayUseMedia(wc));

    this.search = new SearchService(
      { biblesDir: paths.bibles, cacheDir: paths.cache },
      log.child('search'),
    );
    this.search.start();
    this.syncSearchBibles();
    await this.reindexSongs();

    registerIpc({
      bus,
      queries: createQueries({
        s: this.s,
        search: this.search,
        windows: this.windows,
        audit: () => this.auditLog,
        missedNotices: () => this.takeMissedNotices(),
        control: () => this.windows.control,
        installModules: (files) => this.installModules(files),
        listModules: () => this.listModules(),
        stream: this.stream,
        ndi: this.ndi,
        secrets: this.secrets,
      }),
      kindOf: (e) => this.windows.kindOf(e.sender),
      onOutputReady: (e) => this.windows.outputReady(e.sender),
      onMeters: (m) => {
        if (m.bus === 'stream') this.stream.hearStream(m.level[0]);
        this.windows.sendToControl(Channels.evMeters, m);
      },
      onStreamWatch: (sender, fps, ready) => this.stream.watch(sender, fps, ready),
      onOscSend: (address, args) => this.osc.send(address, args),
      oscStatus: () => this.osc.current,
      log,
    });

    // Whether only the sound changed (a fader drag): the windows then leave their pictures be.
    let sent: LiveState | null = null;
    live.subscribe((state) => {
      const prev = sent;
      sent = state;
      const soundOnly =
        !!prev &&
        (Object.keys(state) as (keyof LiveState)[]).every(
          (k) => k === 'mixer' || k === 'audio' || k === 'revision' || state[k] === prev[k],
        );
      this.windows.broadcastLive(state, soundOnly);
    });
    bus.onAudit((e) => {
      this.auditLog.push(e);
      if (this.auditLog.length > 2000) this.auditLog.splice(0, 500);
      if (e.type.startsWith('live.')) log.info('command', { ...e });
    });

    const repoEvents: [RepoKind, { watch: (cb: () => void) => () => void }][] = [
      ['songs', repos.songs],
      ['services', repos.services],
      ['themes', repos.themes],
      ['mediaPlaylists', repos.mediaPlaylists],
      ['media', repos.media],
    ];
    for (const [kind, repo] of repoEvents) {
      repo.watch(() => {
        this.windows.sendToControl(Channels.evRepo, kind);
        if (kind === 'songs') this.debouncedReindex();
        if (kind === 'themes') void this.refreshWordsTheme();
        if (kind === 'media') void this.refreshScreens(); // a logo/off-air pick may have been deleted
      });
    }
    await this.refreshScreens();
    await this.refreshWordsTheme();
    // Only display assignments / window mode affect output windows; skip the reconcile otherwise.
    // What decides which output windows exist (edge blending adds rehearsal windows).
    const outputsOf = (x: ReturnType<typeof settings.get>): string =>
      JSON.stringify([x.displays, x.windowMode, x.edgeBlend.enabled, x.edgeBlend.windows]);
    let outputKey = outputsOf(settings.get());
    // What each output window is told about its screen (masks, stage, adjustments).
    const outputInfoOf = (x: ReturnType<typeof settings.get>): string =>
      JSON.stringify([
        x.screenMasks,
        x.maskFor,
        x.audio.roomOutput,
        x.stageLayouts,
        x.stageLayoutId,
        x.keyFeed,
        x.screenAdjust,
        x.edgeBlend,
        x.wordsScale,
        x.wordsAlign,
      ]);
    let maskKey = outputInfoOf(settings.get());
    settings.onChange((next) => {
      const masks = outputInfoOf(next);
      if (masks !== maskKey) {
        maskKey = masks;
        this.windows.refreshOutputInfo();
      }
      this.windows.sendToControl(Channels.evRepo, 'settings');
      this.stream.settingsChanged();
      this.ndi.settingsChanged();
      this.osc.settingsChanged();
      void this.refreshWordsTheme();
      const key = outputsOf(next);
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
    installAppMenu((action) => this.windows.sendToControl(Channels.evMenu, action));
    this.windows.start();
    void dailyBackup(paths.library, paths.backups).catch((e: unknown) =>
      log.warn('backup failed', { err: errorMessage(e) }),
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
      mediaPlaylists: this.s.mediaPlaylists,
    });
    bus.register({
      type: 'settings.update',
      // Don't use SettingsSchema.partial(): in Zod 4 it still fills each field's *default*, so a
      // patch of `{ textScale }` would silently reset windowMode, displays, shortcuts… Instead the
      // store validates the merged result against the full schema.
      schema: z.object({ patch: z.record(z.string().max(60), z.unknown()) }),
      undoable: false,
      handle: ({ patch }) => ({ result: settings.update(patch) }),
    });
    // Livestream / recording (the toolbar's Live button).
    bus.register({
      type: 'stream.start',
      schema: z.object({ stream: z.boolean().optional(), record: z.boolean().optional() }),
      undoable: false,
      handle: async (p) => {
        await this.stream.start(p);
        return { result: null };
      },
    });
    bus.register({
      type: 'stream.stop',
      schema: z.object({ stream: z.boolean().optional(), record: z.boolean().optional() }),
      undoable: false,
      handle: async (p) => {
        await this.stream.stop(p);
        return { result: null };
      },
    });
    // The Live console in its own window (another display), or back in the main window.
    bus.register({
      type: 'liveConsole.open',
      schema: z.object({ open: z.boolean() }),
      undoable: false,
      handle: ({ open }) => {
        const l = settings.get().layout;
        this.windows.openLiveConsole(
          open,
          l.liveConsoleW
            ? {
                x: l.liveConsoleX,
                y: l.liveConsoleY,
                width: l.liveConsoleW,
                height: l.liveConsoleH,
              }
            : null,
        );
        this.windows.sendToControl(Channels.evLiveConsole, open);
        return { result: null };
      },
    });
    // The operator multi-view: every screen, the stream and each camera, in its own window.
    bus.register({
      type: 'multiview.open',
      schema: z.object({ open: z.boolean() }),
      undoable: false,
      handle: ({ open }) => {
        this.windows.openMultiview(open);
        return { result: null };
      },
    });
    // The computer can't keep up: switch the stream to Light now (it carries on).
    bus.register({
      type: 'stream.lighter',
      schema: z.object({}),
      undoable: false,
      handle: async () => {
        await this.stream.lighter();
        return { result: null };
      },
    });
    // "Check this computer": what streaming mode suits it (Auto then uses the answer).
    bus.register({
      type: 'stream.benchmark',
      schema: z.object({}),
      undoable: false,
      handle: async () => ({ result: await this.stream.benchmark() }),
    });
    // Cover the stream (and recording) with the cover picture, or uncover it.
    bus.register({
      type: 'stream.cover',
      schema: z.object({ on: z.boolean() }),
      undoable: false,
      handle: ({ on }) => {
        this.stream.cover(on);
        return { result: null };
      },
    });
    // Try failed destinations again.
    bus.register({
      type: 'stream.retry',
      schema: z.object({}),
      undoable: false,
      handle: async () => {
        await this.stream.retryDestinations();
        return { result: null };
      },
    });
    bus.register({
      type: 'stream.setKey',
      // Write-only: keys go into the encrypted store and never come back to a window.
      schema: z.object({
        destinationId: z.string().min(1).max(64),
        key: z.string().max(300).nullable(),
      }),
      undoable: false,
      handle: async ({ destinationId, key }) => {
        if (key === null || key.trim() === '') await this.secrets.delete(keyName(destinationId));
        else {
          const k = cleanStreamKey(key);
          if (!isStreamKey(k)) {
            // What it looked like (never its content), to see why a paste was refused.
            this.log.warn('stream key refused', {
              shape: pasteShape(key),
              cleanedLength: k.length,
            });
            throw new AppError(
              'invalid-key',
              k === '' && /[/:]/.test(key)
                ? 'That is the server address (“Stream URL”), not the key. Copy “Stream key” instead: it looks like abcd-efgh-ijkl-mnop-qrst.'
                : k === ''
                  ? 'Nothing usable was pasted. Copy “Stream key” again and paste it here.'
                  : 'That is too long to be a stream key. Copy only “Stream key”.',
            );
          }
          const kind = settings.get().stream.destinations.find((d) => d.id === destinationId)?.kind;
          if (kind && !plausibleKey(kind, k)) {
            this.log.warn('stream key refused', {
              kind,
              shape: pasteShape(key),
              cleanedLength: k.length,
            });
            if (kind === 'youtube')
              throw new AppError(
                'invalid-key',
                'That isn’t a YouTube stream key. In YouTube Studio › Go live › Stream, copy “Stream key” (like abcd-efgh-ijkl-mnop-qrst), not “Stream URL”.',
              );
            if (kind === 'facebook')
              throw new AppError(
                'invalid-key',
                'That is too short to be a Facebook stream key. Copy “Stream key” from Facebook’s Live setup.',
              );
          }
          await this.secrets.set(keyName(destinationId), k);
        }
        return { result: null };
      },
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
        /** Labels such as 'favourite' (media bin › Favourites). */
        tags: z.array(z.string().min(1).max(60)).max(50).optional(),
      }),
      undoable: false,
      handle: async ({ id, name, isBackground, tags }) => {
        const item = await this.s.media.get(id);
        if (!item) throw new AppError('not-found', 'Media not found.');
        const next = {
          ...item,
          ...(name ? { name } : {}),
          ...(isBackground !== undefined ? { isBackground } : {}),
          ...(tags ? { tags } : {}),
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
    this.syncSearchBibles();
    this.windows.sendToControl(Channels.evRepo, 'bibles');
  }

  private async reloadHymnals(): Promise<void> {
    const { songs, hymnals } = await loadHymnals(this.s.paths, this.log);
    this.s.hymnSongs = songs;
    this.s.hymnals = hymnals;
    await this.reindexSongs();
    this.windows.sendToControl(Channels.evRepo, 'songs');
  }

  /** The installed Bibles, for the search worker to index. */
  private syncSearchBibles(): void {
    this.search.setBibles(
      this.s.bibles.list().map((v) => ({ id: v.id, checksum: v.checksumSha256 })),
      this.s.settings.get().defaultBibleVersion,
    );
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

  /**
   * External edits / shared folders (Dropbox, OneDrive) refresh live (§6.2): the files that
   * changed are read again, a moment after the last change (Lampstand's own saves included;
   * those change nothing). A burst of very many changes re-reads the folder instead.
   */
  private watchLibrary(): void {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const changed = new Map<string, Set<string>>();
    const map: Record<
      string,
      { reload: () => Promise<void>; refreshFiles: (paths: string[]) => Promise<void> }
    > = {
      songs: this.s.songs,
      services: this.s.services,
      themes: this.s.themes,
      'media-playlists': this.s.mediaPlaylists,
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
      const paths = changed.get(dir) ?? new Set<string>();
      paths.add(path);
      changed.set(dir, paths);
      const prev = timers.get(dir);
      if (prev) clearTimeout(prev);
      timers.set(
        dir,
        setTimeout(() => {
          const repo = map[dir];
          const files = [...(changed.get(dir) ?? [])];
          changed.delete(dir);
          if (!repo) return;
          void (files.length > 200 ? repo.reload() : repo.refreshFiles(files));
        }, 1000),
      );
    });
    this.closeWatcher = () => watcher.close();
  }

  /** Notices from before the control window was there to show them (a quarantined file). */
  private missedNotices: Notice[] = [];

  private notice(n: Notice): void {
    if (this.started) this.windows.sendToControl(Channels.evNotice, n);
    else if (this.missedNotices.length < 20) this.missedNotices.push(n);
  }

  /** The control window asks once it's listening: the startup notices, each given once. */
  takeMissedNotices(): Notice[] {
    const out = this.missedNotices;
    this.missedNotices = [];
    return out;
  }

  /** A second launch brings the running app's control window forward. */
  focusControl(): void {
    const w = this.started ? this.windows.control : null;
    if (!w || w.isDestroyed()) return;
    if (w.isMinimized()) w.restore();
    w.focus();
  }

  /** Settings saved a moment after the last change (the mixer, the Live console's place). */
  private pendingSaves = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; run: () => void }
  >();
  private closeWatcher: (() => Promise<void>) | null = null;

  private saveLater(key: string, ms: number, run: () => void): void {
    const prev = this.pendingSaves.get(key);
    if (prev) clearTimeout(prev.timer);
    const timer = setTimeout(() => {
      this.pendingSaves.delete(key);
      run();
    }, ms);
    this.pendingSaves.set(key, { timer, run });
  }

  /**
   * Quitting: finish a recording or stream properly, stop NDI and OSC, then save what's still
   * waiting to be saved.
   */
  async shutdown(): Promise<void> {
    if (!this.started) return;
    this.windows.setQuitting();
    await this.stream.shutdown();
    await this.ndi.shutdown();
    this.osc.close();
    this.search.stop();
    await this.closeWatcher?.();
    for (const { timer, run } of this.pendingSaves.values()) {
      clearTimeout(timer);
      run();
    }
    this.pendingSaves.clear();
    await this.s.settings.flush();
  }
}

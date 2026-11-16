import { create } from 'zustand';
import type { BookId, ServiceItem, ServicePlan } from '@lampstand/core';
import { api, cmd, q } from './api';
import i18n from '../i18n';
import { type ControlState, type DialogName, type Toast } from '../types';
import { type EditOptions } from '../types';

export const useStore = create<ControlState>((set) => ({
  live: null,
  settings: null,
  songs: [],
  themes: [],
  media: [],
  mediaPlaylists: [],
  versions: [],
  verseCounts: {},
  chapters: {},
  services: [],
  service: null,
  displays: [],
  selectedItemId: null,
  adhoc: null,
  previewCursor: null,
  editCursor: null,
  editObjectId: null,
  liveCursor: null,
  libraryTab: 'songs',
  mode: 'show',
  binTab: 'media',
  binPlaylistId: null,
  announceItemId: null,
  audioPlaylistId: null,
  controlsTab: 'audio',
  binOpen: true,
  textBarOpen: false,
  settingsPage: 'general',
  dialog: null,
  editingSongId: null,
  playbackItemId: null,
  editingThemeId: null,
  history: { canUndo: false, canRedo: false },
  toasts: [],
  saving: false,
  sidebarView: 'playlist',
  set: (p) => set(p),
}));

const get = useStore.getState;
const patch = (p: Partial<ControlState>): void => useStore.setState(p);

let toastSeq = 0;
export function toast(text: string, level: Toast['level'] = 'info'): void {
  const id = ++toastSeq;
  patch({ toasts: [...get().toasts, { id, level, text }] });
  setTimeout(
    () => patch({ toasts: get().toasts.filter((t) => t.id !== id) }),
    level === 'error' ? 7000 : 3500,
  );
}

/** User-facing text for an error: the command's own (safe) message, else a translated fallback. */
export function errorText(e: unknown, fallbackKey = 'errors.generic'): string {
  return e instanceof Error && e.message ? e.message : i18n.t(fallbackKey);
}

/**
 * Run an async action; if it fails, show the error as a toast and resolve to `undefined`.
 * One place for the "try → toast on failure" pattern every button handler needs.
 */
export async function attempt<T>(
  fn: () => Promise<T>,
  fallbackKey?: string,
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    toast(errorText(e, fallbackKey), 'error');
    return undefined;
  }
}

/** Open one of the app's dialogs (optionally setting related state, e.g. which song to edit). */
export function openDialog(
  dialog: Exclude<DialogName, null>,
  extra: Partial<ControlState> = {},
): void {
  patch({ ...extra, dialog });
}

export function closeDialog(): void {
  patch({ dialog: null });
}

export const chapterKey = (versionId: string, book: BookId, chapter: number): string =>
  `${versionId}/${book}/${chapter}`;

const inflight = new Map<string, Promise<string[]>>();
/** Load (and cache) a chapter's verses for a version. */
export function loadChapter(versionId: string, book: BookId, chapter: number): Promise<string[]> {
  const key = chapterKey(versionId, book, chapter);
  const hit = get().chapters[key];
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = q('bible.chapter', { versionId, book, chapter })
    .then((r) => {
      patch({ chapters: { ...get().chapters, [key]: r.verses } });
      return r.verses;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function loadVerseCounts(versionId: string): Promise<void> {
  if (get().verseCounts[versionId]) return;
  const counts = await q('bible.verseCounts', { versionId });
  patch({ verseCounts: { ...get().verseCounts, [versionId]: counts } });
}

export async function refresh(
  kind:
    | 'songs'
    | 'services'
    | 'themes'
    | 'media'
    | 'mediaPlaylists'
    | 'bibles'
    | 'settings'
    | 'displays'
    | 'all',
): Promise<void> {
  const all = kind === 'all';
  const tasks: Promise<void>[] = [];
  if (all || kind === 'settings')
    tasks.push(q('settings.get').then((settings) => patch({ settings })));
  if (all || kind === 'songs') tasks.push(q('songs.list').then((songs) => patch({ songs })));
  if (all || kind === 'themes') tasks.push(q('themes.list').then((themes) => patch({ themes })));
  if (all || kind === 'media') tasks.push(q('media.list').then((media) => patch({ media })));
  if (all || kind === 'mediaPlaylists')
    tasks.push(q('mediaPlaylists.list').then((mediaPlaylists) => patch({ mediaPlaylists })));
  if (all || kind === 'displays')
    tasks.push(q('displays.list').then((displays) => patch({ displays })));
  if (all || kind === 'bibles')
    tasks.push(
      q('bible.versions').then(async (versions) => {
        patch({ versions });
        await Promise.all(versions.map((v) => loadVerseCounts(v.id)));
      }),
    );
  if (all || kind === 'services')
    tasks.push(
      q('services.list').then(async (services) => {
        patch({ services });
        const current = get().service?.id ?? get().settings?.lastServiceId ?? services[0]?.id;
        if (current && !pendingSave) {
          const service = await q('services.get', { id: current });
          patch({ service: service ?? null });
        }
      }),
    );
  await Promise.all(tasks);
}

// ---------- Service editing with debounced autosave (§6.2: 500 ms) ----------
let pendingSave: ReturnType<typeof setTimeout> | null = null;
/** Read at call time (it can change while a save is awaited). */
const hasPendingSave = (): boolean => pendingSave !== null;

/**
 * Edit the current service (autosaved, undoable). Each discrete action becomes exactly one undo
 * step: any typing still waiting to be saved is committed first, so Undo never reverts more than
 * the operator's last action.
 */
export function editService(mutate: (s: ServicePlan) => ServicePlan, opts: EditOptions = {}): void {
  if (!get().service) return;
  // Commit pending typing as its own step before a discrete action (reads the pre-edit state).
  if (!opts.typing && pendingSave) void flushServiceSave();
  const current = get().service;
  if (!current) return;
  patch({ service: mutate(current), saving: true });
  if (pendingSave) clearTimeout(pendingSave);
  pendingSave = setTimeout(() => void flushServiceSave(), opts.typing ? 500 : 0);
}

/** Edit the current service's item list (autosaved, undoable). */
export function editItems(
  mutate: (items: ServiceItem[]) => ServiceItem[],
  opts?: EditOptions,
): void {
  editService((s) => ({ ...s, items: mutate(s.items) }), opts);
}

/** Replace one service item by id. */
export function updateItem<T extends ServiceItem>(
  id: string,
  mutate: (item: T) => T,
  opts?: EditOptions,
): void {
  editItems((items) => items.map((i) => (i.id === id ? mutate(i as T) : i)), opts);
}

/**
 * Change an item wherever it lives: in the service plan (saved, undoable) or, for a library
 * pick shown ad hoc, just on screen.
 */
export function patchItem<T extends ServiceItem>(
  item: T,
  change: Partial<T> | ((current: T) => Partial<T>),
): void {
  // A function reads the item as it is NOW, so quick repeated clicks never lose a step.
  const apply = (x: T): T => ({ ...x, ...(typeof change === 'function' ? change(x) : change) });
  const adhoc = get().adhoc;
  if (adhoc?.id === item.id) patch({ adhoc: apply(adhoc as T) });
  else updateItem<T>(item.id, apply);
}

/** Append an item (usually from the library or quick bar) to the service and select it. */
export function addItemToService(item: ServiceItem): void {
  editItems((items) => [...items, item]);
  patch({ adhoc: null, selectedItemId: item.id });
}

export async function flushServiceSave(): Promise<void> {
  // Nothing pending → nothing to save. Saving anyway would push a no-op step onto the undo
  // history, so Undo would "undo" that instead of the operator's real change.
  if (!pendingSave) return;
  clearTimeout(pendingSave);
  pendingSave = null;
  const s = get().service;
  if (!s) return;
  await attempt(() => cmd('service.save', { entity: s }), 'errors.saveService');
  // An edit made while this save was in flight schedules another save; stay "Saving…" for it.
  if (!hasPendingSave()) patch({ saving: false });
}

export async function openService(id: string): Promise<void> {
  await flushServiceSave();
  const service = await q('services.get', { id });
  patch({ service: service ?? null, selectedItemId: null, adhoc: null, previewCursor: null });
  await cmd('settings.update', { patch: { lastServiceId: id } });
}

export async function undo(): Promise<void> {
  await flushServiceSave();
  const r = await api.undo();
  if (!r.ok) toast(r.error.message, 'error');
}
export async function redo(): Promise<void> {
  await flushServiceSave();
  const r = await api.redo();
  if (!r.ok) toast(r.error.message, 'error');
}

/**
 * Initial load with retry. Each slice loads independently, so a failed request only leaves its
 * own slice empty; retrying with backoff means a slow or failed first request can never leave the
 * operator staring at an empty window.
 */
export async function bootstrap(attempt = 0): Promise<void> {
  try {
    await refresh('all');
    if (get().service || attempt >= 4) return;
    // A library always has at least one service after first run — not having one yet means a
    // request raced or failed, so try again.
    throw new Error('service not loaded yet');
  } catch {
    if (attempt >= 6) {
      toast(i18n.t('notice.loadFailed'), 'error');
      return;
    }
    await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
    await bootstrap(attempt + 1);
  }
}

/** Wire main → renderer events. */
export function connect(): void {
  api.onLiveState((live) => patch({ live }));
  api.onRepoChanged((kind) => void refresh(kind));
  api.onDisplaysChanged(() => void refresh('displays'));
  api.onHistoryChanged((history) => patch({ history }));
  void q('history.state').then((history) => patch({ history }));
  void q('live.get').then((live) => patch({ live }));
  window.addEventListener('beforeunload', () => void flushServiceSave());
}

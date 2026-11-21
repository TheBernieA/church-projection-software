import { newId, nowIso, type ServiceItem, type Song } from '@lampstand/core';
import { buildSongSlides, createEmptySong, editorSlides } from '@lampstand/lyrics';
import { openAdhoc } from './actions';
import { cmd } from './api';
import {
  addItemToService,
  attempt,
  flushSongSaves,
  openService,
  refresh,
  toast,
  useStore,
} from './store';
import { q } from './api';
import i18n from '../i18n';
import { type SongItem } from '../types';
import { openEditor } from './editing';
import { displayCombo, effectiveShortcuts } from './shortcuts';

/** A song as picked from the library (shown on its own, not part of the playlist). */
const libraryItem = (song: Song): SongItem => ({
  id: `adhoc-${song.id}`,
  kind: 'song',
  songId: song.id,
});

/**
 * Make a song and open it in Edit, ready to type its first slide: in a playlist (which opens, if
 * it isn't the open one) or on its own from the library.
 */
export async function createSong(o: {
  title: string;
  themeId: string | null;
  playlistId: string | null;
}): Promise<boolean> {
  const song = createEmptySong(o.title.trim() || i18n.t('song.untitled'), nowIso());
  if (o.themeId) song.themeId = o.themeId;
  if ((await attempt(() => cmd('song.save', { entity: song }), 'errors.save')) === undefined)
    return false;
  // Shown at once; the library's own refresh follows.
  const { songs, service } = useStore.getState();
  if (!songs.some((s) => s.id === song.id)) useStore.setState({ songs: [...songs, song] });
  if (o.playlistId) {
    if (service?.id !== o.playlistId) await openService(o.playlistId);
    addItemToService({ id: newId(), kind: 'song', songId: song.id });
    useStore.setState({ sidebarView: 'playlist' });
  } else {
    await openAdhoc(libraryItem(song), 'select');
    useStore.setState({ sidebarView: 'library', libraryTab: 'songs' });
  }
  openEditor(true);
  return true;
}

/** A copy of a song (a hymn, say) of the user's own, opened in Edit. */
export async function copySong(song: Song): Promise<void> {
  const now = nowIso();
  const copy: Song = { ...song, id: newId(), origin: 'user', createdAt: now, updatedAt: now };
  delete copy.hymnNumber;
  if ((await attempt(() => cmd('song.save', { entity: copy }), 'errors.save')) === undefined)
    return;
  const { songs } = useStore.getState();
  useStore.setState({ songs: [...songs, copy], sidebarView: 'library', libraryTab: 'songs' });
  await openAdhoc(libraryItem(copy), 'select');
  openEditor(true);
}

/**
 * Delete a song (Undo brings it back). From its editor (`leaveEdit`) that leaves Edit; from the
 * library it leaves Edit only if that song was the one open there.
 */
export async function deleteSong(song: Song, leaveEdit = true): Promise<void> {
  // Typing still waiting to be saved goes first, so a late save can't bring the song back.
  await flushSongSaves();
  if ((await attempt(() => cmd('song.delete', { id: song.id }), 'errors.save')) === undefined)
    return;
  const { adhoc, songs, mode } = useStore.getState();
  const wasOpen = adhoc?.kind === 'song' && adhoc.songId === song.id;
  // Gone from the list at once; the library's own refresh follows.
  useStore.setState({
    songs: songs.filter((s) => s.id !== song.id),
    ...(wasOpen ? { adhoc: null } : {}),
    ...(leaveEdit || (wasOpen && mode === 'edit') ? { mode: 'show' as const } : {}),
  });
  toast(
    i18n.t('song.deleted', {
      title: song.title,
      key: displayCombo(effectiveShortcuts().undo),
    }),
  );
}

/**
 * Where the song editor opens: on the group of the slide last picked in the slides (whose
 * numbering follows the arrangement), else at the start.
 */
export function editorStart(song: Song, item: SongItem, maxLines: number): number {
  const cursor = useStore.getState().editCursor;
  if (cursor?.itemId !== item.id) return 0;
  const shown = buildSongSlides(song, { arrangementId: item.arrangementId, maxLines });
  const sectionId = shown[cursor.index]?.sectionId;
  return Math.max(
    0,
    editorSlides(song).findIndex((s) => s.sectionId === sectionId),
  );
}

/**
 * Add an item (a song, a verse, media…) to the end of a playlist: the open one directly (undoable like any edit), or
 * another one saved as it is, without opening it.
 */
export async function addToPlaylist(
  item: ServiceItem,
  title: string,
  playlistId: string,
): Promise<void> {
  const { service } = useStore.getState();
  if (service?.id === playlistId) {
    if (addItemToService(item)) toast(i18n.t('library.addedTo', { title, playlist: service.name }));
    return;
  }
  const plan = await attempt(() => q('services.get', { id: playlistId }), 'errors.save');
  if (!plan) return;
  const next = { ...plan, items: [...plan.items, item] };
  if (
    (await attempt(() => cmd('service.save', { entity: next }), 'errors.saveService')) === undefined
  )
    return;
  void refresh('services');
  toast(i18n.t('library.addedTo', { title, playlist: plan.name }));
}

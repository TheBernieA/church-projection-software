import { MEDIA_PLAYLIST_SCHEMA_VERSION, newId, nowIso, type MediaPlaylist } from '@lampstand/core';
import { useMemo } from 'react';
import { cmd, q } from './api';
import { attempt, toast, useStore } from './store';
import i18n from '../i18n';

const find = (id: string): MediaPlaylist | undefined =>
  useStore.getState().mediaPlaylists.find((p) => p.id === id);

/**
 * Save a media playlist (undoable, like every library edit). The local copy updates at once,
 * so quick edits in a row (two drops, add then reorder) each build on the last.
 */
function save(entity: MediaPlaylist): Promise<unknown> {
  const list = useStore.getState().mediaPlaylists;
  useStore.setState({
    mediaPlaylists: list.some((p) => p.id === entity.id)
      ? list.map((p) => (p.id === entity.id ? entity : p))
      : [...list, entity],
  });
  return attempt(() => cmd('mediaPlaylist.save', { entity }), 'errors.save');
}

/** A name not used by another media playlist: "New playlist", "New playlist 2"… */
function freshName(kind: MediaPlaylist['kind']): string {
  const base = i18n.t('mediaBin.newPlaylistName');
  const taken = new Set(
    useStore
      .getState()
      .mediaPlaylists.filter((p) => p.kind === kind)
      .map((p) => p.name),
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/**
 * Create an empty playlist (optionally holding `mediaIds`) and open it: a media playlist in the
 * media bin, or an audio playlist in the Audio tab.
 */
export async function createMediaPlaylist(
  mediaIds: string[] = [],
  kind: MediaPlaylist['kind'] = 'media',
): Promise<string> {
  const now = nowIso();
  const entity: MediaPlaylist = {
    id: newId(),
    schemaVersion: MEDIA_PLAYLIST_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    name: freshName(kind),
    kind,
    mediaIds: [...new Set(mediaIds)],
  };
  await save(entity);
  if (kind === 'audio') useStore.setState({ audioPlaylistId: entity.id });
  else useStore.setState({ binTab: 'playlist', binPlaylistId: entity.id });
  return entity.id;
}

export async function renameMediaPlaylist(id: string, name: string): Promise<void> {
  const p = find(id);
  const clean = name.trim().slice(0, 120);
  if (!p || !clean || clean === p.name) return;
  await save({ ...p, name: clean });
}

export async function deleteMediaPlaylist(id: string): Promise<void> {
  const p = find(id);
  if (!p) return;
  await attempt(() => cmd('mediaPlaylist.delete', { id }), 'errors.save');
  const s = useStore.getState();
  if (s.binPlaylistId === id) useStore.setState({ binTab: 'media', binPlaylistId: null });
  if (s.audioPlaylistId === id) useStore.setState({ audioPlaylistId: null });
  // The media itself stays in the library; only the grouping goes.
  toast(i18n.t('mediaBin.deleted', { name: p.name }));
}

/** Add media to the end of a playlist; media already in it stays where it is. */
export async function addToMediaPlaylist(id: string, mediaIds: string[]): Promise<void> {
  const p = find(id);
  if (!p) return;
  const add = mediaIds.filter((m) => !p.mediaIds.includes(m));
  if (!add.length) return;
  await save({ ...p, mediaIds: [...p.mediaIds, ...add] });
  toast(i18n.t('mediaBin.added', { count: add.length, name: p.name }));
}

export async function removeFromMediaPlaylist(id: string, mediaId: string): Promise<void> {
  const p = find(id);
  if (!p) return;
  await save({ ...p, mediaIds: p.mediaIds.filter((m) => m !== mediaId) });
}

/**
 * Put one piece of media at `index` in a playlist: a reorder when it's already there, an
 * insert when it's new (a drop between tiles). One save either way.
 */
export async function placeInMediaPlaylist(
  id: string,
  mediaId: string,
  index: number,
): Promise<void> {
  const p = find(id);
  if (!p) return;
  const rest = p.mediaIds.filter((m) => m !== mediaId);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, mediaId);
  await save({ ...p, mediaIds: rest });
}

/** The playlists of one kind (media bin or Audio tab), stable between renders. */
export function usePlaylists(kind: MediaPlaylist['kind']): MediaPlaylist[] {
  const all = useStore((s) => s.mediaPlaylists);
  return useMemo(() => all.filter((p) => p.kind === kind), [all, kind]);
}

/**
 * Import pictures, videos or audio into the library (or user backgrounds); when a playlist is
 * open they're added to it too.
 */
export async function importMedia(
  opts: { asBackground?: boolean; playlistId?: string | null } = {},
): Promise<void> {
  const r = await attempt(
    () => q('media.import', { asBackground: opts.asBackground ?? false }),
    'errors.import',
  );
  if (!r) return;
  if (r.imported) toast(i18n.t('media.imported', { count: r.imported }));
  if (r.rejected) toast(i18n.t('media.rejected', { count: r.rejected }), 'warning');
  if (opts.playlistId && r.ids.length) await addToMediaPlaylist(opts.playlistId, r.ids);
}

import { nowIso, type Song } from '@lampstand/core';
import { decodeTextFile, parseSongFile, songFromImport } from '@lampstand/lyrics';
import { openAdhoc } from './actions';
import { cmd, q } from './api';
import { attempt, toast, useStore } from './store';
import i18n from '../i18n';

/**
 * Song files into the library: SongSelect downloads (lyrics .txt, .usr, ChordPro), ChordPro,
 * OpenLyrics, OpenSong and plain text. Each song is its own save, so Undo takes them back.
 */
async function importTexts(
  files: { name: string; text: string }[],
  skipped: string[],
): Promise<void> {
  const unread = [...skipped];
  const saved: Song[] = [];
  const now = nowIso();
  for (const f of files) {
    const parsed = parseSongFile(f.name, f.text);
    if (!parsed) {
      unread.push(f.name);
      continue;
    }
    const song = songFromImport(parsed, now);
    const ok = await attempt(() => cmd<Song>('song.save', { entity: song }), 'errors.import');
    if (ok === undefined) unread.push(f.name);
    else saved.push(song);
  }
  if (saved.length) {
    const { songs } = useStore.getState();
    const known = new Set(songs.map((s) => s.id));
    useStore.setState({
      songs: [...songs, ...saved.filter((s) => !known.has(s.id))],
      sidebarView: 'library',
      libraryTab: 'songs',
    });
    // One song: open it, ready to check.
    if (saved.length === 1 && saved[0])
      await openAdhoc({ id: `adhoc-${saved[0].id}`, kind: 'song', songId: saved[0].id }, 'select');
    toast(
      saved.length === 1
        ? i18n.t('songImport.importedOne', { title: saved[0]?.title ?? '' })
        : i18n.t('songImport.imported', { count: saved.length }),
    );
  }
  if (unread.length)
    toast(
      i18n.t('songImport.unread', { count: unread.length, names: unread.slice(0, 3).join(', ') }),
      saved.length ? 'warning' : 'error',
    );
}

/** Pick song files and import them. */
export async function importSongFiles(): Promise<void> {
  const r = await attempt(() => q('songs.importFiles'), 'errors.import');
  if (!r || (!r.files.length && !r.skipped.length)) return;
  await importTexts(r.files, r.skipped);
}

/** Song files dropped on the song list. */
export async function importDroppedSongFiles(files: File[]): Promise<void> {
  const read: { name: string; text: string }[] = [];
  const skipped: string[] = [];
  for (const f of files.slice(0, 500)) {
    if (f.size > 2 * 1024 * 1024) skipped.push(f.name);
    else read.push({ name: f.name, text: decodeTextFile(new Uint8Array(await f.arrayBuffer())) });
  }
  await importTexts(read, skipped);
}

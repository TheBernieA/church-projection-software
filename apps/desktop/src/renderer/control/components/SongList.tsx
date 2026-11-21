import { useMemo, useRef, useState, type DragEvent } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ExternalLink, FileUp, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { newId, type Song } from '@lampstand/core';
import { stripChords } from '@lampstand/lyrics';
import { Typography, typographyClass, Button } from '@lampstand/ui';
import { openAdhoc } from '../lib/actions';
import { libraryDragSource } from '../lib/libraryDrag';
import { deleteSong } from '../lib/songs';
import { importDroppedSongFiles, importSongFiles } from '../lib/songImport';
import { addItemToService, useStore } from '../lib/store';
import { SoonFeature } from './Soon';
import { ITEM_CLASS, MENU_CLASS } from './menu';
import { AddToPlaylistMenu, SongMenu } from './song/SongRowMenus';

const SONGSELECT_URL = 'https://songselect.ccli.com/';
const CHIP = `!h-6 !px-1.5 ${typographyClass({ size: 11, important: true })}`;

/** Files (not text or a library item) being dragged in. */
const hasFiles = (e: DragEvent): boolean => e.dataTransfer.types.includes('Files');

function haystack(s: Song): string {
  return [
    s.title,
    ...s.alternateTitles,
    ...s.authors,
    s.ccliNumber ?? '',
    ...(s.hymnNumber?.map((h) => `#${h.number}`) ?? []),
    ...s.tags,
    stripChords(s.sections[0]?.lines[0] ?? ''),
  ]
    .join(' ')
    .toLowerCase();
}

/** Virtualized song/hymn list (§15.4) with instant local filtering. */
export function SongList({ hymns }: { hymns: boolean }) {
  const { t } = useTranslation();
  const songs = useStore((s) => s.songs);
  const selectedItem = useStore((s) => s.adhoc);
  const [filter, setFilter] = useState('');
  const parent = useRef<HTMLDivElement>(null);
  const addToService = addItemToService;
  /** The row whose ⋯ menu is open (a right-click on a row opens it). */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  // Song files dropped anywhere on the list are imported (not the hymns: those are read-only).
  const drop = hymns
    ? {}
    : {
        onDragOver: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setDropping(true);
        },
        onDragLeave: (e: DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
        },
        onDrop: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDropping(false);
          void importDroppedSongFiles([...e.dataTransfer.files]);
        },
      };

  // Sorted, with each song's searchable text, once per library change (not per keystroke).
  const sorted = useMemo(() => {
    const base = songs.filter((s) => (s.origin === 'hymnal') === hymns);
    const list = hymns
      ? base.sort(
          (a, b) => Number(a.hymnNumber?.[0]?.number ?? 0) - Number(b.hymnNumber?.[0]?.number ?? 0),
        )
      : base.sort((a, b) => a.title.localeCompare(b.title));
    return list.map((song) => ({ song, text: haystack(song) }));
  }, [songs, hymns]);
  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase().replace(/^#/, '');
    const hits = f
      ? sorted.filter((r) => r.text.includes(f) || r.song.hymnNumber?.some((h) => h.number === f))
      : sorted;
    return hits.map((r) => r.song);
  }, [sorted, filter]);

  // TanStack Virtual returns non-memoizable functions; fine since we don't use the React Compiler.
  // eslint-disable-next-line react-hooks/incompatible-library
  const v = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parent.current,
    estimateSize: () => 52,
    overscan: 10,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-2 px-3 pb-2">
        <div className="relative flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]"
            aria-hidden
          />
          <input
            className="field h-8 !pl-8"
            placeholder={t('library.filter')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label={t('library.filter')}
          />
        </div>
      </div>
      {!hymns && (
        // Ways to bring songs in.
        <div className="flex flex-wrap items-center gap-1 px-3 pb-2">
          <Button
            size="xs"
            variant="ghost"
            className={CHIP}
            icon={<FileUp size={12} />}
            title={t('library.importHint')}
            onClick={() => void importSongFiles()}
          >
            {t('library.importFile')}
          </Button>
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
              <Button size="xs" variant="ghost" className={CHIP}>
                {t('songImport.songselect')}
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="start"
                sideOffset={4}
                collisionPadding={8}
                className={`${MENU_CLASS} max-w-[300px]`}
              >
                <DropdownMenu.Item
                  className={ITEM_CLASS}
                  onSelect={() => window.open(SONGSELECT_URL)}
                >
                  <ExternalLink size={13} />
                  {t('songImport.songselectOpen')}
                </DropdownMenu.Item>
                <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => void importSongFiles()}>
                  <FileUp size={13} />
                  {t('songImport.songselectImport')}
                </DropdownMenu.Item>
                <Typography as="p" variant="caption" leading="snug" className="px-2.5 pb-1.5 pt-1">
                  {t('songImport.songselectHelp')}
                </Typography>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <SoonFeature id="multitracks" label="MultiTracks" className={CHIP} />
        </div>
      )}
      {rows.length === 0 && (
        <Typography as="p" size={13} tone="muted" leading="relaxed" className="px-5 py-3">
          {hymns && !filter ? t('library.noHymnals') : t('library.noResults')}
        </Typography>
      )}
      <div
        ref={parent}
        className={`relative min-h-0 flex-1 overflow-y-auto px-2 pb-2 ${dropping ? 'rounded-[8px] outline-dashed outline-2 -outline-offset-4 outline-[var(--accent)]' : ''}`}
        {...drop}
      >
        {dropping && (
          <Typography
            size={13}
            weight="semibold"
            className="pointer-events-none sticky top-2 z-10 mx-auto block w-fit rounded-full bg-[var(--surface-3)] px-3 py-1 text-[var(--accent)]"
          >
            {t('songImport.dropHere')}
          </Typography>
        )}
        <div style={{ height: v.getTotalSize(), position: 'relative' }}>
          {v.getVirtualItems().map((row) => {
            const s = rows[row.index];
            if (!s) return null;
            const item = { id: `adhoc-${s.id}`, kind: 'song' as const, songId: s.id };
            const active = selectedItem?.kind === 'song' && selectedItem.songId === s.id;
            return (
              <div
                key={s.id}
                className="group absolute left-0 right-0 flex items-center gap-1 pr-1"
                style={{ top: row.start, height: row.size }}
              >
                <Button
                  variant="bare"

                  className={`flex h-[46px] min-w-0 flex-1 items-center gap-3 rounded-[8px] px-2.5 text-left transition-colors ${active ? 'bg-[var(--surface-3)]' : 'hover:bg-[var(--surface-2)]'}`}
                  onClick={() => void openAdhoc(item, 'select')}
                  onDoubleClick={() => addToService({ ...item, id: newId() })}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenuFor(s.id);
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === 'Delete' || e.key === 'Backspace') && s.origin !== 'hymnal') {
                      e.preventDefault();
                      void deleteSong(s, false);
                    }
                  }}
                  {...libraryDragSource(() => item)}
                >
                  {s.hymnNumber?.[0] && (
                    <Typography
                      size={13}
                      weight="semibold"
                      tabular
                      className="w-8 shrink-0 text-right text-[var(--accent)]"
                    >
                      {s.hymnNumber[0].number}
                    </Typography>
                  )}
                  <Typography leading="tight" className="flex min-w-0 flex-col">
                    <Typography variant="label" truncate>
                      {s.title}
                    </Typography>
                    <Typography variant="caption" truncate>
                      {stripChords(s.sections[0]?.lines[0] ?? '')}
                    </Typography>
                  </Typography>
                </Button>
                <AddToPlaylistMenu song={s} />
                <SongMenu
                  song={s}
                  open={menuFor === s.id}
                  onOpenChange={(o) => setMenuFor(o ? s.id : null)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

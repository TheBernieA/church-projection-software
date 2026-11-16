import { useMemo, useRef, useState } from 'react';
import { ListPlus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { newId, type Song } from '@lampstand/core';
import { stripChords } from '@lampstand/lyrics';
import { IconButton } from '@lampstand/ui';
import { openAdhoc } from '../lib/actions';
import { libraryDragSource } from '../lib/libraryDrag';
import { addItemToService, useStore } from '../lib/store';
import { SoonFeature } from './Soon';
import { REVEAL } from './cards';

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

  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase().replace(/^#/, '');
    const base = songs.filter((s) => (s.origin === 'hymnal') === hymns);
    const sorted = hymns
      ? base.sort(
          (a, b) => Number(a.hymnNumber?.[0]?.number ?? 0) - Number(b.hymnNumber?.[0]?.number ?? 0),
        )
      : base.sort((a, b) => a.title.localeCompare(b.title));
    if (!f) return sorted;
    return sorted.filter(
      (s) => haystack(s).includes(f) || s.hymnNumber?.some((h) => h.number === f),
    );
  }, [songs, filter, hymns]);

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
        // Ways to bring songs in, coming soon.
        <div className="flex flex-wrap items-center gap-1 px-3 pb-2">
          <SoonFeature
            id="song-import"
            label={t('library.importFile')}
            className="!h-6 !px-1.5 !text-[11px]"
          />
          <SoonFeature id="songselect" label="SongSelect" className="!h-6 !px-1.5 !text-[11px]" />
          <SoonFeature id="multitracks" label="MultiTracks" className="!h-6 !px-1.5 !text-[11px]" />
        </div>
      )}
      {rows.length === 0 && (
        <p className="px-5 py-3 text-[13px] leading-relaxed text-[var(--text-3)]">
          {hymns && !filter ? t('library.noHymnals') : t('library.noResults')}
        </p>
      )}
      <div ref={parent} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
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
                <button
                  type="button"
                  className={`flex h-[46px] min-w-0 flex-1 items-center gap-3 rounded-[8px] px-2.5 text-left transition-colors ${active ? 'bg-[var(--surface-3)]' : 'hover:bg-[var(--surface-2)]'}`}
                  onClick={() => void openAdhoc(item, 'select')}
                  onDoubleClick={() => addToService({ ...item, id: newId() })}
                  {...libraryDragSource(() => item)}
                >
                  {s.hymnNumber?.[0] && (
                    <span className="tnum w-8 shrink-0 text-right text-[13px] font-semibold text-[var(--accent)]">
                      {s.hymnNumber[0].number}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-[13px] font-medium">{s.title}</span>
                    <span className="truncate text-[12px] text-[var(--text-3)]">
                      {stripChords(s.sections[0]?.lines[0] ?? '')}
                    </span>
                  </span>
                </button>
                <IconButton
                  size="xs"
                  className={REVEAL}
                  aria-label={t('library.addToService')}
                  onClick={() => addToService({ ...item, id: newId() })}
                >
                  <ListPlus size={15} />
                </IconButton>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

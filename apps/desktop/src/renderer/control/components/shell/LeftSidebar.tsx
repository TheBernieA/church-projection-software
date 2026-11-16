import { BookMarked, ListMusic, Music2, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { createService } from '../../lib/services';
import { openDialog, openService, useStore } from '../../lib/store';
import { ServicePanel } from '../ServicePanel';
import { SongList } from '../SongList';
import { BinNav } from './Bin';
import { Splitter, usePaneSize } from './Splitter';
import { Typography, IconButton, NavItem } from '@lampstand/ui';

/** Small-caps outline heading with an optional "+" on the right. */
function OutlineHeading({
  title,
  addLabel,
  onAdd,
}: {
  title: string;
  addLabel?: string;
  onAdd?: () => void;
}) {
  return (
    <div className="flex h-7 items-center justify-between pl-3 pr-1.5 pt-1">
      <Typography as="h2" variant="overline">
        {title}
      </Typography>
      {onAdd && (
        <IconButton size="3xs" variant="quiet" aria-label={addLabel ?? title} onClick={onAdd}>
          <Plus size={14} />
        </IconButton>
      )}
    </div>
  );
}

/** One row of the outline: a library or a playlist. Selected rows are blue, as in a Finder list. */
function OutlineRow({
  icon,
  label,
  selected,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <NavItem
      aria-pressed={selected}
      selected={selected}
      onClick={onClick}
      icon={<span className="flex text-[var(--accent)]">{icon}</span>}
      label={label}
      className="w-[calc(100%-12px)]"
    />
  );
}

/**
 * Left sidebar, operator-console style: an outline of libraries and playlists on top, and
 * below it the contents of whichever is selected (a library's songs, or the playlist's items).
 */
export function LeftSidebar({ binHeight }: { binHeight: number | null }) {
  const { t } = useTranslation();
  const view = useStore((s) => s.sidebarView);
  const tab = useStore((s) => s.libraryTab);
  const services = useStore((s) => s.services);
  const current = useStore((s) => s.service?.id);
  const outline = usePaneSize('libraryHeight', 220, 110, 520);
  const playlists = services.filter((s) => !s.isTemplate);

  const library = (id: 'songs' | 'hymns') => () =>
    useStore.setState({ sidebarView: 'library', libraryTab: id });

  return (
    // The whole sidebar is the "Library" region: the outline and whatever it lists below.
    <section aria-label={t('sidebar.library')} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col overflow-y-auto pb-2" style={{ height: outline.size }}>
        <OutlineHeading
          title={t('sidebar.library')}
          addLabel={t('sidebar.newSong')}
          onAdd={() => openDialog('song', { editingSongId: null })}
        />
        <OutlineRow
          icon={<Music2 size={14} />}
          label={t('sidebar.songs')}
          selected={view === 'library' && tab === 'songs'}
          onClick={library('songs')}
        />
        <OutlineRow
          icon={<BookMarked size={14} />}
          label={t('sidebar.hymns')}
          selected={view === 'library' && tab === 'hymns'}
          onClick={library('hymns')}
        />
        <OutlineHeading
          title={t('sidebar.playlists')}
          addLabel={t('sidebar.newPlaylist')}
          onAdd={() =>
            void createService().then(() => useStore.setState({ sidebarView: 'playlist' }))
          }
        />
        {playlists.length === 0 && (
          <Typography as="p" variant="caption" className="px-4 py-1">
            {t('sidebar.noPlaylists')}
          </Typography>
        )}
        {playlists.map((p) => (
          <OutlineRow
            key={p.id}
            icon={<ListMusic size={14} />}
            label={p.name}
            selected={view === 'playlist' && current === p.id}
            onClick={() => {
              useStore.setState({ sidebarView: 'playlist' });
              if (current !== p.id) void openService(p.id);
            }}
          />
        ))}
      </div>
      <Splitter axis="y" pane={outline} label={t('layout.resizeLibrary')} />
      <div className="flex min-h-0 flex-1 flex-col pt-2">
        {view === 'library' ? <SongList hymns={tab === 'hymns'} /> : <ServicePanel />}
      </div>
      {/* With the media bin open, its sidebar sits here, level with the bin beside it. */}
      {binHeight !== null && (
        <>
          <div aria-hidden className="h-px shrink-0 bg-[var(--divider)]" />
          <div className="flex shrink-0 flex-col" style={{ height: binHeight }}>
            <BinNav />
          </div>
        </>
      )}
    </section>
  );
}

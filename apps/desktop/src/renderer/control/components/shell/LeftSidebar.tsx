import { BookMarked, ListMusic, Music2, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { createService } from '../../lib/services';
import { openDialog, openService, useStore } from '../../lib/store';
import { ServicePanel } from '../ServicePanel';
import { SongList } from '../SongList';
import { Splitter, usePaneSize } from './Splitter';

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
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]">
        {title}
      </h2>
      {onAdd && (
        <button
          type="button"
          aria-label={addLabel}
          title={addLabel}
          onClick={onAdd}
          className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-[4px] text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]"
        >
          <Plus size={14} />
        </button>
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
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`mx-1.5 flex h-[26px] w-[calc(100%-12px)] cursor-pointer items-center gap-2 rounded-[4px] px-2 text-left text-[13px] transition-colors ${
        selected
          ? 'bg-[var(--select)] text-white [&_svg]:text-white'
          : 'text-[var(--text-1)] hover:bg-[var(--surface-2)]'
      }`}
    >
      <span className="flex shrink-0 text-[var(--accent)]">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * Left sidebar, operator-console style: an outline of libraries and playlists on top, and
 * below it the contents of whichever is selected (a library's songs, or the playlist's items).
 */
export function LeftSidebar() {
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
          <p className="px-4 py-1 text-[12px] text-[var(--text-3)]">{t('sidebar.noPlaylists')}</p>
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
    </section>
  );
}

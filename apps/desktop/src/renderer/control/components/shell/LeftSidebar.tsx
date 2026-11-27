import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  BookMarked,
  ChevronRight,
  Copy,
  FileUp,
  LayoutTemplate,
  ListMusic,
  MoreHorizontal,
  Music2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { importSlides } from '../../lib/importSlides';
import {
  createService,
  deleteService,
  duplicateService,
  renameService,
  serviceFromTemplate,
} from '../../lib/services';
import { displayCombo, effectiveShortcuts } from '../../lib/shortcuts';
import { ITEM_CLASS, MENU_CLASS, SEPARATOR_CLASS } from '../menu';
import { openDialog, openService, useStore } from '../../lib/store';
import { ServicePanel } from '../ServicePanel';
import { SongList } from '../SongList';
import { BinNav } from './Bin';
import { Splitter, usePaneSize } from './Splitter';
import { Typography, IconButton, NavItem } from '@lampstand/ui';

/** Small-caps outline heading with an optional "+" (or a menu of its own) on the right. */
function OutlineHeading({
  title,
  addLabel,
  onAdd,
  menu,
}: {
  title: string;
  addLabel?: string;
  onAdd?: () => void;
  menu?: ReactNode;
}) {
  return (
    <div className="flex h-7 items-center justify-between pl-3 pr-1.5 pt-1">
      <Typography as="h2" variant="overline">
        {title}
      </Typography>
      {menu}
      {onAdd && (
        <IconButton size="3xs" variant="quiet" aria-label={addLabel ?? title} onClick={onAdd}>
          <Plus size={14} />
        </IconButton>
      )}
    </div>
  );
}

/** Open a new playlist (and show it in the sidebar). */
const newPlaylist = (from?: () => Promise<void>): void =>
  void (from ? from() : createService()).then(() => useStore.setState({ sidebarView: 'playlist' }));

/**
 * The library's "+": a new song (⌘N), a new playlist, empty or from a template, or slides
 * imported from a file.
 */
function LibraryAddMenu() {
  const { t } = useTranslation();
  const templates = useStore((s) => s.services).filter((p) => p.isTemplate);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton size="3xs" variant="quiet" aria-label={t('sidebar.add')}>
          <Plus size={14} />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} className={`${MENU_CLASS} w-[240px]`}>
          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => openDialog('newSong')}>
            <Music2 size={14} />
            <span className="flex-1">{t('sidebar.newSong')}</span>
            <Typography size={11} tone="muted">
              {displayCombo(effectiveShortcuts().newSong)}
            </Typography>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => openDialog('lyrics')}>
            <Wand2 size={14} />
            {t('lyricsAi.menu')}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={SEPARATOR_CLASS} />
          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => newPlaylist()}>
            <ListMusic size={14} />
            {t('sidebar.newPlaylist')}
          </DropdownMenu.Item>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger
              className={ITEM_CLASS}
              disabled={templates.length === 0}
              title={templates.length ? undefined : t('sidebar.noTemplates')}
            >
              <LayoutTemplate size={14} />
              <span className="flex-1">{t('sidebar.fromTemplate')}</span>
              <ChevronRight size={13} />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent sideOffset={4} className={`${MENU_CLASS} w-[220px]`}>
                {templates.map((p) => (
                  <DropdownMenu.Item
                    key={p.id}
                    className={ITEM_CLASS}
                    onSelect={() => newPlaylist(() => serviceFromTemplate(p.id))}
                  >
                    {p.name.replace(/ \(template\)$/, '')}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => openDialog('planService')}>
            <Sparkles size={14} />
            {t('planner.menu')}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={SEPARATOR_CLASS} />
          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => void importSlides()}>
            <FileUp size={14} />
            {t('import.button')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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
 * A playlist's name being typed, in place of its row: Enter or clicking away keeps it, Esc
 * leaves the old name.
 */
function PlaylistNameInput({
  name,
  onDone,
}: {
  name: string;
  onDone: (name: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <input
      autoFocus
      aria-label={t('sidebar.playlistName')}
      defaultValue={name}
      maxLength={200}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => onDone(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.preventDefault(); // cancels here; it never reaches the show
          onDone(null);
        }
      }}
      className="field mx-1.5 my-0.5 !h-8 w-[calc(100%-12px)]"
    />
  );
}

/** A playlist's own menu (shown on hover, and while it is the open one): rename, duplicate, delete. */
function PlaylistMenu({
  id,
  name,
  selected,
  onRename,
}: {
  id: string;
  name: string;
  selected: boolean;
  onRename: () => void;
}) {
  const { t } = useTranslation();
  const renameNext = useRef(false);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton
          size="3xs"
          variant="quiet"
          aria-label={t('sidebar.playlistMenu', { name })}
          className={`absolute right-4 top-1/2 -translate-y-1/2 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 ${
            selected ? '!text-white opacity-100' : ''
          }`}
        >
          <MoreHorizontal size={14} />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className={MENU_CLASS}
          // Rename picked: the name box takes the focus, not the menu button.
          onCloseAutoFocus={(e) => {
            if (!renameNext.current) return;
            renameNext.current = false;
            e.preventDefault();
            onRename();
          }}
        >
          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => (renameNext.current = true)}>
            <Pencil size={14} />
            {t('sidebar.rename')}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => void duplicateService(id)}>
            <Copy size={14} />
            {t('sidebar.duplicate')}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={`${ITEM_CLASS} !text-[var(--tally-program)]`}
            onSelect={() => void deleteService(id, name)}
          >
            <Trash2 size={14} />
            {t('sidebar.delete')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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
  // The media sidebar has its own height, whatever the bin beside it does (drag the line above it).
  const mediaNav = usePaneSize('mediaNavHeight', 340, 120, 720);
  const playlists = services.filter((s) => !s.isTemplate);
  /** The playlist whose name is being typed. */
  const [renaming, setRenaming] = useState<string | null>(null);

  const library = (id: 'songs' | 'hymns') => () =>
    useStore.setState({ sidebarView: 'library', libraryTab: id });

  return (
    // The whole sidebar is the "Library" region: the outline and whatever it lists below.
    <section aria-label={t('sidebar.library')} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col overflow-y-auto pb-2" style={{ height: outline.size }}>
        <OutlineHeading title={t('sidebar.library')} menu={<LibraryAddMenu />} />
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
          onAdd={() => newPlaylist()}
        />
        {playlists.length === 0 && (
          <Typography as="p" variant="caption" className="px-4 py-1">
            {t('sidebar.noPlaylists')}
          </Typography>
        )}
        {playlists.map((p) => {
          const selected = view === 'playlist' && current === p.id;
          return (
            <div
              key={p.id}
              className="group relative"
              // Double-click the name to rename it.
              onDoubleClick={() => setRenaming(p.id)}
            >
              {renaming === p.id ? (
                <PlaylistNameInput
                  name={p.name}
                  onDone={(name) => {
                    setRenaming(null);
                    if (name !== null) void renameService(p.id, name);
                  }}
                />
              ) : (
                <>
                  <OutlineRow
                    icon={<ListMusic size={14} />}
                    label={p.name}
                    selected={selected}
                    onClick={() => {
                      useStore.setState({ sidebarView: 'playlist' });
                      if (current !== p.id) void openService(p.id);
                    }}
                  />
                  <PlaylistMenu
                    id={p.id}
                    name={p.name}
                    selected={selected}
                    onRename={() => setRenaming(p.id)}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
      <Splitter axis="y" pane={outline} label={t('layout.resizeLibrary')} />
      <div className="flex min-h-0 flex-1 flex-col pt-2">
        {view === 'library' ? <SongList hymns={tab === 'hymns'} /> : <ServicePanel />}
      </div>
      {/* With the media bin open, its sidebar sits here, sized on its own (drag the line above). */}
      {binHeight !== null && (
        <>
          <Splitter axis="y" pane={mediaNav} invert label={t('layout.resizeMediaNav')} />
          <div className="flex shrink-0 flex-col" style={{ height: mediaNav.size }}>
            <BinNav />
          </div>
        </>
      )}
    </section>
  );
}

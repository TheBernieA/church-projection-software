import { useMemo, useState, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Ellipsis,
  Film,
  Image as ImageIcon,
  Images,
  Music,
  ListVideo,
  Pencil,
  Plus,
  Store,
  Trash2,
  Video,
  Wallpaper,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MediaPlaylist } from '@lampstand/core';
import { IconButton, NavItem, Typography } from '@lampstand/ui';
import { isLibraryDrag, readLibraryDrop } from '../../lib/libraryDrag';
import {
  addToMediaPlaylist,
  createMediaPlaylist,
  deleteMediaPlaylist,
  renameMediaPlaylist,
  usePlaylists,
} from '../../lib/mediaPlaylists';
import { useStore } from '../../lib/store';
import { BackgroundsPanel } from '../MediaPanel';
import { inMediaBin, MediaBrowser } from '../media/MediaBrowser';
import { VideoInputs } from '../media/VideoInputs';
import { StockMedia } from '../media/StockMedia';
import { ITEM_CLASS, MENU_CLASS } from '../menu';
import { type BinTab } from '../../types';

const LIBRARY: { tab: BinTab; icon: LucideIcon }[] = [
  { tab: 'media', icon: Images },
  { tab: 'images', icon: ImageIcon },
  { tab: 'videos', icon: Film },
  { tab: 'audio', icon: Music },
  { tab: 'backgrounds', icon: Wallpaper },
];
const SOURCES: { tab: BinTab; icon: LucideIcon }[] = [
  { tab: 'video-input', icon: Video },
  { tab: 'stock-media', icon: Store },
];

const Count = ({ n }: { n: number }) =>
  n > 0 ? (
    <Typography size={11} tabular aria-hidden className="opacity-70">
      {n}
    </Typography>
  ) : null;

function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex h-7 items-center justify-between pl-3 pr-1.5 pt-1.5">
      <Typography as="h2" variant="overline">
        {title}
      </Typography>
      {action}
    </div>
  );
}

/**
 * One media playlist in the sidebar: click to open, drop media on it to add, double-click (or
 * the "…" menu) to rename, and delete from the menu.
 */
function PlaylistRow({ p, count }: { p: MediaPlaylist; count: number }) {
  const { t } = useTranslation();
  const open = useStore((s) => s.binTab === 'playlist' && s.binPlaylistId === p.id);
  const [renaming, setRenaming] = useState(false);
  const [over, setOver] = useState(false);

  if (renaming)
    return (
      <input
        autoFocus
        aria-label={t('mediaBin.rename')}
        defaultValue={p.name}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          setRenaming(false);
          void renameMediaPlaylist(p.id, e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setRenaming(false);
        }}
        className="field mx-1.5 !h-[26px] !w-[calc(100%-12px)] !px-2"
      />
    );

  return (
    <div
      className={`group relative rounded-[4px] ${over ? 'shadow-[inset_0_0_0_2px_var(--select)]' : ''}`}
      onDragOver={(e) => {
        if (!isLibraryDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!isLibraryDrag(e)) return;
        e.preventDefault();
        const dropped = readLibraryDrop(e);
        if (dropped?.kind === 'media') void addToMediaPlaylist(p.id, [dropped.mediaId]);
      }}
    >
      <NavItem
        aria-pressed={open}
        selected={open}
        onClick={() => useStore.setState({ binTab: 'playlist', binPlaylistId: p.id })}
        onDoubleClick={() => setRenaming(true)}
        icon={<ListVideo size={14} className="text-[var(--accent)]" />}
        label={p.name}
        trailing={<Count n={count} />}
        className="w-[calc(100%-12px)] pr-7"
      />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <IconButton
            size="3xs"
            variant="quiet"
            aria-label={t('mediaBin.playlistMenu', { name: p.name })}
            className={`absolute right-2.5 top-[3px] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 ${open ? '!text-white' : ''}`}
          >
            <Ellipsis size={13} />
          </IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={4} className={MENU_CLASS}>
            <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => setRenaming(true)}>
              <Pencil size={14} />
              {t('mediaBin.rename')}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={ITEM_CLASS}
              onSelect={() => void deleteMediaPlaylist(p.id)}
            >
              <Trash2 size={14} />
              {t('mediaBin.deletePlaylist')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

/**
 * The media sidebar, in the left column under the playlist (as in a media-library app): the
 * library views (all media, pictures, videos, audio, backgrounds), the operator's media
 * playlists, and the sources (cameras, stock media). Its top lines up with the media browser's.
 */
export function BinNav() {
  const { t } = useTranslation();
  const tab = useStore((s) => s.binTab);
  const playlists = usePlaylists('media');
  const media = useStore((s) => s.media);
  const library = useMemo(() => media.filter(inMediaBin), [media]);
  // Same rule as the browser, so a playlist's count always matches what opening it shows.
  const ids = useMemo(() => new Set(library.map((m) => m.id)), [library]);
  const counts: Partial<Record<BinTab, number>> = {
    media: library.length,
    images: library.filter((m) => m.kind === 'image').length,
    videos: library.filter((m) => m.kind === 'video').length,
    audio: library.filter((m) => m.kind === 'audio').length,
  };
  return (
    <nav
      aria-label={t('mediaBin.library')}
      className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto pb-2"
    >
      <SectionHeading title={t('mediaBin.media')} />
      {LIBRARY.map(({ tab: x, icon: Icon }) => (
        <NavItem
          key={x}
          aria-pressed={tab === x}
          selected={tab === x}
          onClick={() => useStore.setState({ binTab: x })}
          icon={<Icon size={14} className="text-[var(--text-3)]" />}
          label={t(`mediaBin.views.${x}`)}
          trailing={<Count n={counts[x] ?? 0} />}
          className="w-[calc(100%-12px)]"
        />
      ))}

      <SectionHeading
        title={t('mediaBin.playlists')}
        action={
          <IconButton
            size="3xs"
            variant="quiet"
            aria-label={t('mediaBin.newPlaylist')}
            onClick={() => void createMediaPlaylist()}
          >
            <Plus size={14} />
          </IconButton>
        }
      />
      {playlists.length === 0 && (
        <Typography as="p" size={11} tone="muted" leading="snug" className="px-3 py-1">
          {t('mediaBin.noPlaylists')}
        </Typography>
      )}
      {[...playlists]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => (
          <PlaylistRow key={p.id} p={p} count={p.mediaIds.filter((id) => ids.has(id)).length} />
        ))}

      <SectionHeading title={t('mediaBin.sources')} />
      {SOURCES.map(({ tab: x, icon: Icon }) => (
        <NavItem
          key={x}
          aria-pressed={tab === x}
          selected={tab === x}
          onClick={() => useStore.setState({ binTab: x })}
          icon={<Icon size={14} className="text-[var(--text-3)]" />}
          label={t(`bin.tabs.${x}`)}
          className="w-[calc(100%-12px)]"
        />
      ))}
    </nav>
  );
}

/**
 * Media bin, under the slides (opened from the toolbar's Media button): whatever the media
 * sidebar (BinNav, in the left column) has picked, across the full width of the centre.
 */
export function Bin({ height }: { height: number }) {
  const { t } = useTranslation();
  const tab = useStore((s) => s.binTab);
  const playlistId = useStore((s) => s.binPlaylistId);
  const playlists = usePlaylists('media');
  const openPlaylist = tab === 'playlist' && playlists.some((p) => p.id === playlistId);
  const view =
    tab === 'images' || tab === 'videos' || tab === 'audio'
      ? tab
      : openPlaylist
        ? 'playlist'
        : 'media';

  return (
    <section aria-label={t('bin.label')} className="flex shrink-0 flex-col" style={{ height }}>
      {tab === 'video-input' ? (
        <VideoInputs />
      ) : tab === 'stock-media' ? (
        <StockMedia />
      ) : tab === 'backgrounds' ? (
        <div className="flex min-h-0 flex-1 flex-col bg-[var(--surface-0)]">
          <BackgroundsPanel />
        </div>
      ) : (
        <MediaBrowser view={view} playlistId={openPlaylist ? playlistId : null} />
      )}
    </section>
  );
}

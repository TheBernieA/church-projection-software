import { useState, type ReactNode } from 'react';
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
import { IconButton, NavItem, SoonBadge, Typography } from '@lampstand/ui';
import { feature } from '../../lib/features';
import { isLibraryDrag, readLibraryDrop } from '../../lib/libraryDrag';
import {
  addToMediaPlaylist,
  createMediaPlaylist,
  deleteMediaPlaylist,
  renameMediaPlaylist,
} from '../../lib/mediaPlaylists';
import { useStore } from '../../lib/store';
import { BackgroundsPanel } from '../MediaPanel';
import { SoonPanel } from '../bins/SoonPanel';
import { inMediaBin, MediaBrowser } from '../media/MediaBrowser';
import { ITEM_CLASS, MENU_CLASS } from '../menu';
import { type BinTab } from '../../types';

const LIBRARY: { tab: BinTab; icon: LucideIcon }[] = [
  { tab: 'media', icon: Images },
  { tab: 'images', icon: ImageIcon },
  { tab: 'videos', icon: Film },
  { tab: 'audio', icon: Music },
  { tab: 'backgrounds', icon: Wallpaper },
];
const SOURCES: { tab: BinTab; icon: LucideIcon; id: string }[] = [
  { tab: 'video-input', icon: Video, id: 'video-input' },
  { tab: 'stock-media', icon: Store, id: 'stock-media' },
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
function PlaylistRow({ p }: { p: MediaPlaylist }) {
  const { t } = useTranslation();
  const open = useStore((s) => s.binTab === 'playlist' && s.binPlaylistId === p.id);
  // Same rule as the browser, so the count always matches what opening it shows.
  const count = useStore(
    (s) => p.mediaIds.filter((id) => s.media.some((m) => m.id === id && inMediaBin(m))).length,
  );
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
 * library views (all media, pictures, videos, backgrounds), the operator's media playlists, and
 * the planned sources. Its top lines up with the media browser's.
 */
export function BinNav() {
  const { t } = useTranslation();
  const tab = useStore((s) => s.binTab);
  const playlists = useStore((s) => s.mediaPlaylists);
  const media = useStore((s) => s.media);
  const library = media.filter(inMediaBin);
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
          <PlaylistRow key={p.id} p={p} />
        ))}

      <SectionHeading title={t('mediaBin.sources')} />
      {SOURCES.map(({ tab: x, icon: Icon, id }) => (
        <NavItem
          key={x}
          aria-pressed={tab === x}
          selected={tab === x}
          dim
          title={t('soon.tooltip', { name: feature(id).name })}
          onClick={() => useStore.setState({ binTab: x })}
          icon={<Icon size={14} className="text-[var(--text-3)]" />}
          label={t(`bin.tabs.${x}`)}
          trailing={<SoonBadge label={t('soon.badge')} />}
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
  const playlists = useStore((s) => s.mediaPlaylists);
  const source = SOURCES.find((s) => s.tab === tab);
  const openPlaylist = tab === 'playlist' && playlists.some((p) => p.id === playlistId);
  const view =
    tab === 'images' || tab === 'videos' || tab === 'audio'
      ? tab
      : openPlaylist
        ? 'playlist'
        : 'media';

  return (
    <section aria-label={t('bin.label')} className="flex shrink-0 flex-col" style={{ height }}>
      {source ? (
        <SoonPanel ids={[source.id]} icon={<source.icon size={20} />} />
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

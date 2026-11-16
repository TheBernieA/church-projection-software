import { useMemo, useState, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ChevronRight,
  Ellipsis,
  Music,
  Film,
  Image as ImageIcon,
  ListPlus,
  ListVideo,
  Plus,
  Radio,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatClock, newId, type MediaItem, type ServiceItem } from '@lampstand/core';
import { Button, IconButton, Segmented, SoonBadge, Typography } from '@lampstand/ui';
import { feature, soonTitle } from '../../lib/features';
import { openAdhoc } from '../../lib/actions';
import { playAudio } from '../../lib/audio';
import { previewTrack } from '../../lib/audioPreview';
import { cmd } from '../../lib/api';
import { isLibraryDrag, libraryDragSource, readLibraryDrop } from '../../lib/libraryDrag';
import {
  addToMediaPlaylist,
  createMediaPlaylist,
  FAVOURITE,
  importMedia,
  toggleFavourite,
  placeInMediaPlaylist,
  usePlaylists,
  removeFromMediaPlaylist,
} from '../../lib/mediaPlaylists';
import { addItemToService, attempt, useStore } from '../../lib/store';
import { thumbUrl, mediaUrl } from '../../../shared/mediaUrl';
import { usePaneSize } from '../shell/Splitter';
import { EmptyState } from '../EmptyState';
import { SoonFeature } from '../Soon';
import { REVEAL } from '../cards';
import { ITEM_CLASS, MENU_CLASS, MENU_LABEL_CLASS, SEPARATOR_CLASS } from '../menu';
import i18n from '../../i18n';

type Sort = 'date' | 'name';
export type MediaView = 'media' | 'favourites' | 'images' | 'videos' | 'audio' | 'playlist';

/** What the media bin lists: library pictures, videos and audio (backgrounds have their own view). */
export const inMediaBin = (m: MediaItem): boolean => !m.isBackground;

const KIND_OF: Record<'images' | 'videos' | 'audio', MediaItem['kind']> = {
  images: 'image',
  videos: 'video',
  audio: 'audio',
};

/** A playlist item for showing media, or adding it to the service plan. */
const asItem = (m: MediaItem): ServiceItem => ({
  id: `adhoc-${m.id}`,
  kind: 'media',
  mediaId: m.id,
  loop: m.kind === 'video',
  autoAdvance: false,
  asBackground: false,
});

/** "November 2026": the heading for media imported in that month. */
const monthOf = (iso: string): string =>
  new Date(iso).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });

/** The picture: its stored thumbnail, else the video's first frame, else its kind. */
export function Thumb({ m }: { m: MediaItem }) {
  if (m.hasThumbnail)
    return (
      <img
        src={thumbUrl(m.id)}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-200 group-hover/tile:scale-[1.03]"
      />
    );
  if (m.kind === 'audio')
    return (
      <Typography
        as="div"
        tone="white"
        className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#5b4bb7,#2a2350_60%,#15122b)]"
      >
        <Music size={26} strokeWidth={1.5} className="opacity-90" />
      </Typography>
    );
  if (m.kind === 'video')
    return (
      <video
        src={`${mediaUrl(m.id)}#t=0.1`}
        muted
        preload="metadata"
        aria-hidden
        className="h-full w-full object-cover"
      />
    );
  return (
    <Typography as="div" tone="muted" className="flex h-full w-full items-center justify-center">
      <ImageIcon size={20} />
    </Typography>
  );
}

/** Per-clip tools still to come, listed (dimmed) in each tile's menu. */
const PLANNED_TILE_TOOLS = ['playback-markers', 'media-tags', 'media-relink', 'media-optimise'];

/** "Video · 1920×1080 · 2:14 · 48 MB": what a piece of media is, for its menu. */
function mediaInfo(m: MediaItem): string {
  const kind = i18n.t(`mediaBin.kinds.${m.kind}`);
  const size = m.width && m.height ? `${m.width}×${m.height}` : null;
  const length = m.durationSec ? formatClock(Math.round(m.durationSec)) : null;
  const mb =
    m.sizeBytes >= 1e6
      ? `${(m.sizeBytes / 1e6).toFixed(1)} MB`
      : `${Math.ceil(m.sizeBytes / 1e3)} KB`;
  return [kind, size, length, mb].filter(Boolean).join(' · ');
}

/** Star a piece of media for the Favourites view; always shown once starred. */
function FavouriteStar({ m }: { m: MediaItem }) {
  const { t } = useTranslation();
  const on = m.tags.includes(FAVOURITE);
  return (
    <IconButton
      size="2xs"
      variant="secondary"
      aria-label={
        on ? t('mediaBin.unfavourite', { name: m.name }) : t('mediaBin.favourite', { name: m.name })
      }
      aria-pressed={on}
      onClick={() => void toggleFavourite(m)}
      className={`absolute right-9 top-1.5 z-[1] !rounded-full !bg-black/60 backdrop-blur-sm hover:!bg-black/80 ${
        on ? '!text-[#f5c542]' : `!text-white ${REVEAL}`
      }`}
    >
      <Star size={13} fill={on ? 'currentColor' : 'none'} />
    </IconButton>
  );
}

/** The "…" menu on a tile: add to a playlist, take it out of this one, delete it. */
function TileMenu({ m, playlistId }: { m: MediaItem; playlistId: string | null }) {
  const { t } = useTranslation();
  const playlists = usePlaylists('media');
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton
          size="2xs"
          variant="secondary"
          aria-label={t('mediaBin.more', { name: m.name })}
          className={`absolute right-1.5 top-1.5 z-[1] !rounded-full !bg-black/60 !text-white backdrop-blur-sm hover:!bg-black/80 data-[state=open]:opacity-100 ${REVEAL}`}
        >
          <Ellipsis size={14} />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className={MENU_CLASS}>
          {/* What it is, at a glance. */}
          <DropdownMenu.Label className={MENU_LABEL_CLASS}>{mediaInfo(m)}</DropdownMenu.Label>
          {m.kind === 'audio' && (
            <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => void playAudio(m.id)}>
              <Radio size={14} />
              {t('audio.playInRoom', { name: m.name })}
            </DropdownMenu.Item>
          )}
          {m.kind !== 'audio' && (
            <DropdownMenu.Item
              className={ITEM_CLASS}
              onSelect={() => addItemToService({ ...asItem(m), id: newId() })}
            >
              <ListPlus size={14} />
              {t('mediaBin.addToService')}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={ITEM_CLASS}>
              <ListVideo size={14} />
              <span className="flex-1">{t('mediaBin.addToPlaylist')}</span>
              <ChevronRight size={13} />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent sideOffset={4} className={MENU_CLASS}>
                {playlists
                  .filter((p) => p.id !== playlistId)
                  .map((p) => (
                    <DropdownMenu.Item
                      key={p.id}
                      className={ITEM_CLASS}
                      disabled={p.mediaIds.includes(m.id)}
                      onSelect={() => void addToMediaPlaylist(p.id, [m.id])}
                    >
                      <ListVideo size={14} />
                      <Typography truncate className="flex-1">
                        {p.name}
                      </Typography>
                    </DropdownMenu.Item>
                  ))}
                {playlists.some((p) => p.id !== playlistId) && (
                  <DropdownMenu.Separator className={SEPARATOR_CLASS} />
                )}
                <DropdownMenu.Item
                  className={ITEM_CLASS}
                  onSelect={() => void createMediaPlaylist([m.id])}
                >
                  <Plus size={14} />
                  {t('mediaBin.newPlaylistWith')}
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          {/* Planned per-clip settings. */}
          {/* Planned per-clip tools. */}
          {PLANNED_TILE_TOOLS.map((id) => (
            <DropdownMenu.Item key={id} disabled className={ITEM_CLASS} title={soonTitle(id)}>
              <Typography className="flex-1">{feature(id).name}</Typography>
              <SoonBadge label={t('soon.badge')} />
            </DropdownMenu.Item>
          ))}
          {playlistId && (
            <DropdownMenu.Item
              className={ITEM_CLASS}
              onSelect={() => void removeFromMediaPlaylist(playlistId, m.id)}
            >
              <X size={14} />
              {t('mediaBin.removeFromPlaylist')}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className={SEPARATOR_CLASS} />
          <DropdownMenu.Item
            className={ITEM_CLASS}
            onSelect={() => void attempt(() => cmd('media.delete', { id: m.id }), 'errors.save')}
          >
            <Trash2 size={14} />
            {t('mediaBin.deleteFromLibrary')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * One piece of media: the picture with its kind and length on it, the name underneath. Click
 * shows it, double-click adds it to the service plan, drag it into the plan or onto a playlist.
 * Inside a playlist, dropping one tile on another reorders them.
 */
function MediaTile({
  m,
  playlistId,
  index,
}: {
  m: MediaItem;
  playlistId: string | null;
  index: number;
}) {
  const [dropping, setDropping] = useState(false);
  const live = useStore((s) => s.live?.program.media?.mediaId === m.id);
  return (
    <li
      className="group relative"
      onDragOver={(e) => {
        if (!playlistId || !isLibraryDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        setDropping(false);
        if (!playlistId || !isLibraryDrag(e)) return;
        e.preventDefault();
        const dropped = readLibraryDrop(e);
        if (dropped?.kind !== 'media') return;
        const id = dropped.mediaId;
        void placeInMediaPlaylist(playlistId, id, index);
      }}
    >
      {dropping && (
        <span
          aria-hidden
          className="absolute -left-1.5 bottom-6 top-0 z-[2] w-0.5 rounded-full bg-[var(--select)]"
        />
      )}
      <Button
        variant="bare"
        aria-label={m.name}
        title={m.name}
        {...(m.kind === 'audio'
          ? // Audio plays through the room (Audio tab); it stays out of the service plan.
            {
              // Listen first, on this computer (Audio tab); the room hears it on "Play in room".
              onClick: () => {
                useStore.setState({ controlsTab: 'audio' });
                previewTrack(m.id);
              },
            }
          : {
              onClick: () => void openAdhoc(asItem(m), 'preview'),
              onDoubleClick: () => addItemToService({ ...asItem(m), id: newId() }),
              ...libraryDragSource(() => asItem(m)),
            })}
        className="group/tile block w-full text-left focus-visible:outline-none"
      >
        <div
          className={`relative aspect-video w-full overflow-hidden rounded-[6px] bg-black transition-[box-shadow,transform] duration-150 group-hover/tile:-translate-y-0.5 group-focus-visible/tile:shadow-[0_0_0_2px_var(--accent)] ${
            live
              ? 'shadow-[0_0_0_2px_var(--tally-program)]'
              : 'shadow-[var(--shadow-1)] group-hover/tile:shadow-[var(--shadow-2)]'
          }`}
        >
          <Thumb m={m} />
          {/* Kind, top left; length, bottom left; both legible on any picture. */}
          <Typography
            tone="white"
            className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-[4px] bg-black/55 backdrop-blur-sm"
          >
            {m.kind === 'video' ? (
              <Film size={11} />
            ) : m.kind === 'audio' ? (
              <Music size={11} />
            ) : (
              <ImageIcon size={11} />
            )}
          </Typography>
          {m.kind !== 'image' && m.durationSec !== undefined && (
            <Typography
              size={10}
              weight="semibold"
              tone="white"
              tabular
              className="absolute bottom-1.5 left-1.5 rounded-[3px] bg-black/60 px-1 py-px backdrop-blur-sm"
            >
              {formatClock(Math.round(m.durationSec))}
            </Typography>
          )}
          {live && (
            <Typography
              size={10}
              weight="bold"
              tone="white"
              caps
              className="absolute bottom-1.5 right-1.5 rounded-[3px] bg-[var(--tally-program)] px-1 py-px"
            >
              {i18n.t('mediaBin.live')}
            </Typography>
          )}
        </div>
        <Typography size={12} tone="secondary" truncate className="mt-1.5 block">
          {m.name}
        </Typography>
      </Button>
      <FavouriteStar m={m} />
      <TileMenu m={m} playlistId={playlistId} />
    </li>
  );
}

function Grid({ children, size }: { children: ReactNode; size: number }) {
  return (
    <ul
      className="grid gap-x-3 gap-y-4"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}
    >
      {children}
    </ul>
  );
}

/**
 * The media bin's content: what the sidebar picked (all media, pictures, videos or one
 * playlist), searchable, sorted by date (grouped by month) or name, at an adjustable size.
 */
export function MediaBrowser({ view, playlistId }: { view: MediaView; playlistId: string | null }) {
  const { t } = useTranslation();
  const all = useStore((s) => s.media);
  const playlist = useStore((s) =>
    playlistId ? s.mediaPlaylists.find((p) => p.id === playlistId) : undefined,
  );
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('date');
  const size = usePaneSize('mediaTileWidth', 160, 110, 280);

  const items = useMemo(() => {
    const library = all.filter(inMediaBin);
    let list: MediaItem[];
    if (view === 'playlist') {
      const byId = new Map(library.map((m) => [m.id, m]));
      // Playlist order; media deleted from the library simply drops out.
      list = (playlist?.mediaIds ?? []).flatMap((id) => byId.get(id) ?? []);
    } else {
      list = library.filter((m) =>
        view === 'media'
          ? true
          : view === 'favourites'
            ? m.tags.includes(FAVOURITE)
            : m.kind === KIND_OF[view],
      );
      list = [...list].sort((a, b) =>
        sort === 'name' ? a.name.localeCompare(b.name) : b.createdAt.localeCompare(a.createdAt),
      );
    }
    const needle = search.trim().toLowerCase();
    return needle ? list.filter((m) => m.name.toLowerCase().includes(needle)) : list;
  }, [all, view, playlist, sort, search]);

  // Newest first, under a heading per month, like a photo library.
  const groups = useMemo(() => {
    if (view === 'playlist' || sort !== 'date') return [{ title: '', items }];
    const out: { title: string; items: MediaItem[] }[] = [];
    for (const m of items) {
      const title = monthOf(m.createdAt);
      const last = out[out.length - 1];
      if (last?.title === title) last.items.push(m);
      else out.push({ title, items: [m] });
    }
    return out;
  }, [items, sort, view]);

  const crumb = view === 'playlist' ? (playlist?.name ?? '') : t(`mediaBin.views.${view}`);

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[var(--surface-0)]">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--divider)] bg-[var(--surface-1)] px-3">
        <Typography size={12} tone="muted" className="shrink-0">
          {t('mediaBin.media')}
        </Typography>
        <Typography tone="muted" className="flex shrink-0">
          <ChevronRight size={12} />
        </Typography>
        <Typography size={12} weight="medium" tone="primary" truncate className="min-w-0">
          {crumb}
        </Typography>
        <Typography size={11} tone="muted" tabular className="shrink-0">
          {items.length}
        </Typography>
        <span className="flex-1" />
        <SoonFeature
          id="media-multiselect"
          label={t('mediaBin.select')}
          className="!h-7 shrink-0"
        />
        <label className="relative flex shrink-0 items-center">
          <Typography tone="muted" className="pointer-events-none absolute left-2 flex">
            <Search size={13} />
          </Typography>
          <input
            type="search"
            aria-label={t('mediaBin.search')}
            placeholder={t('mediaBin.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="field !h-7 !w-40 !pl-7"
          />
        </label>
        {view !== 'playlist' && (
          <Segmented<Sort>
            label={t('mediaBin.sort')}
            value={sort}
            onChange={setSort}
            options={[
              { value: 'date', label: t('mediaBin.byDate') },
              { value: 'name', label: t('mediaBin.byName') },
            ]}
          />
        )}
        <input
          type="range"
          aria-label={t('mediaBin.size')}
          title={t('mediaBin.size')}
          min={110}
          max={280}
          step={10}
          value={size.size}
          onChange={(e) => size.preview(Number(e.target.value))}
          onPointerUp={(e) => size.commit(Number(e.currentTarget.value))}
          onKeyUp={(e) => size.commit(Number(e.currentTarget.value))}
          style={{ '--pct': `${((size.size - 110) / 170) * 100}%` } as React.CSSProperties}
          className="ls-range w-20 shrink-0"
        />
        <Button
          size="xs"
          variant="primary"
          icon={<Plus size={13} />}
          onClick={() => void importMedia({ playlistId })}
        >
          {t('media.add')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {items.length === 0 ? (
          <EmptyState
            icon={view === 'playlist' ? <ListVideo size={26} /> : <Film size={26} />}
            title={
              search
                ? t('mediaBin.noMatch')
                : view === 'playlist'
                  ? t('mediaBin.emptyPlaylist')
                  : t('media.empty')
            }
          />
        ) : (
          groups.map((g) => (
            <section key={g.title || 'all'} className="pt-3">
              {g.title && (
                <Typography as="h3" variant="title" className="pb-2.5">
                  {g.title}
                </Typography>
              )}
              <Grid size={size.size}>
                {g.items.map((m, i) => (
                  <MediaTile key={m.id} m={m} playlistId={playlistId} index={i} />
                ))}
              </Grid>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

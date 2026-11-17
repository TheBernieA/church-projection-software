import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Check,
  ChevronRight,
  Ellipsis,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  List,
  ListPlus,
  ListVideo,
  Music,
  Pencil,
  Plus,
  Radio,
  Search,
  Star,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatClock, newId, type MediaItem, type ServiceItem } from '@lampstand/core';
import {
  Button,
  IconButton,
  Segmented,
  Slider,
  SoonBadge,
  Typography,
  percent,
} from '@lampstand/ui';
import { feature, soonTitle } from '../../lib/features';
import { addVideoCountdown, openAdhoc } from '../../lib/actions';
import { playAudio, probeDuration } from '../../lib/audio';
import { useKnownDuration } from '../../lib/mediaDurations';
import { previewTrack } from '../../lib/audioPreview';
import { cmd } from '../../lib/api';
import { isLibraryDrag, libraryDragSource, readLibraryDrop } from '../../lib/libraryDrag';
import {
  addToMediaPlaylist,
  createMediaPlaylist,
  FAVOURITE,
  importMedia,
  placeInMediaPlaylist,
  removeFromMediaPlaylist,
  toggleFavourite,
  usePlaylists,
} from '../../lib/mediaPlaylists';
import { addItemToService, attempt, useStore } from '../../lib/store';
import { useWidth } from '../../lib/hooks';
import { mediaUrl, thumbUrl } from '../../../shared/mediaUrl';
import { usePaneSize } from '../shell/Splitter';
import { EmptyState } from '../EmptyState';
import { SoonFeature } from '../Soon';
import { REVEAL } from '../cards';
import { ITEM_CLASS, MENU_CLASS, MENU_LABEL_CLASS, SEPARATOR_CLASS } from '../menu';
import i18n from '../../i18n';

export type MediaView = 'media' | 'favourites' | 'images' | 'videos' | 'audio' | 'playlist';

/** What the media bin lists: library pictures, videos and audio (backgrounds have their own view). */
export const inMediaBin = (m: MediaItem): boolean => !m.isBackground;

const KIND_OF: Record<'images' | 'videos' | 'audio', MediaItem['kind']> = {
  images: 'image',
  videos: 'video',
  audio: 'audio',
};

/** How the library can be ordered (a playlist keeps its own, drag-to-reorder order). */
/** Toolbar widths (px): below each, the bin's toolbar gives something up. */
const BAR_ROOMY = 860; // the "Media ›" prefix and Select
const BAR_LABELS = 700; // labels on Sort and Grid / List, and the size slider
const BAR_TIGHT = 520; // the label on Add media

const SORTS = ['date', 'name', 'kind', 'length', 'size'] as const;
type SortField = (typeof SORTS)[number];

const byName = (a: MediaItem, b: MediaItem): number =>
  a.name.localeCompare(b.name, undefined, { numeric: true });
const COMPARE: Record<SortField, (a: MediaItem, b: MediaItem) => number> = {
  date: (a, b) => a.createdAt.localeCompare(b.createdAt),
  name: byName,
  kind: (a, b) => a.kind.localeCompare(b.kind) || byName(a, b),
  length: (a, b) => (a.durationSec ?? 0) - (b.durationSec ?? 0),
  size: (a, b) => a.sizeBytes - b.sizeBytes,
};
/** Each field's natural first direction: newest, A–Z, by kind, longest, biggest. */
const DESC_FIRST: Record<SortField, boolean> = {
  date: true,
  name: false,
  kind: false,
  length: true,
  size: true,
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

const fileSize = (bytes: number): string =>
  bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1)} GB`
    : bytes >= 1e6
      ? `${(bytes / 1e6).toFixed(1)} MB`
      : `${Math.ceil(bytes / 1e3)} KB`;

const lengthOf = (m: MediaItem): string | null =>
  m.kind !== 'image' && m.durationSec ? formatClock(Math.round(m.durationSec)) : null;

/** A clip's length; read from the file once when the library doesn't know it yet. */
function useLength(m: MediaItem): string | null {
  const timed = m.kind !== 'image';
  const seconds = useKnownDuration(timed ? m.id : undefined, m.durationSec);
  useEffect(() => {
    if (timed && seconds === undefined) probeDuration(m.id);
  }, [timed, seconds, m.id]);
  return timed && seconds ? formatClock(Math.round(seconds)) : null;
}

/** "Video · 1920×1080 · 2:14 · 48 MB": what a piece of media is, for its menu. */
function mediaInfo(m: MediaItem): string {
  const kind = i18n.t(`mediaBin.kinds.${m.kind}`);
  const dims = m.width && m.height ? `${m.width}×${m.height}` : null;
  return [kind, dims, lengthOf(m), fileSize(m.sizeBytes)].filter(Boolean).join(' · ');
}

const KIND_ICON = { video: Film, audio: Music, image: ImageIcon } as const;

/** The picture: audio art, its stored thumbnail, the video's first frame, or its kind. */
export function Thumb({ m, small = false }: { m: MediaItem; small?: boolean }) {
  // Audio first: a system "music file" thumbnail looks like a grey placeholder.
  if (m.kind === 'audio')
    return (
      <Typography
        as="div"
        tone="white"
        className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#5b4bb7,#2a2350_60%,#15122b)]"
      >
        <Music size={small ? 14 : 26} strokeWidth={1.5} className="opacity-90" />
      </Typography>
    );
  if (m.hasThumbnail)
    return (
      <img src={thumbUrl(m.id)} alt="" loading="lazy" className="h-full w-full object-cover" />
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
      <ImageIcon size={small ? 14 : 20} />
    </Typography>
  );
}

/** Which piece of media is being renamed (one at a time, inline where its name is shown). */
const Renaming = createContext<{ id: string | null; set: (id: string | null) => void }>({
  id: null,
  set: () => undefined,
});

/** The name, or (while renaming) a field that saves on Enter or leaving it, cancels on Esc. */
function MediaName({ m, className }: { m: MediaItem; className: string }) {
  const { t } = useTranslation();
  const renaming = useContext(Renaming);
  const cancelled = useRef(false);
  if (renaming.id !== m.id)
    return (
      <Typography size={12} tone="secondary" truncate className={className}>
        {m.name}
      </Typography>
    );
  const save = (value: string): void => {
    renaming.set(null);
    const name = value.trim();
    if (!cancelled.current && name && name !== m.name)
      void attempt(() => cmd('media.update', { id: m.id, name }), 'errors.save');
  };
  return (
    <input
      autoFocus
      aria-label={t('mediaBin.renameMedia', { name: m.name })}
      defaultValue={m.name}
      maxLength={200}
      onFocus={(e) => {
        cancelled.current = false;
        e.currentTarget.select();
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={(e) => save(e.currentTarget.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.preventDefault();
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      className={`field !h-6 w-full !px-1.5 ${className}`}
    />
  );
}

/** Click shows it (audio: listen first, here), double-click adds it to the plan, drag it anywhere. */
function openProps(m: MediaItem) {
  if (m.kind === 'audio')
    return {
      onClick: () => {
        useStore.setState({ controlsTab: 'audio' });
        previewTrack(m.id);
      },
    };
  return {
    onClick: () => void openAdhoc(asItem(m), 'preview'),
    onDoubleClick: () => addItemToService({ ...asItem(m), id: newId() }),
    ...libraryDragSource(() => asItem(m)),
  };
}

/** Inside a playlist, dropping media on an entry places it there (reorder, or add). */
function useDropTarget(playlistId: string | null, index: number) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!playlistId || !isLibraryDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false);
        if (!playlistId || !isLibraryDrag(e)) return;
        e.preventDefault();
        const dropped = readLibraryDrop(e);
        if (dropped?.kind === 'media')
          void placeInMediaPlaylist(playlistId, dropped.mediaId, index);
      },
    },
  };
}

/** On a tile, the round buttons sit on the picture; in a row, they are plain. */
const ON_PICTURE =
  'absolute top-1.5 z-[1] !rounded-full !bg-black/60 backdrop-blur-sm hover:!bg-black/80';

/** Star a piece of media for the Favourites view; always shown once starred. */
function FavouriteStar({ m, onPicture }: { m: MediaItem; onPicture: boolean }) {
  const { t } = useTranslation();
  const on = m.tags.includes(FAVOURITE);
  const tone = on ? '!text-[#f5c542]' : `${onPicture ? '!text-white' : ''} ${REVEAL}`;
  return (
    <IconButton
      size="2xs"
      variant={onPicture ? 'secondary' : 'quiet'}
      aria-label={
        on ? t('mediaBin.unfavourite', { name: m.name }) : t('mediaBin.favourite', { name: m.name })
      }
      aria-pressed={on}
      onClick={() => void toggleFavourite(m)}
      className={`${onPicture ? `${ON_PICTURE} left-7 !top-1` : ''} ${tone}`}
    >
      <Star size={13} fill={on ? 'currentColor' : 'none'} />
    </IconButton>
  );
}

/** Per-clip tools still to come, listed (dimmed) in each tile's menu. */
const PLANNED_TILE_TOOLS = ['playback-markers', 'media-tags', 'media-relink', 'media-optimise'];

/** The "…" menu: what it is, add to the plan or a playlist, rename, remove, delete. */
function TileMenu({
  m,
  playlistId,
  onPicture,
}: {
  m: MediaItem;
  playlistId: string | null;
  onPicture: boolean;
}) {
  const { t } = useTranslation();
  const playlists = usePlaylists('media');
  const renaming = useContext(Renaming);
  const others = playlists.filter((p) => p.id !== playlistId);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton
          size="2xs"
          variant={onPicture ? 'secondary' : 'quiet'}
          aria-label={t('mediaBin.more', { name: m.name })}
          className={`data-[state=open]:opacity-100 ${REVEAL} ${onPicture ? `${ON_PICTURE} right-1.5 !text-white` : ''}`}
        >
          <Ellipsis size={14} />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className={MENU_CLASS}>
          {/* What it is, at a glance. */}
          <DropdownMenu.Label className={MENU_LABEL_CLASS}>{mediaInfo(m)}</DropdownMenu.Label>
          {m.kind === 'audio' ? (
            <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => void playAudio(m.id)}>
              <Radio size={14} />
              {t('audio.playInRoom', { name: m.name })}
            </DropdownMenu.Item>
          ) : (
            <DropdownMenu.Item
              className={ITEM_CLASS}
              onSelect={() => addItemToService({ ...asItem(m), id: newId() })}
            >
              <ListPlus size={14} />
              {t('mediaBin.addToService')}
            </DropdownMenu.Item>
          )}
          {m.kind === 'video' && (
            <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => addVideoCountdown(m.id)}>
              <Timer size={14} />
              {t('mediaBin.makeCountdown')}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={ITEM_CLASS}>
              <ListVideo size={14} />
              <Typography className="flex-1">{t('mediaBin.addToPlaylist')}</Typography>
              <ChevronRight size={13} />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent sideOffset={4} className={MENU_CLASS}>
                {others.map((p) => (
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
                {others.length > 0 && <DropdownMenu.Separator className={SEPARATOR_CLASS} />}
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
          <DropdownMenu.Item
            className={ITEM_CLASS}
            // Wait for the menu to hand focus back before the field takes it.
            onSelect={() => setTimeout(() => renaming.set(m.id), 0)}
          >
            <Pencil size={14} />
            {t('mediaBin.rename')}
          </DropdownMenu.Item>
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

/** The red LIVE tag on media that's on screen. */
function LiveTag({ className }: { className: string }) {
  return (
    <Typography
      size={10}
      weight="bold"
      tone="white"
      caps
      className={`rounded-[3px] bg-[var(--tally-program)] px-1 py-px ${className}`}
    >
      {i18n.t('mediaBin.live')}
    </Typography>
  );
}

/** Media on screen right now (a red ring on its tile, a red tint on its row). */
const useIsLive = (id: string): boolean => useStore((s) => s.live?.program.media?.mediaId === id);

/**
 * One piece of media in the grid: the picture with its kind and length on it, the name below.
 * Hover draws an outline (nothing moves); live media has a red ring.
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
  const live = useIsLive(m.id);
  const drop = useDropTarget(playlistId, index);
  const KindIcon = KIND_ICON[m.kind];
  const length = useLength(m);
  return (
    <li className="group relative" {...drop.props}>
      {drop.over && (
        <span
          aria-hidden
          className="absolute -left-1.5 bottom-6 top-0 z-[2] w-0.5 rounded-full bg-[var(--select)]"
        />
      )}
      <Button
        variant="bare"
        aria-label={m.name}
        title={m.name}
        {...openProps(m)}
        className="group/tile block w-full text-left focus-visible:outline-none"
      >
        <div
          className={`relative aspect-video w-full overflow-hidden rounded-[6px] bg-black transition-shadow duration-100 ${
            live
              ? 'shadow-[0_0_0_2px_var(--tally-program)]'
              : 'shadow-[0_0_0_1px_var(--hairline)] group-hover/tile:shadow-[0_0_0_2px_color-mix(in_srgb,var(--text-1)_55%,transparent)] group-focus-visible/tile:shadow-[0_0_0_2px_var(--accent)]'
          }`}
        >
          <Thumb m={m} />
          {/* Kind, top left; length, bottom left; both legible on any picture. */}
          <Typography
            tone="white"
            className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-[4px] bg-black/55 backdrop-blur-sm"
          >
            <KindIcon size={11} />
          </Typography>
          {length && (
            <Typography
              size={10}
              weight="semibold"
              tone="white"
              tabular
              className="absolute bottom-1.5 left-1.5 rounded-[3px] bg-black/60 px-1 py-px backdrop-blur-sm"
            >
              {length}
            </Typography>
          )}
          {live && <LiveTag className="absolute bottom-1.5 right-1.5" />}
        </div>
        <MediaName
          m={m}
          className="mt-1.5 block transition-colors group-hover/tile:text-[var(--text-1)]"
        />
      </Button>
      <FavouriteStar m={m} onPicture />
      <TileMenu m={m} playlistId={playlistId} onPicture />
    </li>
  );
}

/** Thumbnail, name, kind, length, size, added; shared by the list's heading and its rows. */
const LIST_COLUMNS = 'grid grid-cols-[64px_minmax(0,1fr)_88px_60px_68px_96px] items-center gap-3';

/** One piece of media in the list: thumbnail, name, kind, length, size and when it was added. */
function MediaRow({
  m,
  playlistId,
  index,
}: {
  m: MediaItem;
  playlistId: string | null;
  index: number;
}) {
  const live = useIsLive(m.id);
  const drop = useDropTarget(playlistId, index);
  const KindIcon = KIND_ICON[m.kind];
  const length = useLength(m);
  return (
    <li
      className={`group relative flex items-center gap-0.5 rounded-[6px] pr-1.5 ${
        live
          ? 'bg-[color-mix(in_srgb,var(--tally-program)_14%,transparent)]'
          : 'hover:bg-[var(--surface-2)]'
      } ${drop.over ? 'shadow-[inset_0_2px_0_var(--select)]' : ''}`}
      {...drop.props}
    >
      <Button
        variant="bare"
        aria-label={m.name}
        title={m.name}
        {...openProps(m)}
        className={`min-w-0 flex-1 rounded-[6px] py-1 pl-1.5 text-left focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--accent)] ${LIST_COLUMNS}`}
      >
        <span
          className={`relative block aspect-video w-16 overflow-hidden rounded-[4px] bg-black ${
            live ? 'shadow-[0_0_0_2px_var(--tally-program)]' : 'shadow-[0_0_0_1px_var(--hairline)]'
          }`}
        >
          <Thumb m={m} small />
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <MediaName m={m} className="min-w-0 group-hover:text-[var(--text-1)]" />
          {live && <LiveTag className="shrink-0" />}
        </span>
        <Typography size={11} tone="muted" className="flex items-center gap-1.5">
          <KindIcon size={12} className="shrink-0" />
          {i18n.t(`mediaBin.kinds.${m.kind}`)}
        </Typography>
        <Typography size={11} tone="muted" tabular>
          {length ?? '–'}
        </Typography>
        <Typography size={11} tone="muted" tabular>
          {fileSize(m.sizeBytes)}
        </Typography>
        <Typography size={11} tone="muted" tabular>
          {new Date(m.createdAt).toLocaleDateString(i18n.language, {
            day: 'numeric',
            month: 'short',
            year: '2-digit',
          })}
        </Typography>
      </Button>
      <FavouriteStar m={m} onPicture={false} />
      <TileMenu m={m} playlistId={playlistId} onPicture={false} />
    </li>
  );
}

const DirIcon = ({ desc, size }: { desc: boolean; size: number }) =>
  desc ? <ArrowDownWideNarrow size={size} /> : <ArrowUpNarrowWide size={size} />;

/** The list's column headings; click one to sort by it, again to flip the order. */
function ListHeader({
  field,
  desc,
  onSort,
}: {
  field: SortField | null;
  desc: boolean;
  onSort: ((f: SortField) => void) | null;
}) {
  const { t } = useTranslation();
  const col = (f: SortField): ReactNode => {
    const label = (
      <Typography
        size={11}
        weight="semibold"
        tone={field === f ? 'primary' : 'muted'}
        caps
        truncate
      >
        {t(`mediaBin.sorts.${f}`)}
      </Typography>
    );
    if (!onSort) return label;
    return (
      <Button
        variant="bare"
        onClick={() => onSort(f)}
        aria-label={t('mediaBin.sortBy', { field: t(`mediaBin.sorts.${f}`) })}
        className="flex min-w-0 items-center gap-1 text-left hover:text-[var(--text-1)]"
      >
        {label}
        {field === f && (
          <Typography tone="primary" className="flex">
            <DirIcon desc={desc} size={11} />
          </Typography>
        )}
      </Button>
    );
  };
  return (
    <div
      className={`sticky top-0 z-[2] border-b border-[var(--divider)] bg-[var(--surface-0)] py-1.5 pl-1.5 pr-[60px] ${LIST_COLUMNS}`}
    >
      <span />
      {col('name')}
      {col('kind')}
      {col('length')}
      {col('size')}
      {col('date')}
    </div>
  );
}

/** Sort menu: by which field, and which way round. */
function SortMenu({
  field,
  desc,
  onChange,
  compact = false,
}: {
  field: SortField;
  desc: boolean;
  onChange: (field: SortField, desc: boolean) => void;
  /** The icon alone (a narrow toolbar). */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          size="xs"
          variant="ghost"
          aria-label={t('mediaBin.sortBy', { field: t(`mediaBin.sorts.${field}`) })}
          icon={<DirIcon desc={desc} size={13} />}
          title={t('mediaBin.sortBy', { field: t(`mediaBin.sorts.${field}`) })}
          className="shrink-0"
        >
          {compact ? null : t(`mediaBin.sorts.${field}`)}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className={MENU_CLASS}>
          <DropdownMenu.Label className={MENU_LABEL_CLASS}>{t('mediaBin.sort')}</DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={field}
            onValueChange={(v) => {
              const f = SORTS.find((s) => s === v);
              if (f) onChange(f, DESC_FIRST[f]);
            }}
          >
            {SORTS.map((f) => (
              <DropdownMenu.RadioItem key={f} value={f} className={ITEM_CLASS}>
                <Typography className="flex w-3.5 justify-center">
                  <DropdownMenu.ItemIndicator>
                    <Check size={14} />
                  </DropdownMenu.ItemIndicator>
                </Typography>
                {t(`mediaBin.sorts.${f}`)}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className={SEPARATOR_CLASS} />
          <DropdownMenu.RadioGroup
            value={desc ? 'desc' : 'asc'}
            onValueChange={(v) => onChange(field, v === 'desc')}
          >
            {(['asc', 'desc'] as const).map((d) => (
              <DropdownMenu.RadioItem key={d} value={d} className={ITEM_CLASS}>
                <Typography className="flex w-3.5 justify-center">
                  <DropdownMenu.ItemIndicator>
                    <Check size={14} />
                  </DropdownMenu.ItemIndicator>
                </Typography>
                {t(`mediaBin.order.${field}.${d}`)}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

type Layout = 'grid' | 'list';

/**
 * The media bin's content: what the sidebar picked (all media, favourites, pictures, videos,
 * audio or one playlist), searchable and sortable, as a grid of tiles or a detailed list. Sorted
 * by date, the grid groups by month; a playlist keeps its own order.
 */
export function MediaBrowser({ view, playlistId }: { view: MediaView; playlistId: string | null }) {
  const { t } = useTranslation();
  const all = useStore((s) => s.media);
  const playlist = useStore((s) =>
    playlistId ? s.mediaPlaylists.find((p) => p.id === playlistId) : undefined,
  );
  const [search, setSearch] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const size = usePaneSize('mediaTileWidth', 160, 110, 280);
  // Remembered between sessions: grid or list, and the sort (field index × 2 + descending).
  const layoutPref = usePaneSize('mediaLayout', 0, 0, 1);
  const sortPref = usePaneSize('mediaSort', 1, 0, SORTS.length * 2 - 1);
  const layout: Layout = layoutPref.size === 1 ? 'list' : 'grid';
  const field: SortField = SORTS[Math.floor(sortPref.size / 2)] ?? 'date';
  const desc = sortPref.size % 2 === 1;
  const setSort = (f: SortField, d: boolean): void =>
    sortPref.commit(SORTS.indexOf(f) * 2 + (d ? 1 : 0));
  const inPlaylist = view === 'playlist';

  const items = useMemo(() => {
    const library = all.filter(inMediaBin);
    let list: MediaItem[];
    if (inPlaylist) {
      const byId = new Map(library.map((m) => [m.id, m]));
      // Playlist order; media deleted from the library simply drops out.
      list = (playlist?.mediaIds ?? []).flatMap((id) => byId.get(id) ?? []);
    } else {
      const cmp = COMPARE[field];
      list = library
        .filter((m) =>
          view === 'media'
            ? true
            : view === 'favourites'
              ? m.tags.includes(FAVOURITE)
              : m.kind === KIND_OF[view],
        )
        .sort((a, b) => (desc ? cmp(b, a) : cmp(a, b)));
    }
    const needle = search.trim().toLowerCase();
    return needle ? list.filter((m) => m.name.toLowerCase().includes(needle)) : list;
  }, [all, view, inPlaylist, playlist, field, desc, search]);

  // Sorted by date, the grid groups by month, like a photo library.
  const groups = useMemo(() => {
    if (inPlaylist || field !== 'date') return [{ title: '', items }];
    const out: { title: string; items: MediaItem[] }[] = [];
    for (const m of items) {
      const title = monthOf(m.createdAt);
      const last = out[out.length - 1];
      if (last?.title === title) last.items.push(m);
      else out.push({ title, items: [m] });
    }
    return out;
  }, [items, field, inPlaylist]);

  const crumb = inPlaylist ? (playlist?.name ?? '') : t(`mediaBin.views.${view}`);
  const renaming = useMemo(() => ({ id: renamingId, set: setRenamingId }), [renamingId]);

  // The toolbar gives things up as the bin narrows: first the extras, then the labels.
  const [barRef, barWidth] = useWidth();
  const bar = {
    roomy: barWidth === 0 || barWidth >= BAR_ROOMY,
    labels: barWidth === 0 || barWidth >= BAR_LABELS,
    tight: barWidth > 0 && barWidth < BAR_TIGHT,
  };
  return (
    <Renaming.Provider value={renaming}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--surface-0)]">
        <div
          ref={barRef}
          className="flex h-11 shrink-0 items-center gap-2 overflow-hidden border-b border-[var(--divider)] bg-[var(--surface-1)] px-3"
        >
          {/* Where you are, and how many. */}
          {bar.roomy && (
            <>
              <Typography size={12} tone="muted" className="shrink-0">
                {t('mediaBin.media')}
              </Typography>
              <Typography tone="muted" className="flex shrink-0">
                <ChevronRight size={12} />
              </Typography>
            </>
          )}
          <Typography
            size={13}
            weight="semibold"
            tone="primary"
            truncate
            className="min-w-[3rem] max-w-[14rem] shrink"
          >
            {crumb}
          </Typography>
          <Typography
            size={11}
            tone="muted"
            tabular
            className="shrink-0 rounded-full bg-[var(--surface-2)] px-1.5 py-px"
          >
            {items.length}
          </Typography>
          <span className="flex-1" />
          {/* Find and arrange. */}
          <label className="relative flex w-40 min-w-[6.5rem] shrink items-center">
            <Typography tone="muted" className="pointer-events-none absolute left-2 flex">
              <Search size={13} />
            </Typography>
            <input
              type="search"
              aria-label={t('mediaBin.search')}
              placeholder={t('mediaBin.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="field !h-7 !w-full min-w-0 !pl-7"
            />
          </label>
          {!inPlaylist && (
            <SortMenu field={field} desc={desc} onChange={setSort} compact={!bar.labels} />
          )}
          <Segmented<Layout>
            label={t('mediaBin.layout')}
            value={layout}
            onChange={(l) => layoutPref.commit(l === 'list' ? 1 : 0)}
            options={[
              {
                value: 'grid',
                label: bar.labels ? t('mediaBin.grid') : '',
                name: t('mediaBin.grid'),
                icon: <LayoutGrid size={13} />,
              },
              {
                value: 'list',
                label: bar.labels ? t('mediaBin.list') : '',
                name: t('mediaBin.list'),
                icon: <List size={13} />,
              },
            ]}
          />
          {layout === 'grid' && bar.labels && (
            <Slider
              format={(v) => percent(v, 160)}
              aria-label={t('mediaBin.size')}
              title={t('mediaBin.size')}
              min={110}
              max={280}
              step={10}
              value={size.size}
              onChange={(e) => size.preview(Number(e.target.value))}
              onPointerUp={(e) => size.commit(Number(e.currentTarget.value))}
              onKeyUp={(e) => size.commit(Number(e.currentTarget.value))}
              className="w-[104px] shrink-0"
            />
          )}
          {bar.roomy && (
            <>
              <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-[var(--divider)]" />
              {/* Act. */}
              <SoonFeature
                id="media-multiselect"
                label={t('mediaBin.select')}
                className="!h-7 shrink-0"
              />
            </>
          )}
          <Button
            size="xs"
            variant="primary"
            icon={<Plus size={13} />}
            onClick={() => void importMedia({ playlistId })}
            aria-label={t('media.add')}
            title={t('media.add')}
            className="shrink-0"
          >
            {bar.tight ? null : t('media.add')}
          </Button>
        </div>
        <div
          className={`min-h-0 flex-1 overflow-y-auto ${layout === 'list' ? 'px-2 pb-2' : 'px-4 pb-4'}`}
        >
          {items.length === 0 ? (
            <EmptyState
              icon={inPlaylist ? <ListVideo size={26} /> : <Film size={26} />}
              title={
                search
                  ? t('mediaBin.noMatch')
                  : inPlaylist
                    ? t('mediaBin.emptyPlaylist')
                    : view === 'favourites'
                      ? t('mediaBin.noFavourites')
                      : t('media.empty')
              }
            />
          ) : layout === 'list' ? (
            <>
              <ListHeader
                field={inPlaylist ? null : field}
                desc={desc}
                onSort={inPlaylist ? null : (f) => setSort(f, f === field ? !desc : DESC_FIRST[f])}
              />
              <ul aria-label={crumb} className="flex flex-col gap-px pt-1">
                {items.map((m, i) => (
                  <MediaRow key={m.id} m={m} playlistId={playlistId} index={i} />
                ))}
              </ul>
            </>
          ) : (
            groups.map((g) => (
              <section key={g.title || 'all'} className="pt-3">
                {g.title && (
                  <Typography as="h3" variant="title" className="pb-2.5">
                    {g.title}
                  </Typography>
                )}
                <ul
                  aria-label={g.title || crumb}
                  className="grid gap-x-3 gap-y-4"
                  style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size.size}px, 1fr))` }}
                >
                  {g.items.map((m, i) => (
                    <MediaTile key={m.id} m={m} playlistId={playlistId} index={i} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </Renaming.Provider>
  );
}

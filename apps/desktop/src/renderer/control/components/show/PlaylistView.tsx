import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlignLeft,
  Clock3,
  LayoutGrid,
  ListPlus,
  Megaphone,
  Plus,
  Repeat,
  Shuffle,
  SlidersHorizontal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ServiceItem } from '@lampstand/core';
import { Button, IconButton, Segmented, Slider, Typography, percent } from '@lampstand/ui';
import {
  goLiveSlide,
  runOnAnnouncementsLayer,
  stopAnnouncementsLayer,
  triggerSlide,
} from '../../lib/actions';
import { feature } from '../../lib/features';
import { useItemSlides } from '../../lib/hooks';
import { isLibraryDrag, readLibraryDrop } from '../../lib/libraryDrag';
import { itemTitle, sectionColor } from '../../lib/slides';
import { editItems, openDialog, useStore } from '../../lib/store';
import { EmptyState } from '../EmptyState';
import { KindTile } from '../kindIcons';
import { AddMenu } from '../ServicePanel';
import { editable, thumbScene } from '../SlideGrid';
import { SongControls } from '../SongControls';
import { ItemBackground } from '../ItemBackground';
import { takesBackground } from '../../lib/itemBackground';
import { SlideCard, SlideRow, type SlideState } from '../slides/SlideCards';
import { usePaneSize } from '../shell/Splitter';
import { type PresentableSlide } from '../../types';

/** A planned per-item tool: a dimmed icon with a small "soon" dot; the tooltip says what it'll do. */
function SoonTool({ id, icon }: { id: string; icon: ReactNode }) {
  const { t } = useTranslation();
  const f = feature(id);
  return (
    <Typography
      tone="muted"
      role="img"
      aria-label={`${f.name} (${t('soon.badge')})`}
      title={`${t('soon.tooltip', { name: f.name })}. ${f.description}`}
      className="relative flex h-6 w-6 items-center justify-center"
    >
      {icon}
      <span
        aria-hidden
        className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--soon)]"
      />
    </Typography>
  );
}

/** One playlist item: its header bar (icon, title, tools) and its slides. */
function ItemSection({
  item,
  selected,
  easy,
  thumbSize,
  register,
  onLibraryDrop,
}: {
  item: ServiceItem;
  selected: boolean;
  easy: boolean;
  thumbSize: number;
  register: (el: HTMLElement | null) => void;
  /** A song, verse or media dragged in from the library lands just before this item. */
  onLibraryDrop: (dropped: ServiceItem) => void;
}) {
  const [dropping, setDropping] = useState(false);
  const { t } = useTranslation();
  const { slides } = useItemSlides(item);
  const announcing = useStore((s) => s.announceItemId === item.id);
  const songs = useStore((s) => s.songs);
  const media = useStore((s) => s.media);
  const liveKey = useStore((s) => s.live?.program.content?.key);
  const liveCursor = useStore((s) => s.liveCursor);
  const previewCursor = useStore((s) => s.previewCursor);
  const thumbs = useMemo(() => slides.map(thumbScene), [slides]);
  const song = item.kind === 'song' ? songs.find((s) => s.id === item.songId) : undefined;
  const title = itemTitle(item, { songs, media });

  const stateOf = (slide: PresentableSlide, i: number): SlideState => {
    const here = (c: { itemId: string; index: number } | null): boolean =>
      c?.itemId === item.id && c.index === i;
    if (here(liveCursor) && (slide.action.kind !== 'content' || liveKey === slide.key))
      return 'live';
    if (here(previewCursor)) return 'preview';
    return 'idle';
  };
  const select = (): void => useStore.setState({ selectedItemId: item.id, adhoc: null });
  const click = (i: number): void => {
    select();
    void triggerSlide(item, i);
  };
  const live = (i: number): void => {
    select();
    void goLiveSlide(item, i);
  };
  const quickEdit = (i: number): void => {
    if (!editable(item)) return;
    useStore.setState({
      selectedItemId: item.id,
      editCursor: { itemId: item.id, index: i },
      mode: 'edit',
    });
  };

  return (
    <section
      ref={register}
      aria-label={title}
      className={`relative scroll-mt-1 ${dropping ? 'before:absolute before:inset-x-0 before:top-0 before:z-[2] before:h-0.5 before:bg-[var(--select)]' : ''}`}
      onDragOver={(e) => {
        if (!isLibraryDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        setDropping(false);
        if (!isLibraryDrag(e)) return;
        e.preventDefault();
        const dropped = readLibraryDrop(e);
        if (dropped) onLibraryDrop(dropped);
      }}
    >
      <header
        className={`sticky top-0 z-[1] flex h-9 items-center gap-2 border-b border-[var(--divider)] px-3 ${
          selected ? 'bg-[#2b3a55]' : 'bg-[var(--surface-1)]'
        }`}
      >
        <Button
          variant="bare"

          onClick={select}
          className="flex min-w-0 cursor-pointer items-center gap-2 text-left"
        >
          <KindTile kind={item.kind} size={20} />
          <Typography size={13} weight="semibold" truncate>
            {title}
          </Typography>
          <Typography variant="caption" className="shrink-0">
            {t('slides.count', { count: slides.length })}
          </Typography>
        </Button>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {song && item.kind === 'song' && selected && <SongControls item={item} song={song} />}
          {takesBackground(item) && <ItemBackground item={item} />}
          <SoonTool id="transitions" icon={<Shuffle size={14} />} />
          <SoonTool id="timeline" icon={<Clock3 size={14} />} />
          <SoonTool id="slide-actions" icon={<Repeat size={14} />} />
          {(item.kind === 'announcements' || item.kind === 'presentation') && (
            <IconButton
              size="2xs"
              variant="quiet"
              aria-label={announcing ? t('announce.stop') : t('announce.run')}
              aria-pressed={announcing}
              active={announcing}
              onClick={() =>
                void (announcing ? stopAnnouncementsLayer() : runOnAnnouncementsLayer(item))
              }
            >
              <Megaphone size={14} />
            </IconButton>
          )}
          {item.kind === 'media' && (
            <IconButton
              size="2xs"
              variant="quiet"
              aria-label={t('playback.open')}
              active={!!item.playback || item.loop || item.autoAdvance}
              onClick={() => openDialog('playback', { playbackItemId: item.id })}
            >
              <SlidersHorizontal size={14} />
            </IconButton>
          )}
        </div>
      </header>
      {/* The selected item's slides are "the" slide list; the others are named after their item. */}
      {easy ? (
        <ol
          aria-label={selected ? t('slides.list') : t('slides.itemSlides', { title })}
          className="flex flex-col gap-1.5 p-3"
        >
          {slides.map((slide, i) => (
            <SlideRow
              key={slide.key}
              slide={slide}
              index={i}
              state={stateOf(slide, i)}
              scene={thumbs[i]}
              onClick={() => click(i)}
              onDoubleClick={() => live(i)}
            />
          ))}
        </ol>
      ) : (
        <ol
          aria-label={selected ? t('slides.list') : t('slides.itemSlides', { title })}
          className="grid gap-3 p-3"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))` }}
        >
          {slides.map((slide, i) => (
            <SlideCard
              key={slide.key}
              slide={slide}
              index={i}
              scene={thumbs[i] ?? thumbScene(slide)}
              state={stateOf(slide, i)}
              hint={editable(item) ? t('slides.quickEditHint') : undefined}
              onClick={() => click(i)}
              onDoubleClick={() => live(i)}
              onContextMenu={(e) => {
                if (!editable(item)) return;
                e.preventDefault();
                quickEdit(i);
              }}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

type View = 'grid' | 'easy';

/**
 * Show workspace for a playlist: every item's slides on one scrolling page, in service order,
 * with sections as coloured bands, so the operator can see (and fire) anything without
 * switching items. Picking an item in the sidebar scrolls to it.
 */
export function PlaylistView() {
  const { t } = useTranslation();
  const service = useStore((s) => s.service);
  const selected = useStore((s) => s.selectedItemId);
  const thumb = usePaneSize('thumbWidth', 200, 130, 360);
  const view = usePaneSize('slideView', 0, 0, 1);
  const easy = view.size === 1;
  const sections = useRef(new Map<string, HTMLElement>());
  const items = service?.items ?? [];

  // Bring the selected item into view (e.g. after clicking it in the sidebar).
  useEffect(() => {
    if (!selected) return;
    sections.current.get(selected)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  const update = (fn: (xs: ServiceItem[]) => ServiceItem[]): void => editItems(fn);

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-[var(--surface-0)]"
      aria-label={t('slides.title')}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 && (
          <EmptyState icon={<ListPlus size={28} strokeWidth={1.5} />} title={t('service.empty')} />
        )}
        {items.map((item) =>
          item.kind === 'header' ? (
            <Typography
              as="div"
              size={15}
              tone="white"
              weight="semibold"
              key={item.id}
              role="heading"
              aria-level={2}
              className="flex h-9 items-center px-3"
              style={{ background: sectionColor(item.label) }}
            >
              {item.label}
            </Typography>
          ) : (
            <ItemSection
              key={item.id}
              item={item}
              selected={selected === item.id}
              easy={easy}
              thumbSize={thumb.size}
              onLibraryDrop={(dropped) => {
                update((xs) => {
                  const at = xs.findIndex((x) => x.id === item.id);
                  return [...xs.slice(0, at), dropped, ...xs.slice(at)];
                });
                useStore.setState({ selectedItemId: dropped.id, adhoc: null });
              }}
              register={(el) => {
                if (el) sections.current.set(item.id, el);
                else sections.current.delete(item.id);
              }}
            />
          ),
        )}
      </div>
      <div className="flex h-9 shrink-0 items-center gap-3 border-t border-[var(--divider)] bg-[var(--surface-1)] px-2">
        <AddMenu
          update={update}
          trigger={
            <Button size="xs" variant="ghost" icon={<Plus size={14} />}>
              {t('service.add')}
            </Button>
          }
        />
        <span className="flex-1" />
        <Segmented<View>
          label={t('slides.view')}
          value={easy ? 'easy' : 'grid'}
          onChange={(v) => view.commit(v === 'easy' ? 1 : 0)}
          options={[
            { value: 'grid', label: t('slides.viewGrid'), icon: <LayoutGrid size={13} /> },
            { value: 'easy', label: t('slides.viewEasy'), icon: <AlignLeft size={13} /> },
          ]}
        />
        {!easy && (
          <Slider
            format={(v) => percent(v, 200)}
            aria-label={t('slides.size')}
            title={t('slides.size')}
            min={130}
            max={360}
            step={10}
            value={thumb.size}
            onChange={(e) => thumb.preview(Number(e.target.value))}
            onPointerUp={(e) => thumb.commit(Number(e.currentTarget.value))}
            onKeyUp={(e) => thumb.commit(Number(e.currentTarget.value))}
            className="w-36 shrink-0"
          />
        )}
      </div>
    </section>
  );
}

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { newId, type ServiceItem } from '@lampstand/core';
import {
  Button,
  IconButton,
  Segmented,
  Slider,
  Typography,
  percent,
  typographyClass,
} from '@lampstand/ui';
import {
  goLiveSlide,
  runOnAnnouncementsLayer,
  stopAnnouncementsLayer,
  triggerSlide,
} from '../../lib/actions';
import { feature } from '../../lib/features';
import { useItemSlides } from '../../lib/hooks';
import { isLibraryDrag, readLibraryDrop } from '../../lib/libraryDrag';
import { insertInSection, intoSection, sectionHeaderAt } from '../../lib/sections';
import { itemTitle, sectionColor } from '../../lib/slides';
import { editItems, openDialog, updateItem, useStore } from '../../lib/store';
import { EmptyState } from '../EmptyState';
import { KindTile } from '../kindIcons';
import { AddMenu, SectionAdd } from '../ServicePanel';
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

/**
 * A section's coloured band: its name, "Add here" and "+" on the right. Things dragged from
 * the library onto it go into the section.
 */
function SectionBand({
  header,
  update,
}: {
  header: Extract<ServiceItem, { kind: 'header' }>;
  update: (fn: (xs: ServiceItem[]) => ServiceItem[]) => void;
}) {
  const [dropping, setDropping] = useState(false);
  return (
    <div
      data-section={header.label}
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
        if (!dropped) return;
        update((xs) => insertInSection(xs, header.id, [dropped]));
        useStore.setState({ selectedItemId: dropped.id, adhoc: null });
      }}
      className={dropping ? 'shadow-[inset_0_0_0_2px_var(--select)]' : ''}
    >
      <div
        className="flex h-9 items-center gap-2 px-3"
        style={{ background: sectionColor(header.label) }}
      >
        <Typography
          as="div"
          size={15}
          tone="white"
          weight="semibold"
          role="heading"
          aria-level={2}
          truncate
          className="min-w-0 flex-1"
        >
          {header.label}
        </Typography>
        <SectionAdd header={header} update={update} />
      </div>
    </div>
  );
}

/**
 * The end of a section: a "+" to add slides, a song, a countdown and the rest into it (an empty
 * section says so first).
 */
function SectionPlaceholder({
  header,
  empty,
  update,
}: {
  header: Extract<ServiceItem, { kind: 'header' }>;
  empty: boolean;
  update: (fn: (xs: ServiceItem[]) => ServiceItem[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="px-3 pb-3 pt-1">
      <AddMenu
        update={(fn) => update(intoSection(header.id, fn))}
        trigger={
          <Button
            variant="bare"
            className={`flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-[6px] border border-dashed border-[var(--hairline-strong)] text-[var(--text-3)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] ${typographyClass({ size: 12, weight: 'medium' })}`}
          >
            <Plus size={14} />
            {empty
              ? `${t('service.sectionEmpty')} ${t('service.addToSection', { name: header.label })}`
              : t('service.addToSection', { name: header.label })}
          </Button>
        }
      />
    </div>
  );
}

/** The last card of a text item: "+" adds a slide and opens it in Edit. */
function AddSlideCard({ item, list }: { item: ServiceItem; list: boolean }) {
  const { t } = useTranslation();
  const title = item.kind === 'presentation' ? item.title : t('service.kind.announcements');
  const add = (): void => {
    if (item.kind !== 'presentation' && item.kind !== 'announcements') return;
    const index = item.slides.length;
    updateItem(item.id, (x) =>
      x.kind === 'presentation' || x.kind === 'announcements'
        ? { ...x, slides: [...x.slides, { id: newId(), title: '', body: '' }] }
        : x,
    );
    useStore.setState({
      selectedItemId: item.id,
      editCursor: { itemId: item.id, index },
      mode: 'edit',
    });
  };
  return (
    <li>
      <Button
        variant="bare"
        aria-label={t('service.addSlideOf', { name: title })}
        title={t('service.addSlide')}
        onClick={add}
        className={`flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-[3px] border border-dashed border-[var(--hairline-strong)] text-[var(--text-3)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] ${
          list ? 'h-10 flex-row' : 'aspect-video h-auto'
        } ${typographyClass({ size: 12, weight: 'medium' })}`}
      >
        <Plus size={list ? 14 : 22} />
        {t('service.addSlide')}
      </Button>
    </li>
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
  const addsSlides = item.kind === 'presentation' || item.kind === 'announcements';
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
          {addsSlides && <AddSlideCard item={item} list />}
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
              onEdit={editable(item) ? () => quickEdit(i) : undefined}
              onContextMenu={(e) => {
                if (!editable(item)) return;
                e.preventDefault();
                quickEdit(i);
              }}
            />
          ))}
          {addsSlides && <AddSlideCard item={item} list={false} />}
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
        {items.map((item, i) => {
          // The section this row belongs to, and whether it is that section's last row.
          const header = sectionHeaderAt(items, i);
          const next = items[i + 1];
          const endsSection = !!header && (!next || next.kind === 'header');
          const placeholder = endsSection && (
            <SectionPlaceholder
              key={`${header.id}:add`}
              header={header}
              empty={item.kind === 'header'}
              update={update}
            />
          );
          return item.kind === 'header' ? (
            <Fragment key={item.id}>
              <SectionBand header={item} update={update} />
              {placeholder}
            </Fragment>
          ) : (
            <Fragment key={item.id}>
              <ItemSection
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
              {placeholder}
            </Fragment>
          );
        })}
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

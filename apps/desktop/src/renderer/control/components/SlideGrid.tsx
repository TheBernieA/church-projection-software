import { useMemo } from 'react';
import {
  AlignLeft,
  Keyboard,
  LayoutGrid,
  ListPlus,
  MousePointerClick,
  Pencil,
  Plus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { makeScene, newId, type Scene, type ServiceItem } from '@lampstand/core';
import { Button, Segmented } from '@lampstand/ui';
import { goLiveSlide, triggerSlide } from '../lib/actions';
import { useInService, useItemSlides, useSelectedItem } from '../lib/hooks';
import { itemTitle } from '../lib/slides';
import { addItemToService, updateItem, useStore } from '../lib/store';
import { AddCard } from './cards';
import { KindTile } from './kindIcons';
import { EmptyState } from './EmptyState';
import { SlideCard, SlideRow, type SlideState } from './slides/SlideCards';
import { SongControls } from './SongControls';
import { SoonFeature } from './Soon';
import { usePaneSize } from './shell/Splitter';
import { type PresentableSlide } from '../types';

type SlideView = 'grid' | 'easy';

export function thumbScene(slide: PresentableSlide): Scene {
  const a = slide.action;
  if (a.kind === 'content') return makeScene({ background: a.background, content: a.content });
  if (a.kind === 'media') return makeScene({ media: a.media });
  if (a.kind === 'web') return makeScene({ web: a.web });
  return makeScene({ background: a.background });
}

/** Items whose slides can be edited in the Edit workspace (Quick Edit, right-click). */
export function editable(item: ServiceItem): boolean {
  return (
    item.kind === 'song' ||
    item.kind === 'presentation' ||
    item.kind === 'announcements' ||
    item.kind === 'countdown'
  );
}

/**
 * The selected item's slides as a grid of thumbnails, each with a group-coloured label strip.
 * - `show` (Show workspace): click shows the slide (or loads Preview with "Preview first"),
 *   double-click always goes live, right-click is Quick Edit.
 * - `edit` (Edit workspace): click picks the slide the inspector edits.
 */
export function SlideGrid({ purpose = 'show' }: { purpose?: 'show' | 'edit' }) {
  const { t } = useTranslation();
  const item = useSelectedItem();
  const { slides, loading } = useItemSlides(item);
  const adhoc = useStore((s) => s.adhoc);
  const songs = useStore((s) => s.songs);
  const media = useStore((s) => s.media);
  const liveKey = useStore((s) => s.live?.program.content?.key);
  const previewCursor = useStore((s) => s.previewCursor);
  const liveCursor = useStore((s) => s.liveCursor);
  const editCursor = useStore((s) => s.editCursor);
  const inService = useInService(item);
  const thumb = usePaneSize('thumbWidth', 200, 130, 360);
  // Grid (thumbnails) or Easy (the words, large): remembered like the pane sizes.
  const view = usePaneSize('slideView', 0, 0, 1);
  const easy = view.size === 1;

  const isAdhoc = !!item && adhoc?.id === item.id;
  const song = item?.kind === 'song' ? songs.find((s) => s.id === item.songId) : undefined;
  // Stable scene objects: the grid re-renders on every live change, thumbnails shouldn't re-diff.
  const thumbScenes = useMemo(() => slides.map(thumbScene), [slides]);
  const editableText =
    inService && (item?.kind === 'presentation' || item?.kind === 'announcements');
  const addSlide = (): void => {
    if (!item || (item.kind !== 'presentation' && item.kind !== 'announcements')) return;
    const slide = { id: newId(), title: '', body: '' };
    updateItem<typeof item>(item.id, (x) => ({ ...x, slides: [...x.slides, slide] }));
    useStore.setState({ editCursor: { itemId: item.id, index: item.slides.length } });
  };
  const quickEdit = (it: ServiceItem, i: number): void => {
    if (!editable(it)) return;
    useStore.setState({ editCursor: { itemId: it.id, index: i }, mode: 'edit' });
  };
  const stateOf = (slide: PresentableSlide, i: number): SlideState => {
    if (!item) return 'idle';
    const here = (c: { itemId: string; index: number } | null): boolean =>
      c?.itemId === item.id && c.index === i;
    if (here(liveCursor) && (slide.action.kind !== 'content' || liveKey === slide.key))
      return 'live';
    if (here(previewCursor)) return 'preview';
    if ((purpose === 'edit' || editableText) && here(editCursor)) return 'editing';
    return 'idle';
  };
  const onClick = (it: ServiceItem, i: number): void => {
    if (purpose === 'edit') useStore.setState({ editCursor: { itemId: it.id, index: i } });
    else void triggerSlide(it, i);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label={t('slides.title')}>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--hairline)] px-3">
        {item && <KindTile kind={item.kind} size={22} />}
        <h2 className="min-w-0 truncate text-[14px] font-semibold">
          {item ? itemTitle(item, { songs, media }) : t('slides.title')}
        </h2>
        {item && slides.length > 0 && (
          <span className="shrink-0 text-[12px] text-[var(--text-3)]">
            {t('slides.count', { count: slides.length })}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {song && item?.kind === 'song' && (
            <>
              <SongControls item={item} song={song} />
              <SoonFeature id="group-hotkeys" compact icon={<Keyboard size={14} />} />
            </>
          )}
          {item && purpose === 'show' && editable(item) && song?.origin !== 'hymnal' && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Pencil size={14} />}
              onClick={() => useStore.setState({ mode: 'edit' })}
            >
              {t('library.edit')}
            </Button>
          )}
          {isAdhoc && (
            <Button
              size="sm"
              variant="primary"
              icon={<ListPlus size={15} />}
              onClick={() => addItemToService({ ...item, id: newId() })}
            >
              {t('slides.addToService')}
            </Button>
          )}
        </div>
      </div>
      {/* Padding leaves room for tally rings and the focus outline. */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!item && (
          <EmptyState
            icon={<MousePointerClick size={28} strokeWidth={1.5} />}
            title={t('slides.empty')}
          />
        )}
        {item && loading && (
          <p className="p-6 text-center text-[var(--text-3)]">{t('slides.loading')}</p>
        )}
        {item && !loading && slides.length === 0 && (
          <p className="p-6 text-center text-[var(--text-3)]">{t('slides.noSlides')}</p>
        )}
        {item && easy && (
          <ol aria-label={t('slides.list')} className="flex flex-col gap-1.5">
            {slides.map((slide, i) => (
              <SlideRow
                key={slide.key}
                slide={slide}
                index={i}
                state={stateOf(slide, i)}
                onClick={() => onClick(item, i)}
                onDoubleClick={() => void goLiveSlide(item, i)}
              />
            ))}
          </ol>
        )}
        {!easy && (
          <ol
            aria-label={t('slides.list')}
            className="grid gap-3.5"
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumb.size}px, 1fr))` }}
          >
            {item &&
              slides.map((slide, i) => (
                <SlideCard
                  key={slide.key}
                  slide={slide}
                  index={i}
                  scene={thumbScenes[i] ?? thumbScene(slide)}
                  state={stateOf(slide, i)}
                  hint={
                    purpose === 'show' && editable(item) ? t('slides.quickEditHint') : undefined
                  }
                  onClick={() => onClick(item, i)}
                  onDoubleClick={() => void goLiveSlide(item, i)}
                  onContextMenu={(e) => {
                    if (purpose !== 'show' || !editable(item)) return;
                    e.preventDefault();
                    quickEdit(item, i);
                  }}
                />
              ))}
            {editableText && (
              <li>
                <AddCard
                  label={t('inspector.addSlide')}
                  onClick={addSlide}
                  className="aspect-[16/10.4] w-full rounded-[6px] text-[13px]"
                  icon={<Plus size={22} strokeWidth={1.75} />}
                />
              </li>
            )}
          </ol>
        )}
      </div>
      {item && slides.length > 0 && (
        <div className="flex h-10 shrink-0 items-center justify-end gap-3 border-t border-[var(--hairline)] px-3">
          <Segmented<SlideView>
            label={t('slides.view')}
            value={easy ? 'easy' : 'grid'}
            onChange={(v) => view.commit(v === 'easy' ? 1 : 0)}
            options={[
              { value: 'grid', label: t('slides.viewGrid'), icon: <LayoutGrid size={13} /> },
              { value: 'easy', label: t('slides.viewEasy'), icon: <AlignLeft size={13} /> },
            ]}
          />
          {!easy && (
            <input
              type="range"
              aria-label={t('slides.size')}
              title={t('slides.size')}
              min={130}
              max={360}
              step={10}
              value={thumb.size}
              onChange={(e) => thumb.preview(Number(e.target.value))}
              onPointerUp={(e) => thumb.commit(Number(e.currentTarget.value))}
              onKeyUp={(e) => thumb.commit(Number(e.currentTarget.value))}
              className="h-1.5 w-28 accent-[var(--accent)]"
            />
          )}
        </div>
      )}
    </section>
  );
}

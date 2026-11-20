import { ListPlus, MousePointerClick, Pencil, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { newId, type ServiceItem } from '@lampstand/core';
import { editable } from '../lib/slideThumbs';
import { Button, Typography, typographyClass } from '@lampstand/ui';
import { goLiveSlide, triggerSlide } from '../lib/actions';
import { useInService, useItemSlides, useSelectedItem } from '../lib/hooks';
import { itemTitle } from '../lib/slides';
import { addItemToService, updateItem, useStore } from '../lib/store';
import { AddCard } from './cards';
import { KindTile } from './kindIcons';
import { EmptyState } from './EmptyState';
import { type SlideState } from './slides/SlideCards';
import { ItemSlides, SlideViewControls, useSlideViewPrefs } from './slides/ItemSlides';
import { DefaultTransitions } from './slides/Transitions';
import { SongControls } from './SongControls';
import { ItemBackground } from './ItemBackground';
import { takesBackground } from '../lib/itemBackground';
import { type PresentableSlide } from '../types';
import { openEditor } from '../lib/editing';

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
  const bookNames = useStore((s) => s.bookNames);
  const liveKey = useStore((s) => s.live?.program.content?.key);
  const previewCursor = useStore((s) => s.previewCursor);
  const liveCursor = useStore((s) => s.liveCursor);
  const editCursor = useStore((s) => s.editCursor);
  const inService = useInService(item);
  // Grid, Easy or Table, and the thumbnails' size and backdrop: remembered like the pane sizes.
  const prefs = useSlideViewPrefs();

  const isAdhoc = !!item && adhoc?.id === item.id;
  const song = item?.kind === 'song' ? songs.find((s) => s.id === item.songId) : undefined;
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
    openEditor(false, { editCursor: { itemId: it.id, index: i } });
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
    <section
      className="@container flex min-h-0 min-w-0 flex-1 flex-col"
      aria-label={t('slides.title')}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--hairline)] px-3">
        {item && <KindTile kind={item.kind} size={22} />}
        <Typography as="h2" variant="title" truncate className="min-w-0">
          {item ? itemTitle(item, { songs, media, bookNames }) : t('slides.title')}
        </Typography>
        {item && slides.length > 0 && (
          <Typography variant="caption" className="shrink-0">
            {t('slides.count', { count: slides.length })}
          </Typography>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {takesBackground(item) && <ItemBackground item={item} />}
          {song && item?.kind === 'song' && <SongControls item={item} song={song} />}
          {item && purpose === 'show' && editable(item) && song?.origin !== 'hymnal' && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Pencil size={14} />}
              onClick={() => openEditor(false)}
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
          <Typography as="p" tone="muted" className="p-6 text-center">
            {t('slides.loading')}
          </Typography>
        )}
        {item && !loading && slides.length === 0 && (
          <Typography as="p" tone="muted" className="p-6 text-center">
            {t('slides.noSlides')}
          </Typography>
        )}
        {item && slides.length > 0 && (
          <ItemSlides
            item={item}
            slides={slides}
            prefs={prefs}
            stateOf={stateOf}
            onClick={(i) => onClick(item, i)}
            onDoubleClick={(i) => void goLiveSlide(item, i)}
            onQuickEdit={
              purpose === 'show' && editable(item) ? (i) => quickEdit(item, i) : undefined
            }
            hint={purpose === 'show' && editable(item) ? t('slides.quickEditHint') : undefined}
            label={t('slides.list')}
            add={
              editableText
                ? (list) => (
                    <li>
                      <AddCard
                        label={t('inspector.addSlide')}
                        onClick={addSlide}
                        className={`${list ? 'h-10 w-full' : 'aspect-[16/10.4] w-full'} rounded-[6px] ${typographyClass({ size: 13 })}`}
                        icon={<Plus size={list ? 16 : 22} strokeWidth={1.75} />}
                      />
                    </li>
                  )
                : undefined
            }
          />
        )}
      </div>
      {item && slides.length > 0 && (
        <div className="flex h-10 shrink-0 items-center gap-3 overflow-hidden border-t border-[var(--hairline)] px-3 @max-[560px]:gap-1.5 @max-[560px]:px-2">
          <DefaultTransitions />
          <span className="flex-1" />
          <SlideViewControls prefs={prefs} />
        </div>
      )}
    </section>
  );
}

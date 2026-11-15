import { useMemo } from 'react';
import { Keyboard, ListPlus, MousePointerClick, Pencil, Plus, Shuffle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { makeScene, newId, type Scene, type ServiceItem } from '@lampstand/core';
import { Button, TallyTag } from '@lampstand/ui';
import { goLiveSlide, triggerSlide } from '../lib/actions';
import { useInService, useItemSlides, useSelectedItem } from '../lib/hooks';
import { groupColor, itemTitle, type PresentableSlide } from '../lib/slides';
import { addItemToService, updateItem, useStore } from '../lib/store';
import { AddCard } from './cards';
import { KindTile } from './kind-icons';
import { EmptyState } from './EmptyState';
import { SceneView } from './SceneView';
import { SoonFeature } from './Soon';
import { usePaneSize } from './shell/Splitter';

function thumbScene(slide: PresentableSlide): Scene {
  const a = slide.action;
  if (a.kind === 'content') return makeScene({ background: a.background, content: a.content });
  if (a.kind === 'media') return makeScene({ media: a.media });
  return makeScene({ background: a.background });
}

/** Items whose slides can be edited in the Edit workspace (Quick Edit, right-click). */
function editable(item: ServiceItem): boolean {
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
  const live = useStore((s) => s.live);
  const previewCursor = useStore((s) => s.previewCursor);
  const liveCursor = useStore((s) => s.liveCursor);
  const editCursor = useStore((s) => s.editCursor);
  const inService = useInService(item);
  const thumb = usePaneSize('thumbWidth', 200, 130, 360);

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
          {song && (
            <>
              <SoonFeature
                id="arrangements"
                icon={<Shuffle size={14} />}
                label={t('slides.arrangement')}
              />
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
            className="h-1.5 w-24 accent-[var(--accent)]"
          />
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
        <ol
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumb.size}px, 1fr))` }}
        >
          {item &&
            slides.map((slide, i) => {
              const isLive =
                liveCursor?.itemId === item.id &&
                liveCursor.index === i &&
                (slide.action.kind !== 'content' || live?.program.content?.key === slide.key);
              const isPreview =
                !isLive && previewCursor?.itemId === item.id && previewCursor.index === i;
              const isEditing =
                (purpose === 'edit' || editableText) &&
                editCursor?.itemId === item.id &&
                editCursor.index === i;
              const color = groupColor(slide.group);
              return (
                <li key={slide.key}>
                  <button
                    type="button"
                    onClick={() => onClick(item, i)}
                    onDoubleClick={() => void goLiveSlide(item, i)}
                    onContextMenu={(e) => {
                      if (purpose !== 'show' || !editable(item)) return;
                      e.preventDefault();
                      quickEdit(item, i);
                    }}
                    title={
                      purpose === 'show' && editable(item) ? t('slides.quickEditHint') : undefined
                    }
                    aria-label={`${slide.label}${isLive ? ` — ${t('monitor.program')}` : ''}${isPreview ? ` — ${t('monitor.preview')}` : ''}`}
                    style={
                      isLive
                        ? { boxShadow: 'var(--tally-program-glow)' }
                        : isPreview
                          ? { boxShadow: '0 0 0 2px var(--tally-preview)' }
                          : isEditing
                            ? { boxShadow: '0 0 0 2px var(--accent)' }
                            : undefined
                    }
                    aria-current={isEditing || undefined}
                    className={`group block w-full cursor-pointer overflow-hidden rounded-[4px] bg-[var(--surface-2)] text-left focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--accent)] ${
                      isLive || isPreview || isEditing
                        ? ''
                        : 'shadow-[0_0_0_1px_var(--hairline-strong)] hover:shadow-[0_0_0_1px_var(--text-3)]'
                    }`}
                  >
                    <div className="relative">
                      <SceneView scene={thumbScenes[i] ?? thumbScene(slide)} mode="thumbnail" />
                      <span className="tnum absolute left-1.5 top-1.5 rounded-[3px] bg-black/55 px-1 text-[10px] font-semibold text-white/85">
                        {i + 1}
                      </span>
                      {isLive && <TallyTag tone="program">LIVE</TallyTag>}
                      {isPreview && (
                        <TallyTag tone="preview">{t('monitor.preview').toUpperCase()}</TallyTag>
                      )}
                    </div>
                    {/* Group strip: the colour IS the group, so you can find the chorus by eye. */}
                    <div
                      className="flex h-6 items-center px-2 text-[11px] font-semibold"
                      style={
                        color
                          ? { background: color, color: '#fff' }
                          : { background: 'var(--surface-3)', color: 'var(--text-2)' }
                      }
                    >
                      <span className="truncate">{slide.label}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          {editableText && (
            <li>
              <AddCard
                label={t('inspector.addSlide')}
                onClick={addSlide}
                className="aspect-[16/10.4] w-full rounded-[4px] text-[13px]"
                icon={<Plus size={22} strokeWidth={1.75} />}
              />
            </li>
          )}
        </ol>
      </div>
    </section>
  );
}

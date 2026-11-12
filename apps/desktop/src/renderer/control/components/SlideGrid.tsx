import { useMemo } from 'react';
import { ListPlus, MousePointerClick, Pencil, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { makeScene, newId, type Scene, type ServiceItem } from '@lampstand/core';
import { Button, PanelHeader } from '@lampstand/ui';
import { goLiveSlide, previewSlide } from '../lib/actions';
import { useItemSlides, useSelectedItem } from '../lib/hooks';
import { itemTitle, type PresentableSlide } from '../lib/slides';
import { addItemToService, EMPTY_LIST, openDialog, updateItem, useStore } from '../lib/store';
import { KindTile } from './kind-icons';
import { SceneView } from './SceneView';

/** Section colours (Verse/Chorus/Bridge…). Never red or green — those mean live/preview. */
const GROUP_COLORS: Record<string, string> = {
  verse: '#5b8def',
  chorus: '#a78bfa',
  bridge: '#f0a04b',
  'pre-chorus': '#4cc0e8',
  tag: '#9aa3b8',
};
function groupColor(label?: string): string | undefined {
  if (!label) return undefined;
  const l = label.toLowerCase();
  const k = Object.keys(GROUP_COLORS).find(
    (g) => l.startsWith(g) || (g === 'chorus' && l.startsWith('refrain')),
  );
  return k ? GROUP_COLORS[k] : '#7c8499';
}

function thumbScene(slide: PresentableSlide): Scene {
  const a = slide.action;
  if (a.kind === 'content') return makeScene({ background: a.background, content: a.content });
  if (a.kind === 'media') return makeScene({ media: a.media });
  return makeScene({ background: a.background });
}

export function SlideGrid() {
  const { t } = useTranslation();
  const item = useSelectedItem();
  const { slides, loading } = useItemSlides(item);
  const adhoc = useStore((s) => s.adhoc);
  const songs = useStore((s) => s.songs);
  const media = useStore((s) => s.media);
  const live = useStore((s) => s.live);
  const previewCursor = useStore((s) => s.previewCursor);
  const liveCursor = useStore((s) => s.liveCursor);
  const liveEditing = useStore((s) => s.settings?.liveEditingKinds ?? EMPTY_LIST);
  const addToService = addItemToService;

  const isAdhoc = !!item && adhoc?.id === item.id;
  const song = item?.kind === 'song' ? songs.find((s) => s.id === item.songId) : undefined;

  // Stable scene objects: SlideGrid re-renders on every live change, thumbnails shouldn't re-diff.
  const thumbScenes = useMemo(() => slides.map(thumbScene), [slides]);
  const editCursor = useStore((s) => s.editCursor);
  const inService = useStore((s) => !!item && !!s.service?.items.some((x) => x.id === item.id));
  const editableText =
    inService && (item?.kind === 'presentation' || item?.kind === 'announcements');
  const addSlide = (): void => {
    if (!item || (item.kind !== 'presentation' && item.kind !== 'announcements')) return;
    const slide = { id: newId(), title: '', body: '' };
    updateItem<typeof item>(item.id, (x) => ({ ...x, slides: [...x.slides, slide] }));
    useStore.setState({ editCursor: { itemId: item.id, index: item.slides.length } });
  };

  const onClick = (it: ServiceItem, i: number): void => {
    useStore.setState({ editCursor: { itemId: it.id, index: i } });
    if (liveEditing.includes(it.kind)) void goLiveSlide(it, i);
    else void previewSlide(it, i);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label={t('slides.title')}>
      <PanelHeader
        icon={item ? <KindTile kind={item.kind} size={24} /> : undefined}
        title={item ? itemTitle(item, { songs, media }) : t('slides.title')}
        subtitle={item && slides.length ? t('slides.count', { count: slides.length }) : undefined}
        actions={
          item && (
            <>
              {song && song.origin !== 'hymnal' && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Pencil size={14} />}
                  onClick={() => openDialog('song', { editingSongId: song.id })}
                >
                  {t('library.edit')}
                </Button>
              )}
              {isAdhoc && (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<ListPlus size={15} />}
                  onClick={() => addToService({ ...item, id: newId() })}
                >
                  {t('slides.addToService')}
                </Button>
              )}
            </>
          )
        }
      />
      {/* Top/side padding leaves room for tally rings, focus outline and the hover lift. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2">
        {!item && (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 text-center text-[var(--text-3)]">
            <MousePointerClick size={28} strokeWidth={1.5} />
            <p className="max-w-72 text-[13px]">{t('slides.empty')}</p>
          </div>
        )}
        {item && loading && (
          <p className="p-6 text-center text-[var(--text-3)]">{t('slides.loading')}</p>
        )}
        {item && !loading && slides.length === 0 && (
          <p className="p-6 text-center text-[var(--text-3)]">{t('slides.noSlides')}</p>
        )}
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3">
          {item &&
            slides.map((slide, i) => {
              const isLive =
                liveCursor?.itemId === item.id &&
                liveCursor.index === i &&
                (slide.action.kind !== 'content' || live?.program.content?.key === slide.key);
              const isPreview =
                !isLive && previewCursor?.itemId === item.id && previewCursor.index === i;
              const isEditing =
                editableText && editCursor?.itemId === item.id && editCursor.index === i;
              const color = groupColor(slide.group);
              return (
                <li key={slide.key}>
                  <button
                    type="button"
                    onClick={() => onClick(item, i)}
                    onDoubleClick={() => void goLiveSlide(item, i)}
                    aria-label={`${slide.label}${isLive ? ` — ${t('monitor.program')}` : ''}${isPreview ? ` — ${t('monitor.preview')}` : ''}`}
                    // Keyboard focus is an outline, so it never hides the live/preview tally ring.
                    style={
                      isLive
                        ? { boxShadow: 'var(--tally-program-glow)' }
                        : isPreview
                          ? { boxShadow: '0 0 0 2px var(--tally-preview)' }
                          : isEditing
                            ? { boxShadow: '0 0 0 2px var(--accent-line)' }
                            : undefined
                    }
                    aria-current={isEditing || undefined}
                    className={`group block w-full cursor-pointer overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-2)] text-left transition-transform duration-150 will-change-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--accent)] ${
                      isLive || isPreview || isEditing
                        ? ''
                        : 'shadow-[var(--shadow-1)] hover:shadow-[var(--shadow-2)] focus-visible:shadow-[var(--shadow-2)]'
                    }`}
                  >
                    <div className="relative">
                      <SceneView scene={thumbScenes[i] ?? thumbScene(slide)} mode="thumbnail" />
                      {isLive && (
                        <span className="absolute right-2 top-2 rounded-[5px] bg-[var(--tally-program)] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white shadow-md">
                          LIVE
                        </span>
                      )}
                      {isPreview && (
                        <span className="absolute right-2 top-2 rounded-[5px] bg-[var(--tally-preview)] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white shadow-md">
                          {t('monitor.preview').toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex h-9 items-center gap-2 px-3">
                      <span className="tnum text-[12px] font-medium text-[var(--text-3)]">
                        {i + 1}
                      </span>
                      {color ? (
                        <span
                          className="inline-flex min-w-0 items-center gap-1.5 truncate rounded-[5px] px-1.5 py-0.5 text-[12px] font-medium"
                          style={{ background: `${color}22`, color }}
                        >
                          {slide.label}
                        </span>
                      ) : (
                        <span className="truncate text-[12px] font-medium text-[var(--text-2)]">
                          {slide.label}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          {editableText && (
            <li>
              <button
                type="button"
                onClick={addSlide}
                className="flex aspect-[16/10.4] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-[var(--hairline-strong)] text-[13px] font-medium text-[var(--text-3)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
              >
                <Plus size={22} strokeWidth={1.75} />
                {t('inspector.addSlide')}
              </button>
            </li>
          )}
        </ol>
      </div>
    </section>
  );
}

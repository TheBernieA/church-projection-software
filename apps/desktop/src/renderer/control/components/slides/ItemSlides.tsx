import { useMemo, type MouseEvent, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  AlignLeft,
  Check,
  Image as ImageIcon,
  LayoutGrid,
  MoreHorizontal,
  Rows3,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ServiceItem } from '@lampstand/core';
import { IconButton, Segmented, Slider, Typography, percent } from '@lampstand/ui';
import { goLiveSlide, putBehindWords, showBackgroundLayer } from '../../lib/actions';
import { cmd } from '../../lib/api';
import { groupStarts } from '../../lib/groupKeys';
import {
  sameBackground,
  setSlideBackground,
  takesSlideBackgrounds,
} from '../../lib/itemBackground';
import { knownDuration } from '../../lib/mediaDurations';
import { patchItem, useStore } from '../../lib/store';
import { BackgroundMenu, ItemBackground, Swatch } from '../ItemBackground';
import { LayerGlyph } from './Transitions';
import { ITEM_CLASS, MENU_CLASS, MENU_LABEL_CLASS, SEPARATOR_CLASS } from '../menu';
import { thumbScene } from '../../lib/slideThumbs';
import { usePaneSize } from '../shell/Splitter';
import { type PresentableSlide } from '../../types';
import {
  BACKDROPS,
  BackgroundCard,
  SlideCard,
  SlideRow,
  SlideTableRow,
  TILE_TOOL,
  type Backdrop,
  type SlideState,
} from './SlideCards';

export type SlideView = 'grid' | 'easy' | 'table';
const VIEWS: SlideView[] = ['grid', 'easy', 'table'];

/** How slides are shown (remembered like the pane sizes): view, size, by group, backdrop. */
export function useSlideViewPrefs() {
  const thumb = usePaneSize('thumbWidth', 200, 130, 360);
  const view = usePaneSize('slideView', 0, 0, VIEWS.length - 1);
  const byGroup = usePaneSize('slidesByGroup', 0, 0, 1);
  const backdrop = usePaneSize('thumbBackdrop', 0, 0, BACKDROPS.length - 1);
  return {
    thumb,
    view: VIEWS[view.size] ?? 'grid',
    setView: (v: SlideView) => view.commit(VIEWS.indexOf(v)),
    byGroup: byGroup.size === 1,
    setByGroup: (on: boolean) => byGroup.commit(on ? 1 : 0),
    backdrop: BACKDROPS[backdrop.size] ?? 'checker',
    setBackdrop: (b: Backdrop) => backdrop.commit(BACKDROPS.indexOf(b)),
  };
}
export type SlideViewPrefs = ReturnType<typeof useSlideViewPrefs>;

const VIEW_OPTIONS: { value: SlideView; label: string; icon: React.ReactNode }[] = [
  { value: 'grid', label: 'slides.viewGrid', icon: <LayoutGrid size={13} /> },
  { value: 'easy', label: 'slides.viewEasy', icon: <AlignLeft size={13} /> },
  { value: 'table', label: 'slides.viewTable', icon: <Rows3 size={13} /> },
];

/**
 * The view controls at the bottom right of the slides: Grid, Easy or Table; the view's options
 * (slides by group, what shows through transparent thumbnails); and the thumbnail size.
 */
export function SlideViewControls({ prefs }: { prefs: SlideViewPrefs }) {
  const { t } = useTranslation();
  return (
    <>
      {/* Named in full where there's room; icons alone in a narrow pane. */}
      {(['wide', 'narrow'] as const).map((fit) => (
        <span
          key={fit}
          className={`shrink-0 ${fit === 'wide' ? '@max-[640px]:hidden' : 'hidden @max-[640px]:block'}`}
        >
          <Segmented<SlideView>
            label={t('slides.view')}
            value={prefs.view}
            onChange={prefs.setView}
            options={VIEW_OPTIONS.map((v) => ({
              value: v.value,
              label: fit === 'wide' ? t(v.label) : '',
              name: t(v.label),
              icon: v.icon,
            }))}
          />
        </span>
      ))}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <IconButton size="xs" variant="quiet" aria-label={t('slides.viewOptions')}>
            <MoreHorizontal size={15} />
          </IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={6} className={MENU_CLASS}>
            <DropdownMenu.CheckboxItem
              className={ITEM_CLASS}
              checked={prefs.byGroup}
              onCheckedChange={prefs.setByGroup}
            >
              <Typography className="flex-1">{t('slides.byGroup')}</Typography>
              {prefs.byGroup && <Check size={14} />}
            </DropdownMenu.CheckboxItem>
            <DropdownMenu.Separator className={SEPARATOR_CLASS} />
            <DropdownMenu.Label className={MENU_LABEL_CLASS}>
              {t('slides.backdropTitle')}
            </DropdownMenu.Label>
            <DropdownMenu.RadioGroup
              value={prefs.backdrop}
              onValueChange={(v) => prefs.setBackdrop(v as Backdrop)}
            >
              {BACKDROPS.map((b) => (
                <DropdownMenu.RadioItem key={b} value={b} className={ITEM_CLASS}>
                  <span
                    aria-hidden
                    className={`h-3.5 w-6 shrink-0 rounded-[3px] shadow-[0_0_0_1px_var(--hairline-strong)] ls-backdrop-${b}`}
                  />
                  <Typography className="flex-1">{t(`slides.backdrop.${b}`)}</Typography>
                  {prefs.backdrop === b && <Check size={14} />}
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {prefs.view === 'grid' && (
        <Slider
          format={(v) => percent(v, 200)}
          aria-label={t('slides.size')}
          title={t('slides.size')}
          min={130}
          max={360}
          step={10}
          value={prefs.thumb.size}
          onChange={(e) => prefs.thumb.preview(Number(e.target.value))}
          onPointerUp={(e) => prefs.thumb.commit(Number(e.currentTarget.value))}
          onKeyUp={(e) => prefs.thumb.commit(Number(e.currentTarget.value))}
          className="w-36 shrink-0 @max-[640px]:w-20 @max-[420px]:hidden"
        />
      )}
    </>
  );
}

/** The background button at a slide's top left: its own background, or the item's. */
function SlideBackgroundButton({
  item,
  slide,
  n,
}: {
  item: Extract<ServiceItem, { kind: 'song' | 'scripture' | 'presentation' | 'announcements' }>;
  slide: PresentableSlide;
  /** Its number: the button is named by it ("Background of slide 3"). */
  n: number;
}) {
  const { t } = useTranslation();
  const own = item.slideBackgrounds?.[slide.key];
  const label = own ? t('slides.slideBgOwn', { n }) : t('slides.slideBg', { n });
  return (
    <BackgroundMenu
      align="start"
      current={own}
      onPick={(bg) => setSlideBackground(item, slide.key, bg)}
      title={t('slides.slideBgTitle')}
      defaultLabel={t('slides.slideBgItem')}
      trigger={
        <IconButton
          size="2xs"
          variant="bare"
          aria-label={label}
          title={label}
          onDoubleClick={(e: MouseEvent) => e.stopPropagation()}
          className={`${TILE_TOOL} ${own ? '' : 'opacity-0 focus-visible:opacity-100 group-hover/slide:opacity-100 data-[state=open]:opacity-100'}`}
        >
          {own ? <Swatch bg={own} size="sm" /> : <ImageIcon size={12} />}
        </IconButton>
      }
    />
  );
}

/**
 * An item's slides in the chosen view. In Grid, items whose slides share a background show it
 * as the first tile, and their slides as words over a transparent backdrop (a slide with a
 * background of its own shows it); each section's first slide carries its hotkey letter.
 */
export function ItemSlides({
  item,
  slides,
  prefs,
  stateOf,
  onClick,
  onDoubleClick,
  onQuickEdit,
  hint,
  label,
  add,
  className = '',
}: {
  item: ServiceItem;
  slides: PresentableSlide[];
  prefs: SlideViewPrefs;
  stateOf: (slide: PresentableSlide, i: number) => SlideState;
  onClick: (i: number) => void;
  onDoubleClick: (i: number) => void;
  /** Editable items: the pencil and right-click open the slide in Edit. */
  onQuickEdit?: ((i: number) => void) | undefined;
  hint?: string | undefined;
  label: string;
  /** The "add a slide" card, for items you can add slides to. */
  add?: ((list: boolean) => ReactNode) | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const media = useStore((s) => s.media);
  const onScreen = useStore((s) => s.live?.program.background?.ref);
  const liveHere = useStore((s) => s.liveCursor?.itemId === item.id);
  // Items whose slides can each have a background (the rest keep theirs on their thumbnails).
  const layeredItem = takesSlideBackgrounds(item) ? item : null;
  const layered = !!layeredItem;
  const transparentAt = (s: PresentableSlide): boolean =>
    layered && s.action.kind === 'content' && !s.ownBackground;
  // Stable scene objects: the grid re-renders on every live change, thumbnails shouldn't re-diff.
  const scenes = useMemo(
    () =>
      slides.map((s) => thumbScene(s, layered && s.action.kind === 'content' && !s.ownBackground)),
    [slides, layered],
  );
  const badges = useMemo(() => groupStarts(slides), [slides]);
  // A picture or video: over everything, or behind the words (its layer, switched on its tile).
  const layer =
    item.kind === 'media'
      ? {
          behind: item.asBackground,
          onToggle: () => {
            const behind = !item.asBackground;
            patchItem<typeof item>(item, { asBackground: behind });
            // On screen now: it moves to its new layer straight away.
            if (useStore.getState().liveCursor?.itemId !== item.id) return;
            const m = useStore.getState().media.find((x) => x.id === item.mediaId);
            if (!m || m.kind === 'audio') return;
            void (behind
              ? putBehindWords({ mediaId: m.id, kind: m.kind })
              : goLiveSlide({ ...item, asBackground: false }, 0));
          },
        }
      : undefined;
  // The item's own picture or video can play on either layer (its tile's corner icon): behind
  // the words, or over everything as a cue of its own.
  const ownBg = layeredItem?.background;
  const switchable = ownBg?.kind === 'image' || ownBg?.kind === 'video';
  const over = switchable && !!layeredItem?.backgroundOver;
  // The background the tile shows: the cue over everything, else what the slides sit on (the
  // item's own, or its theme's).
  const shared = useMemo(() => {
    if (over) return { ref: ownBg };
    const first = slides.find((s) => s.action.kind === 'content' && !s.ownBackground);
    return first?.action.kind === 'content' ? first.action.background : null;
  }, [slides, over, ownBg]);
  const sharedScene = useMemo(
    () =>
      shared
        ? thumbScene(
            { key: 'bg', label: '', action: { kind: 'background', background: shared } },
            false,
          )
        : null,
    [shared],
  );
  const ref = shared?.ref;
  const programMediaId = useStore((s) => s.live?.program.media?.mediaId);
  const cueLive =
    over && (ref?.kind === 'image' || ref?.kind === 'video') && programMediaId === ref.mediaId;
  /** The tile clicked: over everything, the picture full screen; else behind the words. */
  const showShared = (): void => {
    if (over && (ref?.kind === 'image' || ref?.kind === 'video')) {
      void cmd('live.goLive', {
        media: {
          mediaId: ref.mediaId,
          kind: ref.kind,
          loop: ref.kind === 'video' ? ref.loop : false,
          muted: false,
          fit: 'cover',
          playing: true,
          position: 0,
          volume: 1,
        },
        content: null,
        next: null,
      }).catch(() => undefined);
      return;
    }
    void showBackgroundLayer(shared);
  };
  const toggleLayer = (): void => {
    if (!layeredItem || !ownBg) return;
    patchItem<typeof layeredItem>(layeredItem, { backgroundOver: !over });
    // Its picture on screen over everything, now set behind: it moves behind the words.
    if (over && programMediaId === ownBg.mediaId)
      void putBehindWords({ mediaId: ownBg.mediaId, kind: ownBg.kind });
  };
  const duration =
    ref?.kind === 'video'
      ? knownDuration(ref.mediaId, media.find((m) => m.id === ref.mediaId)?.durationSec)
      : undefined;

  if (prefs.view === 'easy')
    return (
      <ol aria-label={label} className={`flex flex-col gap-1.5 ${className}`}>
        {slides.map((slide, i) => (
          <SlideRow
            key={slide.key}
            slide={slide}
            index={i}
            state={stateOf(slide, i)}
            scene={scenes[i]}
            onClick={() => onClick(i)}
            onDoubleClick={() => onDoubleClick(i)}
          />
        ))}
        {add?.(true)}
      </ol>
    );
  if (prefs.view === 'table')
    return (
      <ol aria-label={label} className={`flex flex-col gap-1 ${className}`}>
        {slides.map((slide, i) => (
          <SlideTableRow
            key={slide.key}
            slide={slide}
            index={i}
            state={stateOf(slide, i)}
            scene={scenes[i] ?? thumbScene(slide, false)}
            transparent={transparentAt(slide)}
            backdrop={prefs.backdrop}
            badge={badges.get(i)}
            onClick={() => onClick(i)}
            onDoubleClick={() => onDoubleClick(i)}
          />
        ))}
        {add?.(true)}
      </ol>
    );
  // The background tile shares the grid but isn't one of the slides (the list holds those).
  return (
    <div
      className={`grid gap-3 ${className}`}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${prefs.thumb.size}px, 1fr))` }}
    >
      {layeredItem && slides.length > 0 && (
        <BackgroundCard
          scene={sharedScene}
          live={over ? cueLive : liveHere && !!ref && sameBackground(ref, onScreen)}
          duration={duration}
          backdrop={prefs.backdrop}
          over={over}
          onClick={showShared}
          button={
            <IconButton
              size="2xs"
              variant="bare"
              aria-label={
                !switchable
                  ? t('slides.layerFixed')
                  : over
                    ? t('slides.layerFront')
                    : t('slides.layerBehind')
              }
              title={
                !switchable
                  ? t('slides.layerFixed')
                  : over
                    ? t('slides.layerFront')
                    : t('slides.layerBehind')
              }
              aria-pressed={!over}
              disabled={!switchable}
              onClick={toggleLayer}
              onDoubleClick={(e: MouseEvent) => e.stopPropagation()}
              className="flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-[4px] bg-black/55 text-white backdrop-blur-sm hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] disabled:cursor-default disabled:hover:bg-black/55 disabled:hover:text-white"
            >
              <LayerGlyph behind={!over} />
            </IconButton>
          }
          change={<ItemBackground item={layeredItem} tile />}
        />
      )}
      <ol aria-label={label} className="contents">
        {slides.map((slide, i) => (
          <SlideCard
            key={slide.key}
            slide={slide}
            index={i}
            scene={scenes[i] ?? thumbScene(slide, false)}
            state={stateOf(slide, i)}
            hint={hint}
            transparent={transparentAt(slide)}
            backdrop={prefs.backdrop}
            badge={badges.get(i)}
            newRow={prefs.byGroup && i > 0 && slides[i - 1]?.group !== slide.group}
            backgroundButton={
              layeredItem ? (
                <SlideBackgroundButton item={layeredItem} slide={slide} n={i + 1} />
              ) : null
            }
            layer={layer}
            onClick={() => onClick(i)}
            onDoubleClick={() => onDoubleClick(i)}
            onEdit={onQuickEdit ? () => onQuickEdit(i) : undefined}
            onContextMenu={(e) => {
              if (!onQuickEdit) return;
              e.preventDefault();
              onQuickEdit(i);
            }}
          />
        ))}
        {add?.(false)}
      </ol>
    </div>
  );
}

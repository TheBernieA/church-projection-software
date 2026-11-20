import type { MouseEvent, ReactNode } from 'react';
import { Film, Globe, Image as ImageIcon, Pencil, Wallpaper } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Scene } from '@lampstand/core';
import { TallyTag, Typography, Button, IconButton } from '@lampstand/ui';
import { putBehindWords } from '../../lib/actions';
import { groupColor } from '../../lib/slides';
import { SceneView } from '../SceneView';
import { LayerGlyph } from './Transitions';
import { type PresentableSlide } from '../../types';

/** Where a slide stands: on air, loaded in Preview, being edited, or none of these. */
export type SlideState = 'live' | 'preview' | 'editing' | 'idle';

/** Tally ring per state; colour means state, never decoration. */
const RING: Record<SlideState, string> = {
  live: 'shadow-[var(--tally-program-glow)]',
  preview: 'shadow-[0_0_0_2px_var(--tally-preview)]',
  editing: 'shadow-[0_0_0_2px_var(--accent)]',
  idle: 'shadow-[0_0_0_1px_var(--hairline-strong)] hover:shadow-[0_0_0_1px_var(--text-3),0_8px_20px_rgba(0,0,0,0.35)] hover:-translate-y-px',
};

function useStateLabel(slide: PresentableSlide, state: SlideState): string {
  const { t } = useTranslation();
  const suffix =
    state === 'live'
      ? ` — ${t('monitor.program')}`
      : state === 'preview'
        ? ` — ${t('monitor.preview')}`
        : '';
  return `${slide.label}${suffix}`;
}

/** The slide's words as plain lines (Easy view), or its label for media and pages. */
function slideText(slide: PresentableSlide): string {
  const a = slide.action;
  if (a.kind !== 'content') return '';
  // Verse numbers are superscript on screen; in plain text they need a space after them.
  return a.content.blocks
    .map((b) =>
      b.spans.map((s) => (s.style === 'verse-number' ? `${s.text.trim()} ` : s.text)).join(''),
    )
    .join('\n');
}

/** What kind of action a slide fires, shown as a small icon at its top left. */
function ActionIcon({ slide }: { slide: PresentableSlide }) {
  const k = slide.action.kind;
  const Icon = k === 'media' ? Film : k === 'background' ? ImageIcon : k === 'web' ? Globe : null;
  if (!Icon) return null;
  return (
    <span
      aria-hidden
      className="flex h-[18px] w-[18px] items-center justify-center rounded-[3px] bg-black/55 text-white/90 backdrop-blur-sm"
    >
      <Icon size={11} />
    </span>
  );
}

function Tags({ state, inline = false }: { state: SlideState; inline?: boolean }) {
  const { t } = useTranslation();
  const cls = inline ? '!static shrink-0 self-center' : '';
  if (state === 'live')
    return (
      <TallyTag tone="program" className={cls}>
        {t('common.live')}
      </TallyTag>
    );
  if (state === 'preview')
    return (
      <TallyTag tone="preview" className={cls}>
        {t('monitor.preview').toUpperCase()}
      </TallyTag>
    );
  return null;
}

interface CardProps {
  slide: PresentableSlide;
  index: number;
  state: SlideState;
  onClick: () => void;
  onDoubleClick: () => void;
}

/** What shows through a slide's transparent parts on its thumbnail (not on the screens). */
export type Backdrop = 'checker' | 'black' | 'grey';
export const BACKDROPS: Backdrop[] = ['checker', 'black', 'grey'];

/** The section's hotkey letter, as a small key cap. */
function HotkeyBadge({ letter, group }: { letter: string; group: string | undefined }) {
  const { t } = useTranslation();
  return (
    <Typography
      size={10}
      weight="bold"
      title={t('slides.hotkey', { key: letter, group: group ?? '' })}
      className="flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] bg-[#e8b04b] px-1 text-[#2a1d05] shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
    >
      {letter}
    </Typography>
  );
}

/**
 * A slide in the grid: its picture (words over a transparent backdrop when the background is
 * the item's, which shows as its own tile), its section's letter and what kind of slide it is
 * at the top left with its background button, its number and label on a bar in its section's
 * colour, and the tally ring. A section starts a new row with "slides by group".
 */
export function SlideCard({
  slide,
  index,
  scene,
  state,
  hint,
  onClick,
  onDoubleClick,
  onContextMenu,
  onEdit,
  badge,
  backgroundButton,
  transparent = false,
  backdrop = 'checker',
  newRow = false,
  layer,
}: CardProps & {
  scene: Scene;
  hint?: string;
  onContextMenu: (e: MouseEvent) => void;
  /** Editable slides show a pencil that opens them in Edit. */
  onEdit?: (() => void) | undefined;
  /** The section's hotkey letter, on the first slide of each section. */
  badge?: string | null | undefined;
  /** The button that sets this slide's own background. */
  backgroundButton?: ReactNode;
  /** The words alone: the background is the item's, shown on its own tile. */
  transparent?: boolean;
  backdrop?: Backdrop;
  /** Start a new row here (a new section, with "slides by group"). */
  newRow?: boolean;
  /** A picture or video item: which layer it plays on, and the button that switches it. */
  layer?: { behind: boolean; onToggle: () => void } | undefined;
}) {
  const { t } = useTranslation();
  const label = useStateLabel(slide, state);
  const color = groupColor(slide.group);
  const editLabel =
    state === 'live' ? t('slides.editLive', { n: index + 1 }) : t('slides.edit', { n: index + 1 });
  return (
    <li className="group/slide relative" style={newRow ? { gridColumnStart: 1 } : undefined}>
      <Button
        variant="bare"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        title={hint}
        aria-label={label}
        aria-current={state === 'editing' || undefined}
        className={`group block w-full cursor-pointer overflow-hidden rounded-[3px] bg-[var(--surface-2)] text-left transition-[box-shadow,transform] duration-[var(--dur-med)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--accent)] ${RING[state]}`}
      >
        <div className={`relative ${transparent ? `ls-backdrop-${backdrop}` : ''}`}>
          <SceneView scene={scene} mode="thumbnail" transparent={transparent} />
          {/* A faint inner edge keeps dark slides from melting into the card. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
          />
          <Tags state={state} />
        </div>
        <LabelBar color={color} number={String(index + 1)} label={slide.label} />
      </Button>
      {/* After the slide's own button (it's the tile's main control), drawn over it. */}
      {/* Top left: the section's letter, the kind of slide, and its background button. */}
      <div className="absolute left-1.5 top-1.5 z-[1] flex items-center gap-1">
        {badge && <HotkeyBadge letter={badge} group={slide.group} />}
        {layer ? (
          <IconButton
            size="2xs"
            variant="bare"
            aria-label={layer.behind ? t('slides.layerBehind') : t('slides.layerFront')}
            title={layer.behind ? t('slides.layerBehind') : t('slides.layerFront')}
            aria-pressed={layer.behind}
            onClick={layer.onToggle}
            onDoubleClick={(e) => e.stopPropagation()}
            className="flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-[4px] bg-black/55 text-white backdrop-blur-sm hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]"
          >
            <LayerGlyph behind={layer.behind} />
          </IconButton>
        ) : (
          <ActionIcon slide={slide} />
        )}
        {backgroundButton}
        {/* A picture or video slide can go behind the words instead of over everything. */}
        {!layer && slide.action.kind === 'media' && (
          <IconButton
            size="2xs"
            variant="bare"
            aria-label={`${t('mediaBin.behindWords')}: ${slide.label}`}
            title={t('mediaBin.behindWords')}
            onClick={() => {
              if (slide.action.kind === 'media') void putBehindWords(slide.action.media);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            className={`${TILE_TOOL} opacity-0 focus-visible:opacity-100 group-hover/slide:opacity-100`}
          >
            <Wallpaper size={12} />
          </IconButton>
        )}
      </div>
      {onEdit && (
        <IconButton
          size="2xs"
          variant="bare"
          aria-label={editLabel}
          title={editLabel}
          onClick={onEdit}
          className={`${TILE_TOOL} absolute bottom-8 right-1.5 z-[1] opacity-0 focus-visible:opacity-100 group-hover/slide:opacity-100`}
        >
          <Pencil size={12} />
        </IconButton>
      )}
    </li>
  );
}

/** A small round tool on a tile (background, edit). */
export const TILE_TOOL =
  'flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-opacity hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]';

/** The bar under a tile: number (or icon), then name, on the section's colour. */
function LabelBar({
  color,
  number,
  label,
}: {
  color: string | null | undefined;
  number: ReactNode;
  label: string;
}) {
  return (
    <Typography
      as="div"
      size={12}
      weight="semibold"
      className="flex h-6 items-center gap-1.5 px-2"
      style={
        color
          ? { background: color, color: '#fff' }
          : { background: 'var(--surface-3)', color: 'var(--text-2)' }
      }
    >
      <Typography tabular className="flex shrink-0 items-center">
        {number}
      </Typography>
      <Typography truncate>{label}</Typography>
    </Typography>
  );
}

/** "0:20.04": a video's length, as on a media tile. */
function clipLength(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

/**
 * The item's background as the first tile: what every slide without one of its own sits on.
 * Click puts it on the screens now (the words stay); the button at the top left changes it.
 */
export function BackgroundCard({
  scene,
  live,
  duration,
  button,
  change,
  over = false,
  backdrop = 'checker',
  onClick,
}: {
  /** Null: the slides have no background (the screens show black behind the words). */
  scene: Scene | null;
  live: boolean;
  /** A video background's length (seconds). */
  duration?: number | undefined;
  /** Top left: its layer (the two squares), switched with a click. */
  button: ReactNode;
  /** Bottom right of the picture, on hover: change it. */
  change?: ReactNode;
  /** It's a cue of its own, over everything (not behind the words). */
  over?: boolean;
  backdrop?: Backdrop;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="group/slide relative">
      <div className="absolute left-1.5 top-1.5 z-[1] flex items-center gap-1">{button}</div>
      {change && (
        <div className="absolute bottom-8 right-1.5 z-[1] opacity-0 transition-opacity focus-within:opacity-100 group-hover/slide:opacity-100 has-[[data-state=open]]:opacity-100">
          {change}
        </div>
      )}
      <Button
        variant="bare"
        onClick={onClick}
        aria-label={t('slides.backgroundTile')}
        title={t('slides.backgroundTileHint')}
        className={`group block w-full cursor-pointer overflow-hidden rounded-[3px] bg-[var(--surface-2)] text-left transition-[box-shadow,transform] duration-[var(--dur-med)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--accent)] ${RING[live ? 'live' : 'idle']}`}
      >
        <div className={`relative ${scene ? '' : `ls-backdrop-${backdrop}`}`}>
          {scene ? (
            <SceneView scene={scene} mode="thumbnail" />
          ) : (
            <span aria-hidden className="block aspect-video w-full" />
          )}
          {duration ? (
            <Typography
              size={11}
              weight="semibold"
              tone="white"
              tabular
              className="absolute bottom-1 left-1.5 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]"
            >
              {clipLength(duration)}
            </Typography>
          ) : null}
          <Tags state={live ? 'live' : 'idle'} />
        </div>
        <LabelBar
          color={null}
          number={<LayerGlyph behind={!over} size={12} />}
          label={
            !scene
              ? t('slides.noBackground')
              : over
                ? t('slides.backgroundOver')
                : t('slides.background')
          }
        />
      </Button>
    </div>
  );
}

/**
 * A slide in Table view: a small thumbnail, then its words and its notes, so the operator can
 * read the slide and what's noted for it side by side.
 */
export function SlideTableRow({
  slide,
  index,
  state,
  onClick,
  onDoubleClick,
  scene,
  transparent = false,
  backdrop = 'checker',
  badge,
}: CardProps & {
  scene: Scene;
  transparent?: boolean;
  backdrop?: Backdrop;
  badge?: string | null | undefined;
}) {
  const label = useStateLabel(slide, state);
  const color = groupColor(slide.group);
  const text = slideText(slide);
  const notes = slide.action.kind === 'content' ? slide.action.content.notes : undefined;
  return (
    <li>
      <Button
        variant="bare"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        aria-label={label}
        aria-current={state === 'editing' || undefined}
        className={`grid w-full cursor-pointer grid-cols-[4px_28px_140px_minmax(0,1fr)_minmax(0,0.8fr)] items-stretch gap-3 rounded-[4px] bg-[var(--surface-2)] pr-3 text-left transition-[box-shadow] duration-[var(--dur-med)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${RING[state]}`}
      >
        <span
          aria-hidden
          className="rounded-l-[4px]"
          style={{ background: color ?? 'var(--surface-4)' }}
        />
        <Typography
          size={12}
          tone="muted"
          weight="semibold"
          tabular
          className="self-center text-right"
        >
          {index + 1}
        </Typography>
        <span
          className={`relative my-1.5 block overflow-hidden rounded-[3px] shadow-[0_0_0_1px_var(--hairline)] ${transparent ? `ls-backdrop-${backdrop}` : 'bg-black'}`}
        >
          <SceneView scene={scene} mode="thumbnail" transparent={transparent} />
          {badge && (
            <span className="absolute left-1 top-1">
              <HotkeyBadge letter={badge} group={slide.group} />
            </span>
          )}
          <Tags state={state} />
        </span>
        <span className="min-w-0 self-center py-2">
          <Typography
            size={10}
            weight="semibold"
            className="block uppercase tracking-[0.08em]"
            style={{ color: color ?? 'var(--text-3)' }}
          >
            {slide.label}
          </Typography>
          {text && (
            <Typography
              size={13}
              tone="primary"
              leading="snug"
              className="mt-0.5 line-clamp-4 block whitespace-pre-line"
            >
              {text}
            </Typography>
          )}
        </span>
        <Typography
          size={12}
          tone="muted"
          leading="snug"
          className="line-clamp-4 self-center whitespace-pre-line border-l border-[var(--hairline)] py-2 pl-3"
        >
          {notes ?? ''}
        </Typography>
      </Button>
    </li>
  );
}

/**
 * A slide in Easy view: number, group, and the words themselves in large type, so the operator
 * can read ahead without squinting at thumbnails.
 */
export function SlideRow({
  slide,
  index,
  state,
  onClick,
  onDoubleClick,
  scene,
}: CardProps & {
  /** Its picture: shown for slides without words (videos, pictures, web pages). */
  scene?: Scene | undefined;
}) {
  const label = useStateLabel(slide, state);
  const color = groupColor(slide.group);
  const text = slideText(slide);
  return (
    <li>
      <Button
        variant="bare"

        onClick={onClick}
        onDoubleClick={onDoubleClick}
        aria-label={label}
        aria-current={state === 'editing' || undefined}
        className={`flex min-h-[52px] w-full cursor-pointer items-stretch gap-3 rounded-[6px] bg-[var(--surface-2)] pr-3 text-left transition-[box-shadow,transform] duration-[var(--dur-med)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${RING[state]}`}
      >
        <span
          aria-hidden
          className="w-1 shrink-0 rounded-l-[6px]"
          style={{ background: color ?? 'var(--surface-4)' }}
        />
        <Typography
          size={12}
          tone="muted"
          weight="semibold"
          tabular
          className="w-6 shrink-0 self-center text-right"
        >
          {index + 1}
        </Typography>
        {scene && !text && (
          <span className="relative my-1.5 block aspect-video w-24 shrink-0 self-center overflow-hidden rounded-[4px] bg-black shadow-[0_0_0_1px_var(--hairline)]">
            <SceneView scene={scene} mode="thumbnail" />
          </span>
        )}
        <span className="min-w-0 flex-1 self-center py-2">
          <Typography
            size={10}
            weight="semibold"
            className="block uppercase tracking-[0.08em]"
            style={{ color: color ?? 'var(--text-3)' }}
          >
            {slide.label}
          </Typography>
          {text && (
            <Typography
              size={15}
              tone="primary"
              leading="snug"
              className="mt-0.5 line-clamp-3 block whitespace-pre-line"
            >
              {text}
            </Typography>
          )}
        </span>
        <Tags state={state} inline />
      </Button>
    </li>
  );
}

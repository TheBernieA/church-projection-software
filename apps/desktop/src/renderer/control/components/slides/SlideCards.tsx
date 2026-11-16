import type { MouseEvent } from 'react';
import { Film, Globe, Image as ImageIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Scene } from '@lampstand/core';
import { TallyTag, Typography } from '@lampstand/ui';
import { groupColor } from '../../lib/slides';
import { SceneView } from '../SceneView';
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

/** What kind of action a slide fires, shown as a small icon on its corner. */
function ActionIcon({ slide }: { slide: PresentableSlide }) {
  const k = slide.action.kind;
  const Icon = k === 'media' ? Film : k === 'background' ? ImageIcon : k === 'web' ? Globe : null;
  if (!Icon) return null;
  return (
    <span
      aria-hidden
      className="absolute bottom-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white/90 backdrop-blur-sm"
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
        LIVE
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

/**
 * A slide in the grid: the real render as a thumbnail, its number, its group as a slim colour
 * bar with the label in that colour, and the tally ring. (The thumbnail itself is a memoised
 * SceneView, so re-rendering a card is cheap.)
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
}: CardProps & {
  scene: Scene;
  hint?: string;
  onContextMenu: (e: MouseEvent) => void;
}) {
  const label = useStateLabel(slide, state);
  const color = groupColor(slide.group);
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        title={hint}
        aria-label={label}
        aria-current={state === 'editing' || undefined}
        className={`group block w-full cursor-pointer overflow-hidden rounded-[3px] bg-[var(--surface-2)] text-left transition-[box-shadow,transform] duration-[var(--dur-med)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--accent)] ${RING[state]}`}
      >
        <div className="relative">
          <SceneView scene={scene} mode="thumbnail" />
          {/* A faint inner edge keeps dark slides from melting into the card. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
          />
          <ActionIcon slide={slide} />
          <Tags state={state} />
        </div>
        {/* Label bar in the group's colour (the colour IS the group): number, then name. */}
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
          <span className="tnum shrink-0">{index + 1}</span>
          <span className="truncate">{slide.label}</span>
        </Typography>
      </button>
    </li>
  );
}

/**
 * A slide in Easy view: number, group, and the words themselves in large type, so the operator
 * can read ahead without squinting at thumbnails.
 */
export function SlideRow({ slide, index, state, onClick, onDoubleClick }: CardProps) {
  const label = useStateLabel(slide, state);
  const color = groupColor(slide.group);
  const text = slideText(slide);
  return (
    <li>
      <button
        type="button"
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
        <span className="min-w-0 flex-1 py-2">
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
      </button>
    </li>
  );
}

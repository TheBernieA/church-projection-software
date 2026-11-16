import { useMemo, useRef, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { makeScene } from '@lampstand/core';
import { Button, IconButton, Typography } from '@lampstand/ui';
import { useItemSlides } from '../../lib/hooks';
import type {} from '../../lib/objects';
import {
  addSlide,
  deleteSlide,
  duplicateSlide,
  moveSlide,
  selectSlide,
} from '../../lib/textSlides';
import { AddCard, REVEAL } from '../cards';
import { SceneView } from '../SceneView';
import { type TextItem } from '../../types';

const DRAG = 'application/x-lampstand-slide';

/**
 * The item's slides as a strip of numbered thumbnails: pick the slide the canvas edits; drag
 * one to reorder; duplicate or delete it from its corner. Arrow keys move through the strip,
 * Delete removes the focused slide.
 */
export function Filmstrip({ item, index }: { item: TextItem; index: number }) {
  const { t } = useTranslation();
  const { slides } = useItemSlides(item);
  const strip = useRef<HTMLOListElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const scenes = useMemo(
    () =>
      slides.map((s) =>
        s.action.kind === 'content'
          ? makeScene({ background: s.action.background, content: s.action.content })
          : makeScene(),
      ),
    [slides],
  );
  const focusSlide = (i: number): void => {
    selectSlide(item, i);
    requestAnimationFrame(() =>
      strip.current?.querySelectorAll<HTMLElement>('[data-slide]')[i]?.focus(),
    );
  };
  const one = item.slides.length <= 1;
  return (
    <ol
      ref={strip}
      aria-label={t('canvas.slides')}
      className="flex shrink-0 items-start gap-2 overflow-x-auto border-t border-[var(--hairline)] p-2"
    >
      {scenes.map((scene, i) => {
        const title = item.slides[i]?.title?.trim();
        const on = i === index;
        return (
          <li
            key={slides[i]?.key ?? i}
            className={`group relative w-36 shrink-0 ${dragFrom === i ? 'opacity-40' : ''}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG, String(i));
              e.dataTransfer.effectAllowed = 'move';
              setDragFrom(i);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDropAt(null);
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(DRAG)) return;
              e.preventDefault();
              setDropAt(i);
            }}
            onDrop={(e) => {
              const from = Number(e.dataTransfer.getData(DRAG));
              setDragFrom(null);
              setDropAt(null);
              if (Number.isInteger(from)) moveSlide(item, from, i);
            }}
          >
            {dropAt === i && dragFrom !== null && dragFrom !== i && (
              <span
                aria-hidden
                className={`absolute -top-0.5 bottom-5 z-[1] w-0.5 rounded-full bg-[var(--select)] ${
                  dragFrom < i ? '-right-1.5' : '-left-1.5'
                }`}
              />
            )}
            <Button
              variant="bare"
              data-slide
              aria-current={on || undefined}
              aria-label={t('inspector.slideOf', { n: i + 1, total: scenes.length })}
              onClick={() => selectSlide(item, i)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  focusSlide(Math.min(i + 1, scenes.length - 1));
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  focusSlide(Math.max(i - 1, 0));
                } else if ((e.key === 'Delete' || e.key === 'Backspace') && !one) {
                  e.preventDefault();
                  deleteSlide(item, i);
                  focusSlide(Math.max(0, i - 1));
                }
              }}
              className="block w-full overflow-hidden rounded-[4px] text-left focus-visible:outline-none"
              style={{
                boxShadow: on ? '0 0 0 2px var(--accent)' : '0 0 0 1px var(--hairline-strong)',
              }}
            >
              <SceneView scene={scene} mode="thumbnail" />
            </Button>
            <Typography
              size={11}
              tone={on ? 'primary' : 'muted'}
              weight={on ? 'semibold' : 'regular'}
              truncate
              className="mt-1 block px-0.5"
            >
              {i + 1}
              {title ? ` · ${title}` : ''}
            </Typography>
            <span className="absolute right-1 top-1 flex gap-0.5">
              <IconButton
                size="3xs"
                variant="secondary"
                aria-label={t('canvas.duplicateSlide', { n: i + 1 })}
                onClick={() => duplicateSlide(item, i)}
                className={`!rounded-full !bg-black/60 !text-white backdrop-blur-sm hover:!bg-black/80 ${REVEAL}`}
              >
                <Copy size={11} />
              </IconButton>
              {!one && (
                <IconButton
                  size="3xs"
                  variant="secondary"
                  aria-label={t('canvas.deleteSlide', { n: i + 1 })}
                  onClick={() => deleteSlide(item, i)}
                  className={`!rounded-full !bg-black/60 !text-white backdrop-blur-sm hover:!bg-[var(--tally-program)] ${REVEAL}`}
                >
                  <Trash2 size={11} />
                </IconButton>
              )}
            </span>
          </li>
        );
      })}
      <li>
        <AddCard
          label={t('inspector.addSlide')}
          icon={<Plus size={16} />}
          className="aspect-video w-36"
          onClick={() => addSlide(item)}
        />
      </li>
    </ol>
  );
}

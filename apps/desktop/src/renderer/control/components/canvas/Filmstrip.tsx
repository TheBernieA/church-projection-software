import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { makeScene, newId } from '@lampstand/core';
import { useItemSlides } from '../../lib/hooks';
import type {} from '../../lib/objects';
import { updateItem, useStore } from '../../lib/store';
import { AddCard } from '../cards';
import { SceneView } from '../SceneView';
import { type TextItem } from '../../types';
import { Button } from '@lampstand/ui';

/** The item's slides as a strip of small thumbnails: pick the slide the canvas edits. */
export function Filmstrip({ item, index }: { item: TextItem; index: number }) {
  const { t } = useTranslation();
  const { slides } = useItemSlides(item);
  const scenes = useMemo(
    () =>
      slides.map((s) =>
        s.action.kind === 'content'
          ? makeScene({ background: s.action.background, content: s.action.content })
          : makeScene(),
      ),
    [slides],
  );
  const pick = (i: number): void =>
    useStore.setState({ editCursor: { itemId: item.id, index: i }, editObjectId: null });
  return (
    <ol
      aria-label={t('canvas.slides')}
      className="flex shrink-0 items-start gap-2 overflow-x-auto border-t border-[var(--hairline)] p-2"
    >
      {scenes.map((scene, i) => (
        <li key={slides[i]?.key ?? i} className="w-36 shrink-0">
          <Button
            variant="bare"

            aria-current={i === index || undefined}
            aria-label={t('inspector.slideOf', { n: i + 1, total: scenes.length })}
            onClick={() => pick(i)}
            className="block w-full overflow-hidden rounded-[3px]"
            style={{
              boxShadow:
                i === index ? '0 0 0 2px var(--accent)' : '0 0 0 1px var(--hairline-strong)',
            }}
          >
            <SceneView scene={scene} mode="thumbnail" />
          </Button>
        </li>
      ))}
      <li>
        <AddCard
          label={t('inspector.addSlide')}
          icon={<Plus size={16} />}
          className="aspect-video w-36"
          onClick={() => {
            updateItem<TextItem>(item.id, (x) => ({
              ...x,
              slides: [...x.slides, { id: newId(), title: '', body: '' }],
            }));
            pick(item.slides.length);
          }}
        />
      </li>
    </ol>
  );
}

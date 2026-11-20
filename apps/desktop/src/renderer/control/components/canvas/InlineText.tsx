import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { typographyClass } from '@lampstand/ui';
import { patchObject } from '../../lib/objects';
import { patchSlide } from '../../lib/textSlides';
import { INLINE_FIELD, InlinePanel } from './editorParts';
import { type TextItem } from '../../types';

/** What is being edited in place: the slide's own words, or one text box. */
export type InlineTarget = { kind: 'slide' } | { kind: 'object'; id: string };

/**
 * A text slide's words, edited right on the slide: its heading and text (or the text box's
 * words), changed as you type.
 */
export function InlineText({
  item,
  index,
  target,
  onClose,
}: {
  item: TextItem;
  index: number;
  target: InlineTarget;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const slide = item.slides[index];
  const object =
    target.kind === 'object' ? slide?.objects?.find((o) => o.id === target.id) : undefined;
  const first = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = first.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  if (!slide || (target.kind === 'object' && object?.kind !== 'text')) return null;
  return (
    <InlinePanel hint={t('canvas.inlineHint')} onClose={onClose}>
      {object?.kind === 'text' ? (
        <textarea
          ref={first}
          aria-label={t('canvas.text')}
          rows={4}
          value={object.text}
          onChange={(e) =>
            patchObject(item, index, object.id, { text: e.target.value }, { typing: true })
          }
          className={`${INLINE_FIELD} ${typographyClass({ size: 18, weight: 'semibold', important: true })}`}
        />
      ) : (
        <>
          <input
            aria-label={t('inspector.title')}
            placeholder={t('inspector.titlePlaceholder')}
            value={slide.title ?? ''}
            onChange={(e) => patchSlide(item, index, { title: e.target.value })}
            className={`${INLINE_FIELD} h-10 ${typographyClass({ size: 15, weight: 'semibold', important: true })}`}
          />
          <textarea
            ref={first}
            aria-label={t('inspector.text')}
            placeholder={t('inspector.textPlaceholder')}
            rows={5}
            value={slide.body}
            onChange={(e) => patchSlide(item, index, { body: e.target.value })}
            className={`${INLINE_FIELD} ${typographyClass({ size: 18, weight: 'semibold', important: true })}`}
          />
        </>
      )}
    </InlinePanel>
  );
}

import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Typography, typographyClass } from '@lampstand/ui';
import { patchObject } from '../../lib/objects';
import { patchSlide } from '../../lib/textSlides';
import { type TextItem } from '../../types';

/** What is being edited in place: the slide's own words, or one text box. */
export type InlineTarget = { kind: 'slide' } | { kind: 'object'; id: string };

/**
 * The words, edited right on the slide: a panel over the canvas with the slide's heading and
 * text (or the text box's words), changed as you type. Escape or Done closes it.
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
  const field = `w-full resize-none rounded-[8px] border-0 bg-white/8 px-3 py-2 text-white outline-none ring-1 ring-white/15 placeholder:text-white/35 focus:ring-2 focus:ring-[var(--accent)]`;
  return (
    <div
      role="dialog"
      aria-label={t('canvas.editWords')}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation(); // typing here never nudges objects or changes slides
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          onClose();
        }
      }}
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/45 p-[6%] backdrop-blur-[2px]"
    >
      <div className="flex w-full max-w-[720px] flex-col gap-2.5 rounded-[12px] bg-[rgba(18,20,28,0.92)] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.08)]">
        {object?.kind === 'text' ? (
          <textarea
            ref={first}
            aria-label={t('canvas.text')}
            rows={4}
            value={object.text}
            onChange={(e) =>
              patchObject(item, index, object.id, { text: e.target.value }, { typing: true })
            }
            className={`${field} ${typographyClass({ size: 18, weight: 'semibold', important: true })}`}
          />
        ) : (
          <>
            <input
              aria-label={t('inspector.title')}
              placeholder={t('inspector.titlePlaceholder')}
              value={slide.title ?? ''}
              onChange={(e) => patchSlide(item, index, { title: e.target.value })}
              className={`${field} h-10 ${typographyClass({ size: 15, weight: 'semibold', important: true })}`}
            />
            <textarea
              ref={first}
              aria-label={t('inspector.text')}
              placeholder={t('inspector.textPlaceholder')}
              rows={5}
              value={slide.body}
              onChange={(e) => patchSlide(item, index, { body: e.target.value })}
              className={`${field} ${typographyClass({ size: 18, weight: 'semibold', important: true })}`}
            />
          </>
        )}
        <div className="flex items-center gap-3">
          <Typography size={11} tone="inherit" className="flex-1 text-white/55">
            {t('canvas.inlineHint')}
          </Typography>
          <Button size="xs" variant="primary" icon={<Check size={13} />} onClick={onClose}>
            {t('canvas.done')}
          </Button>
        </div>
      </div>
    </div>
  );
}

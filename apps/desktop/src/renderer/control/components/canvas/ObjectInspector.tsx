import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SlideObject } from '@lampstand/core';
import { Button, Segmented, Typography, typographyClass } from '@lampstand/ui';
import { usePictures } from '../../lib/hooks';
import { patchObject } from '../../lib/objects';
import { useStore } from '../../lib/store';
import { Select } from '../Select';
import { Checkbox, ColorInput, Field, NumberInput, RangeField } from '../form';
import { type TextItem } from '../../types';

/** A whole-number canvas field. */
function Num({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <Field label={label}>
      <NumberInput className="!h-8" round value={value} min={min} max={max} onChange={onChange} />
    </Field>
  );
}

function Colour({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <ColorInput className="!h-8" value={value} onChange={onChange} />
    </Field>
  );
}

/** Properties of the object selected on the canvas: position, size and its own look. */
export function ObjectInspector({
  item,
  index,
  object: o,
}: {
  item: TextItem;
  index: number;
  object: SlideObject;
}) {
  const { t } = useTranslation();
  const pictures = usePictures();
  // Typing coalesces into one undo step; colour and toggle changes are a step each.
  const set = (p: Partial<SlideObject>, typing = true): void =>
    patchObject(item, index, o.id, p, { typing });
  return (
    <div className="flex flex-col gap-4 p-5" aria-label={t('canvas.properties')}>
      <Button
        size="xs"
        variant="ghost"
        className="self-start"
        icon={<ArrowLeft size={13} />}
        onClick={() => useStore.setState({ editObjectId: null })}
      >
        {t('canvas.backToSlide')}
      </Button>
      <Typography as="h3" variant="overline">
        {t(`canvas.kinds.${o.kind}`)}
      </Typography>

      {o.kind === 'text' && (
        <>
          <Field label={t('canvas.text')}>
            <textarea
              className="field"
              rows={3}
              value={o.text}
              maxLength={2000}
              onChange={(e) => set({ text: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Num
              label={t('canvas.fontSize')}
              value={o.fontSize}
              min={8}
              max={400}
              onChange={(fontSize) => set({ fontSize })}
            />
            <Colour
              label={t('canvas.colour')}
              value={o.color}
              onChange={(color) => set({ color }, false)}
            />
          </div>
          <Segmented<'left' | 'center' | 'right'>
            label={t('theme.align')}
            value={o.align}
            onChange={(align) => set({ align }, false)}
            options={[
              { value: 'left', label: t('canvas.left') },
              { value: 'center', label: t('canvas.center') },
              { value: 'right', label: t('canvas.right') },
            ]}
          />
          <Typography as="div" size={12} className="flex gap-4">
            <Checkbox
              label={t('canvas.bold')}
              checked={!!o.bold}
              onChange={(bold) => set({ bold }, false)}
            />
            <Checkbox
              label={t('canvas.italic')}
              checked={!!o.italic}
              onChange={(italic) => set({ italic }, false)}
            />
          </Typography>
        </>
      )}

      {(o.kind === 'rect' || o.kind === 'ellipse') && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Colour
              label={t('canvas.fill')}
              value={o.fill ?? '#ffffff'}
              onChange={(fill) => set({ fill }, false)}
            />
            <Checkbox
              className={`self-end pb-2 ${typographyClass({ size: 12 })}`}
              label={t('canvas.noFill')}
              checked={!o.fill}
              onChange={(none) => set({ fill: none ? undefined : '#f0a73a' }, false)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Num
              label={t('canvas.borderWidth')}
              value={o.stroke?.width ?? 0}
              min={0}
              max={100}
              onChange={(width) => set({ stroke: { color: o.stroke?.color ?? '#ffffff', width } })}
            />
            <Colour
              label={t('canvas.borderColour')}
              value={o.stroke?.color ?? '#ffffff'}
              onChange={(color) => set({ stroke: { width: o.stroke?.width ?? 4, color } }, false)}
            />
          </div>
          {o.kind === 'rect' && (
            <Num
              label={t('canvas.radius')}
              value={o.radius ?? 0}
              min={0}
              max={3000}
              onChange={(radius) => set({ radius })}
            />
          )}
        </>
      )}

      {o.kind === 'line' && (
        <div className="grid grid-cols-2 gap-2">
          <Num
            label={t('canvas.thickness')}
            value={o.stroke.width}
            min={1}
            max={100}
            onChange={(width) => set({ stroke: { ...o.stroke, width }, h: Math.max(o.h, width) })}
          />
          <Colour
            label={t('canvas.colour')}
            value={o.stroke.color}
            onChange={(color) => set({ stroke: { ...o.stroke, color } }, false)}
          />
        </div>
      )}

      {o.kind === 'image' && (
        <>
          <Field label={t('canvas.picture')}>
            <Select<string>
              size="sm"
              aria-label={t('canvas.picture')}
              value={o.mediaId}
              onChange={(mediaId) => set({ mediaId }, false)}
              options={pictures.map((m) => ({ value: m.id, label: m.name }))}
            />
          </Field>
          <Segmented<'contain' | 'cover'>
            label={t('canvas.fit')}
            value={o.fit}
            onChange={(fit) => set({ fit }, false)}
            options={[
              { value: 'contain', label: t('canvas.contain') },
              { value: 'cover', label: t('canvas.cover') },
            ]}
          />
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Num label="X" value={o.x} onChange={(x) => set({ x })} />
        <Num label="Y" value={o.y} onChange={(y) => set({ y })} />
        <Num
          label={t('canvas.width')}
          value={o.w}
          min={1}
          onChange={(w) => set({ w: Math.max(1, w) })}
        />
        <Num
          label={t('canvas.height')}
          value={o.h}
          min={1}
          onChange={(h) => set({ h: Math.max(1, h) })}
        />
      </div>
      <RangeField
        label={t('canvas.opacity')}
        value={o.opacity ?? 1}
        min={0}
        max={1}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(opacity) => set({ opacity })}
      />
    </div>
  );
}

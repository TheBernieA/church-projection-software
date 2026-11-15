import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SlideObject } from '@lampstand/core';
import { Button, Segmented } from '@lampstand/ui';
import { usePictures } from '../../lib/hooks';
import { patchObject, type TextItem } from '../../lib/objects';
import { useStore } from '../../lib/store';
import { Select } from '../Select';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-[var(--text-2)]">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

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
      <input
        type="number"
        className="field !h-8"
        value={Math.round(value)}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
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
      <input
        type="color"
        className="h-8 w-full cursor-pointer rounded border-0 bg-transparent p-0"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'}
        onChange={(e) => onChange(e.target.value)}
      />
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
      <h3 className="section-label">{t(`canvas.kinds.${o.kind}`)}</h3>

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
          <div className="flex gap-4 text-[12px]">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={!!o.bold}
                onChange={(e) => set({ bold: e.target.checked }, false)}
              />
              {t('canvas.bold')}
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={!!o.italic}
                onChange={(e) => set({ italic: e.target.checked }, false)}
              />
              {t('canvas.italic')}
            </label>
          </div>
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
            <label className="flex items-end gap-1.5 pb-2 text-[12px]">
              <input
                type="checkbox"
                checked={!o.fill}
                onChange={(e) => set({ fill: e.target.checked ? undefined : '#f0a73a' }, false)}
              />
              {t('canvas.noFill')}
            </label>
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
      <Field label={`${t('canvas.opacity')} · ${Math.round((o.opacity ?? 1) * 100)}%`}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={o.opacity ?? 1}
          onChange={(e) => set({ opacity: Number(e.target.value) })}
          className="h-1.5 accent-[var(--accent)]"
        />
      </Field>
    </div>
  );
}

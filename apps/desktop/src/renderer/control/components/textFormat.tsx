import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Bold,
  Italic,
  RotateCcw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TextFormat, Theme } from '@lampstand/core';
import { Button, IconButton, Typography } from '@lampstand/ui';
import { BUNDLED_FONTS } from '../constants';
import { Checkbox, ColorInput, Field, NumberInput } from './form';
import { Select, type SelectOption } from './Select';

/**
 * Text formatting over a theme (font, size, style, colour, alignment, capitals, stroke, shadow):
 * the pieces the toolbar's Text bar and the editors' Text tab share, and the Text tab itself.
 */

/** The fonts to pick from, each shown in itself; the current one first if it isn't bundled. */
export function useFontOptions(family: string): SelectOption<string>[] {
  const { t } = useTranslation();
  const fonts = BUNDLED_FONTS.map((f) => ({
    value: f.family,
    label: f.family,
    description: t(`theme.fontKinds.${f.category}`),
    labelStyle: { fontFamily: `"${f.family}"` },
  }));
  if (family && !fonts.some((f) => f.value === family))
    fonts.unshift({
      value: family,
      label: family,
      description: '',
      labelStyle: { fontFamily: `"${family}"` },
    });
  return fonts;
}

/** A square on/off button (bold, italic, alignment). */
export function FormatToggle({
  label,
  on,
  onClick,
  children,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <IconButton
      size="xs"
      aria-label={label}
      title={label}
      aria-pressed={on}
      active={on}
      activeTone="select"
      onClick={onClick}
    >
      {children}
    </IconButton>
  );
}

/** Font size: typed freely, saved on Enter or when leaving the field (one undo step). */
export function SizeInput({
  label,
  title,
  value,
  onCommit,
  className = '!w-[72px]',
}: {
  label: string;
  title: string;
  value: number;
  onCommit: (v: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (): void => {
    const v = Math.round(Number(draft));
    if (draft !== null && Number.isFinite(v) && v >= 8 && v <= 400 && v !== value) onCommit(v);
    setDraft(null);
  };
  return (
    <input
      type="number"
      aria-label={label}
      title={title}
      min={8}
      max={400}
      value={draft ?? Math.round(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
      }}
      className={`field tnum !h-8 ${className}`}
    />
  );
}

/**
 * A colour picker reports every step of a drag: show it at once, save it once it settles (one
 * save, one undo step).
 */
export function useSettledColor(save: (hex: string) => void): {
  shown: string | null;
  change: (hex: string) => void;
} {
  const [shown, setShown] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(save);
  useEffect(() => {
    latest.current = save;
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return {
    shown,
    change: (hex) => {
      setShown(hex);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        latest.current(hex);
        setShown(null);
      }, 250);
    },
  };
}

/** A colour well that saves once the picking settles. */
function SettledColor({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (hex: string) => void;
}) {
  const color = useSettledColor(onSave);
  return <ColorInput aria-label={label} value={color.shown ?? value} onChange={color.change} />;
}

const STROKE = { width: 3, color: '#000000' };
const SHADOW = { x: 0, y: 4, blur: 12, color: '#000000' };

/**
 * The Text tab: the words' font, size, style, capitals, colour, alignment (across and up and
 * down), stroke and shadow, shown as they are now (`theme`, with the formatting applied) and
 * saved as formatting over the theme. Reset goes back to the theme.
 */
export function TextFormatPanel({
  theme,
  format,
  onChange,
  onReset,
  note,
}: {
  theme: Theme;
  format: TextFormat;
  onChange: (patch: Partial<TextFormat>) => void;
  onReset: () => void;
  /** A line under the controls (e.g. where the formatting is kept). */
  note?: string;
}) {
  const { t } = useTranslation();
  const text = theme.text;
  const fonts = useFontOptions(text.fontFamily);
  const bold = text.fontWeight >= 600;
  const valign =
    theme.layout === 'top' ? 'top' : theme.layout === 'lower-third' ? 'bottom' : 'middle';
  const canPlace = ['center', 'top', 'lower-third'].includes(theme.layout);
  const stroke = text.outline && text.outline.width > 0 ? text.outline : null;
  const shadow = text.shadow ?? null;
  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-end gap-2">
        <Field label={t('textBar.font')} htmlFor="tf-font" className="min-w-0 flex-1">
          <Select
            id="tf-font"
            size="sm"
            value={text.fontFamily}
            onChange={(fontFamily) => onChange({ fontFamily })}
            options={fonts}
          />
        </Field>
        <Field label={t('textBar.size')} group>
          <SizeInput
            label={t('textBar.size')}
            title={t('textBar.sizeHelp')}
            value={theme.autoFit.enabled ? theme.autoFit.maxSize : text.fontSize}
            onCommit={(fontSize) => onChange({ fontSize })}
            className="!w-[68px]"
          />
        </Field>
      </div>
      <div className="flex items-center gap-1">
        <FormatToggle label={t('textBar.bold')} on={bold} onClick={() => onChange({ bold: !bold })}>
          <Bold size={15} />
        </FormatToggle>
        <FormatToggle
          label={t('textBar.italic')}
          on={!!text.italic}
          onClick={() => onChange({ italic: !text.italic })}
        >
          <Italic size={15} />
        </FormatToggle>
        <span className="flex-1" />
        <Select
          size="sm"
          aria-label={t('textFormat.capitals')}
          value={text.textTransform === 'uppercase' ? 'upper' : 'none'}
          onChange={(v) => onChange({ uppercase: v === 'upper' })}
          options={[
            { value: 'none', label: t('textFormat.capsNone') },
            { value: 'upper', label: t('textFormat.capsAll') },
          ]}
          className="!w-36"
        />
      </div>
      <Field label={t('textBar.color')} group>
        <SettledColor
          label={t('textBar.color')}
          value={text.color}
          onSave={(color) => onChange({ color })}
        />
      </Field>
      <div className="flex items-center gap-3">
        <div role="group" aria-label={t('textBar.align')} className="flex items-center gap-0.5">
          {(
            [
              ['left', AlignLeft],
              ['center', AlignCenter],
              ['right', AlignRight],
            ] as const
          ).map(([a, Icon]) => (
            <FormatToggle
              key={a}
              label={t(`textBar.${a}`)}
              on={text.align === a}
              onClick={() => onChange({ align: a })}
            >
              <Icon size={15} />
            </FormatToggle>
          ))}
        </div>
        {canPlace && (
          <div
            role="group"
            aria-label={t('textFormat.valign')}
            className="flex items-center gap-0.5"
          >
            {(
              [
                ['top', AlignVerticalJustifyStart],
                ['middle', AlignVerticalJustifyCenter],
                ['bottom', AlignVerticalJustifyEnd],
              ] as const
            ).map(([v, Icon]) => (
              <FormatToggle
                key={v}
                label={t(`textFormat.${v}`)}
                on={valign === v}
                onClick={() => onChange({ valign: v })}
              >
                <Icon size={15} />
              </FormatToggle>
            ))}
          </div>
        )}
      </div>
      <section className="space-y-2 border-t border-[var(--hairline)] pt-3">
        <Checkbox
          label={<Typography variant="label">{t('textFormat.stroke')}</Typography>}
          checked={!!stroke}
          onChange={(on) => onChange({ stroke: on ? (text.outline ?? STROKE) : null })}
        />
        {stroke && (
          <div className="grid grid-cols-2 gap-2 pl-6">
            <NumberInput
              aria-label={t('textFormat.strokeWidth')}
              min={1}
              max={20}
              value={stroke.width}
              onChange={(width) => onChange({ stroke: { ...stroke, width } })}
            />
            <SettledColor
              label={t('textFormat.strokeColor')}
              value={stroke.color}
              onSave={(color) => onChange({ stroke: { ...stroke, color } })}
            />
          </div>
        )}
      </section>
      <section className="space-y-2 border-t border-[var(--hairline)] pt-3">
        <Checkbox
          label={<Typography variant="label">{t('textFormat.shadow')}</Typography>}
          checked={!!shadow}
          onChange={(on) => onChange({ shadow: on ? (text.shadow ?? SHADOW) : null })}
        />
        {shadow && (
          <div className="grid grid-cols-2 gap-2 pl-6">
            <NumberInput
              aria-label={t('textFormat.shadowBlur')}
              min={0}
              max={80}
              value={shadow.blur}
              onChange={(blur) => onChange({ shadow: { ...shadow, blur } })}
            />
            <SettledColor
              label={t('textFormat.shadowColor')}
              value={shadow.color}
              onSave={(color) => onChange({ shadow: { ...shadow, color } })}
            />
          </div>
        )}
      </section>
      <div className="flex items-center gap-2 border-t border-[var(--hairline)] pt-3">
        <Button
          size="xs"
          variant="ghost"
          icon={<RotateCcw size={13} />}
          disabled={Object.keys(format).length === 0}
          title={t('textBar.resetHelp')}
          onClick={onReset}
        >
          {t('textBar.reset')}
        </Button>
      </div>
      {note && (
        <Typography as="p" variant="caption" leading="snug">
          {note}
        </Typography>
      )}
    </div>
  );
}

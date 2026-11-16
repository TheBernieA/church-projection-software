import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { BackgroundAdjust, Theme } from '@lampstand/core';
import { Checkbox, ColorInput, RangeField } from './form';

type TextStyle = Theme['text'];

/** Colour well (hex). Effects store plain hex; transparency comes from their own sliders. */
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
    <ColorInput
      variant="swatch"
      aria-label={label}
      value={value}
      fallback="#000000"
      onChange={onChange}
    />
  );
}

/** An effect that can be switched on, with its settings shown while it's on. */
function Effect({
  label,
  on,
  onToggle,
  colour,
  children,
}: {
  label: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  colour?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Checkbox
          className="flex-1 text-[12px] font-medium"
          label={label}
          checked={on}
          onChange={onToggle}
        />
        {on && colour}
      </div>
      {on && <div className="space-y-1.5 pl-5">{children}</div>}
    </div>
  );
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/**
 * Theme effects: text shadow, outline, glow, letter case and spacing; background dim, blur,
 * brightness, contrast, saturation and a colour tint. Edits the draft; the samples preview it.
 */
export function ThemeEffects({
  draft,
  setText,
  setAdjust,
}: {
  draft: Theme;
  setText: (p: Partial<TextStyle>) => void;
  setAdjust: (p: Partial<BackgroundAdjust>) => void;
}) {
  const { t } = useTranslation();
  const text = draft.text;
  const adj = draft.backgroundAdjust ?? {};
  return (
    <section aria-label={t('theme.effects.title')} className="space-y-5">
      <div className="space-y-3">
        <h4 className="section-label">{t('theme.effects.text')}</h4>
        <Effect
          label={t('theme.shadow')}
          on={!!text.shadow}
          onToggle={(on) =>
            setText({ shadow: on ? { x: 0, y: 4, blur: 18, color: '#000000' } : undefined })
          }
          colour={
            text.shadow && (
              <Colour
                label={t('theme.effects.shadowColour')}
                value={text.shadow.color}
                onChange={(color) => text.shadow && setText({ shadow: { ...text.shadow, color } })}
              />
            )
          }
        >
          {text.shadow && (
            <RangeField
              label={t('theme.effects.softness')}
              value={text.shadow.blur}
              min={0}
              max={40}
              step={1}
              onChange={(blur) => text.shadow && setText({ shadow: { ...text.shadow, blur } })}
            />
          )}
        </Effect>
        <Effect
          label={t('theme.effects.outline')}
          on={!!text.outline}
          onToggle={(on) => setText({ outline: on ? { width: 2, color: '#000000' } : undefined })}
          colour={
            text.outline && (
              <Colour
                label={t('theme.effects.outlineColour')}
                value={text.outline.color}
                onChange={(color) =>
                  text.outline && setText({ outline: { ...text.outline, color } })
                }
              />
            )
          }
        >
          {text.outline && (
            <RangeField
              label={t('theme.effects.width')}
              value={text.outline.width}
              min={0}
              max={10}
              step={0.5}
              onChange={(width) => text.outline && setText({ outline: { ...text.outline, width } })}
            />
          )}
        </Effect>
        <Effect
          label={t('theme.effects.glow')}
          on={!!text.glow}
          onToggle={(on) => setText({ glow: on ? { blur: 24, color: '#f0a73a' } : undefined })}
          colour={
            text.glow && (
              <Colour
                label={t('theme.effects.glowColour')}
                value={text.glow.color}
                onChange={(color) => text.glow && setText({ glow: { ...text.glow, color } })}
              />
            )
          }
        >
          {text.glow && (
            <RangeField
              label={t('theme.effects.size')}
              value={text.glow.blur}
              min={0}
              max={80}
              step={1}
              onChange={(blur) => text.glow && setText({ glow: { ...text.glow, blur } })}
            />
          )}
        </Effect>
        <Effect
          label={t('theme.effects.uppercase')}
          on={text.textTransform === 'uppercase'}
          onToggle={(on) => setText({ textTransform: on ? 'uppercase' : 'none' })}
        />
        <RangeField
          label={t('theme.effects.lineHeight')}
          value={text.lineHeight}
          min={0.9}
          max={2.2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(lineHeight) => setText({ lineHeight })}
        />
        <RangeField
          label={t('theme.effects.letterSpacing')}
          value={text.letterSpacing}
          min={-2}
          max={20}
          step={0.5}
          onChange={(letterSpacing) => setText({ letterSpacing })}
        />
      </div>
      <div className="space-y-2">
        <h4 className="section-label">{t('theme.effects.background')}</h4>
        <RangeField
          label={t('theme.effects.dim')}
          value={adj.dim ?? 0}
          min={0}
          max={0.9}
          step={0.05}
          format={pct}
          onChange={(dim) => setAdjust({ dim })}
        />
        <RangeField
          label={t('theme.effects.blur')}
          value={adj.blur ?? 0}
          min={0}
          max={40}
          step={1}
          onChange={(blur) => setAdjust({ blur })}
        />
        <RangeField
          label={t('theme.effects.brightness')}
          value={adj.brightness ?? 1}
          min={0.2}
          max={2}
          step={0.05}
          format={pct}
          onChange={(brightness) => setAdjust({ brightness })}
        />
        <RangeField
          label={t('theme.effects.contrast')}
          value={adj.contrast ?? 1}
          min={0.2}
          max={2}
          step={0.05}
          format={pct}
          onChange={(contrast) => setAdjust({ contrast })}
        />
        <RangeField
          label={t('theme.effects.saturation')}
          value={adj.saturate ?? 1}
          min={0}
          max={2}
          step={0.05}
          format={pct}
          onChange={(saturate) => setAdjust({ saturate })}
        />
        <Effect
          label={t('theme.effects.tint')}
          on={!!adj.tint}
          onToggle={(on) =>
            setAdjust({ tint: on ? { color: '#1d3a8a', opacity: 0.35 } : undefined })
          }
          colour={
            adj.tint && (
              <Colour
                label={t('theme.effects.tintColour')}
                value={adj.tint.color}
                onChange={(color) => adj.tint && setAdjust({ tint: { ...adj.tint, color } })}
              />
            )
          }
        >
          {adj.tint && (
            <RangeField
              label={t('theme.effects.strength')}
              value={adj.tint.opacity}
              min={0}
              max={1}
              step={0.05}
              format={pct}
              onChange={(opacity) => adj.tint && setAdjust({ tint: { ...adj.tint, opacity } })}
            />
          )}
        </Effect>
      </div>
    </section>
  );
}

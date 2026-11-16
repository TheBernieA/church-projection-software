import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, RotateCcw, Type, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ServiceItem, TextFormat, Theme } from '@lampstand/core';
import { Button, Text } from '@lampstand/ui';
import { BUNDLED_FONTS } from '../../constants';
import { useItemSlides, useSelectedItem } from '../../lib/hooks';
import { itemTitle } from '../../lib/slides';
import { patchItem, useStore } from '../../lib/store';
import { ColorInput } from '../form';
import { Select } from '../Select';

/** Items whose slides show themed text, and so can be formatted from the Text bar. */
type Formattable = Extract<ServiceItem, { textFormat?: TextFormat }>;
const FORMATTABLE = new Set<ServiceItem['kind']>([
  'song',
  'scripture',
  'presentation',
  'announcements',
  'countdown',
]);
export const isFormattable = (item: ServiceItem | null): item is Formattable =>
  !!item && FORMATTABLE.has(item.kind);

/** Small square toggle used for bold, italic and alignment. */
function Toggle({
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
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      onClick={onClick}
      className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] transition-colors ${
        on
          ? 'bg-[var(--select)] text-white'
          : 'text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]'
      }`}
    >
      {children}
    </button>
  );
}

/** Font size: typed freely, saved on Enter or when leaving the field (one undo step). */
function SizeInput({
  label,
  title,
  value,
  onCommit,
}: {
  label: string;
  title: string;
  value: number;
  onCommit: (v: number) => void;
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
      className="field tnum !h-8 !w-[72px]"
    />
  );
}

const Divider = () => <span aria-hidden className="mx-1 h-5 w-px bg-[var(--divider)]" />;

/**
 * The toolbar's Text bar: font, size, style, colour and alignment for the selected playlist
 * item's slides, layered over its theme ("Use theme" removes them). Opens under the toolbar.
 */
export function TextBar() {
  const { t } = useTranslation();
  const item = useSelectedItem();
  const songs = useStore((s) => s.songs);
  const media = useStore((s) => s.media);
  const target = isFormattable(item) ? item : null;
  const { slides } = useItemSlides(target);
  const first = slides.find((s) => s.action.kind === 'content');
  // What the slides look like now (theme + this item's formatting): the controls show it.
  const theme: Theme | undefined =
    first?.action.kind === 'content' ? first.action.content.theme : undefined;
  const format = target?.textFormat ?? {};
  const changed = Object.keys(format).length > 0;

  // Colour pickers fire on every drag step: preview locally, save once things settle.
  const [color, setColor] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const set = (patch: Partial<TextFormat>): void => {
    if (!target) return;
    patchItem<Formattable>(target, (cur) => {
      return { textFormat: { ...cur.textFormat, ...patch } };
    });
  };
  const close = (): void => useStore.setState({ textBarOpen: false });

  const fonts = BUNDLED_FONTS.map((f) => ({
    value: f.family,
    label: f.family,
    description: t(`theme.fontKinds.${f.category}`),
    labelStyle: { fontFamily: `"${f.family}"` },
  }));
  const family = theme?.text.fontFamily ?? '';
  if (family && !fonts.some((f) => f.value === family))
    fonts.unshift({
      value: family,
      label: family,
      description: '',
      labelStyle: { fontFamily: `"${family}"` },
    });

  const bold = (theme?.text.fontWeight ?? 400) >= 600;
  const italic = !!theme?.text.italic;
  const align = theme?.text.align ?? 'center';

  return (
    <section
      aria-label={t('textBar.label')}
      className="flex h-11 shrink-0 items-center gap-1.5 border-t border-[var(--divider)] bg-[var(--surface-1)] px-3"
    >
      <Type size={15} className="shrink-0 text-[var(--text-3)]" />
      {!target || !theme ? (
        <Text as="p" variant="caption" truncate>
          {t('textBar.pick')}
        </Text>
      ) : (
        <>
          <Text
            size={12}
            tone="secondary"
            weight="medium"
            truncate
            className="mr-1 max-w-[180px]"
            title={itemTitle(target, { songs, media })}
          >
            {itemTitle(target, { songs, media })}
          </Text>
          <div className="w-48">
            <Select
              size="sm"
              aria-label={t('textBar.font')}
              value={family}
              onChange={(fontFamily) => set({ fontFamily })}
              options={fonts}
            />
          </div>
          <SizeInput
            label={t('textBar.size')}
            title={t('textBar.sizeHelp')}
            value={theme.autoFit.enabled ? theme.autoFit.maxSize : theme.text.fontSize}
            onCommit={(fontSize) => set({ fontSize })}
          />
          <Divider />
          <Toggle label={t('textBar.bold')} on={bold} onClick={() => set({ bold: !bold })}>
            <Bold size={15} />
          </Toggle>
          <Toggle label={t('textBar.italic')} on={italic} onClick={() => set({ italic: !italic })}>
            <Italic size={15} />
          </Toggle>
          <ColorInput
            aria-label={t('textBar.color')}
            variant="swatch"
            value={color ?? theme.text.color}
            onChange={(hex) => {
              setColor(hex);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => {
                set({ color: hex });
                setColor(null);
              }, 250);
            }}
            className="mx-1"
          />
          <Divider />
          <div role="group" aria-label={t('textBar.align')} className="flex items-center gap-0.5">
            <Toggle
              label={t('textBar.left')}
              on={align === 'left'}
              onClick={() => set({ align: 'left' })}
            >
              <AlignLeft size={15} />
            </Toggle>
            <Toggle
              label={t('textBar.center')}
              on={align === 'center'}
              onClick={() => set({ align: 'center' })}
            >
              <AlignCenter size={15} />
            </Toggle>
            <Toggle
              label={t('textBar.right')}
              on={align === 'right'}
              onClick={() => set({ align: 'right' })}
            >
              <AlignRight size={15} />
            </Toggle>
          </div>
          <Divider />
          <Button
            size="xs"
            variant="ghost"
            icon={<RotateCcw size={13} />}
            disabled={!changed}
            title={t('textBar.resetHelp')}
            onClick={() => patchItem<Formattable>(target, { textFormat: undefined })}
          >
            {t('textBar.reset')}
          </Button>
        </>
      )}
      <span className="flex-1" />
      <button
        type="button"
        aria-label={t('textBar.close')}
        title={t('textBar.close')}
        onClick={close}
        className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]"
      >
        <X size={14} />
      </button>
    </section>
  );
}

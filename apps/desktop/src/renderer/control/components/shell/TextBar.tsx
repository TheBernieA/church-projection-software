import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, RotateCcw, Type, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ServiceItem, TextFormat, Theme } from '@lampstand/core';
import { Button, Typography, IconButton } from '@lampstand/ui';
import { useItemSlides, useSelectedItem } from '../../lib/hooks';
import { itemTitle } from '../../lib/slides';
import { patchItem, useStore } from '../../lib/store';
import { ColorInput } from '../form';
import { Select } from '../Select';
import { FormatToggle, SizeInput, useFontOptions, useSettledColor } from '../textFormat';

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
  const bookNames = useStore((s) => s.bookNames);
  const target = isFormattable(item) ? item : null;
  const { slides } = useItemSlides(target);
  const first = slides.find((s) => s.action.kind === 'content');
  // What the slides look like now (theme + this item's formatting): the controls show it.
  const theme: Theme | undefined =
    first?.action.kind === 'content' ? first.action.content.theme : undefined;
  const format = target?.textFormat ?? {};
  const changed = Object.keys(format).length > 0;

  const set = (patch: Partial<TextFormat>): void => {
    if (!target) return;
    patchItem<Formattable>(target, (cur) => {
      return { textFormat: { ...cur.textFormat, ...patch } };
    });
  };
  const close = (): void => useStore.setState({ textBarOpen: false });
  const family = theme?.text.fontFamily ?? '';
  const fonts = useFontOptions(family);
  // Colour pickers fire on every drag step: preview at once, save once things settle.
  const color = useSettledColor((hex) => set({ color: hex }));

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
        <Typography as="p" variant="caption" truncate>
          {t('textBar.pick')}
        </Typography>
      ) : (
        <>
          <Typography
            size={12}
            tone="secondary"
            weight="medium"
            truncate
            className="mr-1 max-w-[180px]"
            title={itemTitle(target, { songs, media, bookNames })}
          >
            {itemTitle(target, { songs, media, bookNames })}
          </Typography>
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
          <FormatToggle label={t('textBar.bold')} on={bold} onClick={() => set({ bold: !bold })}>
            <Bold size={15} />
          </FormatToggle>
          <FormatToggle
            label={t('textBar.italic')}
            on={italic}
            onClick={() => set({ italic: !italic })}
          >
            <Italic size={15} />
          </FormatToggle>
          <ColorInput
            aria-label={t('textBar.color')}
            variant="swatch"
            value={color.shown ?? theme.text.color}
            onChange={color.change}
            className="mx-1"
          />
          <Divider />
          <div role="group" aria-label={t('textBar.align')} className="flex items-center gap-0.5">
            <FormatToggle
              label={t('textBar.left')}
              on={align === 'left'}
              onClick={() => set({ align: 'left' })}
            >
              <AlignLeft size={15} />
            </FormatToggle>
            <FormatToggle
              label={t('textBar.center')}
              on={align === 'center'}
              onClick={() => set({ align: 'center' })}
            >
              <AlignCenter size={15} />
            </FormatToggle>
            <FormatToggle
              label={t('textBar.right')}
              on={align === 'right'}
              onClick={() => set({ align: 'right' })}
            >
              <AlignRight size={15} />
            </FormatToggle>
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
      <IconButton size="2xs" variant="quiet" aria-label={t('textBar.close')} onClick={close}>
        <X size={14} />
      </IconButton>
    </section>
  );
}

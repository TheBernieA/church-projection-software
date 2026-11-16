import type { ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Check,
  ChevronRight,
  Image as ImageIcon,
  Layers,
  MonitorPlay,
  Palette,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { STOCK_BACKGROUNDS, type BackgroundRef } from '@lampstand/core';
import { IconButton, Typography } from '@lampstand/ui';
import { BUILT_IN_BACKGROUNDS } from '../constants';
import {
  backgroundSwatch,
  mediaBackground,
  sameBackground,
  setItemBackground,
  setServiceBackground,
  useBackgroundItemCount,
  type BackgroundItem,
} from '../lib/itemBackground';
import { useStore } from '../lib/store';
import { ITEM_CLASS, MENU_CLASS, MENU_LABEL_CLASS, SEPARATOR_CLASS } from './menu';

/** A little preview of a background, for menus and the header chip. */
export function Swatch({ bg, size = 'md' }: { bg: BackgroundRef | undefined; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-[3px] shadow-[0_0_0_1px_var(--hairline-strong)] ${
        size === 'sm' ? 'h-3.5 w-6' : 'h-4 w-7'
      }`}
      style={{ background: backgroundSwatch(bg) }}
    />
  );
}

/** One background in the menu, ticked when it's the item's. */
function Choice({
  name,
  bg,
  current,
  onPick,
}: {
  name: string;
  bg: BackgroundRef;
  current: BackgroundRef | undefined;
  onPick: (bg: BackgroundRef) => void;
}) {
  return (
    <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => onPick(bg)}>
      <Swatch bg={bg} size="sm" />
      <Typography truncate className="flex-1">
        {name}
      </Typography>
      {sameBackground(bg, current) && <Check size={14} />}
    </DropdownMenu.Item>
  );
}

/** A submenu of backgrounds (stock, built in, yours). */
function Section({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className={ITEM_CLASS}>
        {icon}
        <Typography className="flex-1">{label}</Typography>
        <ChevronRight size={13} />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent
          sideOffset={4}
          className={`${MENU_CLASS} max-h-[60vh] overflow-y-auto`}
        >
          {children}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}

/**
 * "Background" in an item's header: what sits behind all of its slides. Its theme's background
 * (the default), the one on screen now, any stock or built-in motion background, or one of
 * yours. The button shows the item's own background when it has one.
 */
export function ItemBackground({ item }: { item: BackgroundItem }) {
  const { t } = useTranslation();
  const yours = useStore((s) => s.media).filter((m) => m.isBackground && m.kind !== 'audio');
  const onScreen = useStore((s) => s.live?.program.background?.ref);
  const current = item.background;
  const allCount = useBackgroundItemCount();
  const pick = (bg: BackgroundRef | undefined): void => setItemBackground(item, bg);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton
          size="2xs"
          variant="quiet"
          aria-label={t('itemBg.button')}
          title={current ? t('itemBg.own') : t('itemBg.theme')}
          active={!!current}
        >
          {current ? <Swatch bg={current} size="sm" /> : <ImageIcon size={14} />}
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className={MENU_CLASS}>
          <DropdownMenu.Label className={MENU_LABEL_CLASS}>{t('itemBg.title')}</DropdownMenu.Label>
          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => pick(undefined)}>
            <Palette size={14} />
            <Typography className="flex-1">{t('itemBg.useTheme')}</Typography>
            {!current && <Check size={14} />}
          </DropdownMenu.Item>
          {onScreen && onScreen.kind !== 'none' && (
            <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => pick(onScreen)}>
              <MonitorPlay size={14} />
              <Typography className="flex-1">{t('itemBg.useOnScreen')}</Typography>
              <Swatch bg={onScreen} size="sm" />
            </DropdownMenu.Item>
          )}
          {allCount > 1 && (
            <DropdownMenu.Item
              className={ITEM_CLASS}
              onSelect={() => setServiceBackground(current)}
              title={t('itemBg.copyToAllHint')}
            >
              <Layers size={14} />
              <Typography className="flex-1">
                {t('itemBg.copyToAll', { count: allCount })}
              </Typography>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className={SEPARATOR_CLASS} />
          <Section icon={<ImageIcon size={14} />} label={t('itemBg.stock')}>
            {STOCK_BACKGROUNDS.map((b) => (
              <Choice key={b.id} name={b.name} bg={b.ref} current={current} onPick={pick} />
            ))}
          </Section>
          <Section icon={<ImageIcon size={14} />} label={t('itemBg.builtIn')}>
            {BUILT_IN_BACKGROUNDS.map((b) => (
              <Choice key={b.name} name={b.name} bg={b.ref} current={current} onPick={pick} />
            ))}
          </Section>
          <Section icon={<ImageIcon size={14} />} label={t('itemBg.yours')}>
            {yours.length === 0 ? (
              <DropdownMenu.Item disabled className={ITEM_CLASS}>
                {t('itemBg.noneYet')}
              </DropdownMenu.Item>
            ) : (
              yours.map((m) => (
                <Choice
                  key={m.id}
                  name={m.name}
                  bg={mediaBackground(m)}
                  current={current}
                  onPick={pick}
                />
              ))
            )}
          </Section>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

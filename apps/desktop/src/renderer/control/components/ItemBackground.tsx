import type { ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Check,
  ChevronRight,
  Image as ImageIcon,
  Layers,
  MonitorPlay,
  Palette,
  SunDim,
  Volume2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { STOCK_BACKGROUNDS, type BackgroundRef, type Scrim } from '@lampstand/core';
import { IconButton, Typography } from '@lampstand/ui';
import { BUILT_IN_BACKGROUNDS } from '../constants';
import {
  backgroundSwatch,
  mediaBackground,
  OVERLAY_STRENGTHS,
  sameBackground,
  setItemBackground,
  setItemOverlay,
  setServiceBackground,
  strengthOf,
  useBackgroundItemCount,
  type BackgroundItem,
  type OverlayStrength,
} from '../lib/itemBackground';
import { useStore } from '../lib/store';
import { ITEM_CLASS, MENU_CLASS, MENU_LABEL_CLASS, SEPARATOR_CLASS } from './menu';
import { TILE_TOOL } from './slides/SlideCards';
import { HEADER_TOOL } from './icons/ConsoleIcons';

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

/** A submenu of backgrounds, opened by hovering it (motion, built in, yours). */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className={ITEM_CLASS}>
        <ImageIcon size={14} />
        <Typography className="flex-1">{label}</Typography>
        <ChevronRight size={13} />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent
          sideOffset={4}
          collisionPadding={8}
          className={`${MENU_CLASS} max-h-[60vh] w-64 overflow-y-auto`}
        >
          {children}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}

/**
 * The background menu: the default (the theme's, or the item's for one slide), the one on screen
 * now, any stock or built-in motion background, or one of yours. Extra items (e.g. "use for
 * every item") go after the first two.
 */
export function BackgroundMenu({
  trigger,
  current,
  onPick,
  title,
  defaultLabel,
  align = 'end',
  children,
}: {
  trigger: ReactNode;
  current: BackgroundRef | undefined;
  onPick: (bg: BackgroundRef | undefined) => void;
  title: string;
  /** The first choice: no background of its own. */
  defaultLabel: string;
  align?: 'start' | 'end';
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const media = useStore((s) => s.media);
  const yours = media.filter((m) => m.isBackground && m.kind !== 'audio');
  // Every other picture and video in the library can go behind the words too.
  const library = media.filter((m) => !m.isBackground && m.kind !== 'audio');
  const onScreen = useStore((s) => s.live?.program.background?.ref);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} sideOffset={4} className={MENU_CLASS}>
          <DropdownMenu.Label className={MENU_LABEL_CLASS}>{title}</DropdownMenu.Label>
          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => onPick(undefined)}>
            <Palette size={14} />
            <Typography className="flex-1">{defaultLabel}</Typography>
            {!current && <Check size={14} />}
          </DropdownMenu.Item>
          {onScreen && onScreen.kind !== 'none' && (
            <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => onPick(onScreen)}>
              <MonitorPlay size={14} />
              <Typography className="flex-1">{t('itemBg.useOnScreen')}</Typography>
              <Swatch bg={onScreen} size="sm" />
            </DropdownMenu.Item>
          )}
          {current?.kind === 'video' && (
            <DropdownMenu.CheckboxItem
              className={ITEM_CLASS}
              checked={!!current.sound}
              onCheckedChange={(on) => onPick({ ...current, sound: on || undefined })}
              title={t('itemBg.soundHint')}
            >
              <Volume2 size={14} />
              <Typography className="flex-1">{t('itemBg.sound')}</Typography>
              {current.sound && <Check size={14} />}
            </DropdownMenu.CheckboxItem>
          )}
          {children}
          {/* Hover a kind to see its backgrounds: motion, built in, yours, every picture and video. */}
          <DropdownMenu.Separator className={SEPARATOR_CLASS} />
          <Section label={t('itemBg.stock')}>
            {STOCK_BACKGROUNDS.map((b) => (
              <Choice key={b.id} name={b.name} bg={b.ref} current={current} onPick={onPick} />
            ))}
          </Section>
          <Section label={t('itemBg.builtIn')}>
            {BUILT_IN_BACKGROUNDS.map((b) => (
              <Choice key={b.name} name={b.name} bg={b.ref} current={current} onPick={onPick} />
            ))}
          </Section>
          <Section label={t('itemBg.yours')}>
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
                  onPick={onPick}
                />
              ))
            )}
          </Section>
          {library.length > 0 && (
            <Section label={t('itemBg.library')}>
              {library.map((m) => (
                <Choice
                  key={m.id}
                  name={m.name}
                  bg={mediaBackground(m)}
                  current={current}
                  onPick={onPick}
                />
              ))}
            </Section>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const OVERLAY_STYLES: Scrim['style'][] = ['even', 'edges', 'bottom', 'top'];

/**
 * The readability overlay (hover to open): a dark layer over the item's backgrounds, under the
 * words. Its style (even, darker edges, a band at the bottom or top) and how strong.
 */
function OverlayMenu({ item }: { item: BackgroundItem }) {
  const { t } = useTranslation();
  const cur = item.backgroundOverlay;
  const set = (o: Scrim | undefined): void => setItemOverlay(item, o);
  const strength: OverlayStrength = cur ? strengthOf(cur) : 'medium';
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className={ITEM_CLASS}>
        <SunDim size={14} />
        <Typography className="flex-1">{t('overlay.title')}</Typography>
        {cur && (
          <Typography size={11} tone="muted">
            {t(`overlay.style.${cur.style}`)}
          </Typography>
        )}
        <ChevronRight size={13} />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent
          sideOffset={4}
          collisionPadding={8}
          className={`${MENU_CLASS} w-64`}
        >
          <DropdownMenu.Label className={MENU_LABEL_CLASS}>{t('overlay.help')}</DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={cur?.style ?? 'none'}
            onValueChange={(v) =>
              set(
                v === 'none'
                  ? undefined
                  : { style: v as Scrim['style'], strength: OVERLAY_STRENGTHS[strength] },
              )
            }
          >
            <DropdownMenu.RadioItem value="none" className={ITEM_CLASS}>
              <Typography className="flex-1">{t('overlay.none')}</Typography>
              {!cur && <Check size={14} />}
            </DropdownMenu.RadioItem>
            {OVERLAY_STYLES.map((st) => (
              <DropdownMenu.RadioItem key={st} value={st} className={ITEM_CLASS}>
                <Typography className="flex-1">{t(`overlay.style.${st}`)}</Typography>
                {cur?.style === st && <Check size={14} />}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          {cur && (
            <>
              <DropdownMenu.Separator className={SEPARATOR_CLASS} />
              <DropdownMenu.Label className={MENU_LABEL_CLASS}>
                {t('overlay.strength')}
              </DropdownMenu.Label>
              <DropdownMenu.RadioGroup
                value={strength}
                onValueChange={(v) =>
                  set({ ...cur, strength: OVERLAY_STRENGTHS[v as OverlayStrength] })
                }
              >
                {(Object.keys(OVERLAY_STRENGTHS) as OverlayStrength[]).map((k) => (
                  <DropdownMenu.RadioItem key={k} value={k} className={ITEM_CLASS}>
                    <Typography className="flex-1">{t(`overlay.strengths.${k}`)}</Typography>
                    {strength === k && <Check size={14} />}
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </>
          )}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}

/**
 * "Background" in an item's header: what sits behind all of its slides (its theme's by
 * default). The button shows the item's own background when it has one.
 */
export function ItemBackground({
  item,
  tile = false,
}: {
  item: BackgroundItem;
  /** On the background tile: a small round button over the picture. */
  tile?: boolean;
}) {
  const { t } = useTranslation();
  const current = item.background;
  const allCount = useBackgroundItemCount();
  return (
    <BackgroundMenu
      current={current}
      onPick={(bg) => setItemBackground(item, bg)}
      title={t('itemBg.title')}
      defaultLabel={t('itemBg.useTheme')}
      trigger={
        tile ? (
          <IconButton
            size="2xs"
            variant="bare"
            aria-label={t('itemBg.change')}
            title={current ? t('itemBg.own') : t('itemBg.theme')}
            className={TILE_TOOL}
          >
            <ImageIcon size={12} />
          </IconButton>
        ) : (
          <IconButton
            size="2xs"
            variant="quiet"
            aria-label={t('itemBg.button')}
            title={current ? t('itemBg.own') : t('itemBg.theme')}
            active={!!current}
            className={HEADER_TOOL}
          >
            {current ? <Swatch bg={current} /> : <ImageIcon size={19} strokeWidth={1.25} />}
          </IconButton>
        )
      }
    >
      <OverlayMenu item={item} />
      {allCount > 1 && (
        <DropdownMenu.Item
          className={ITEM_CLASS}
          onSelect={() => setServiceBackground(current)}
          title={t('itemBg.copyToAllHint')}
        >
          <Layers size={14} />
          <Typography className="flex-1">{t('itemBg.copyToAll', { count: allCount })}</Typography>
        </DropdownMenu.Item>
      )}
    </BackgroundMenu>
  );
}

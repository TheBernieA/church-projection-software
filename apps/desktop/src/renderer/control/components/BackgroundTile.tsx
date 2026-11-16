import { useMemo, useState, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Ellipsis, Layers, MonitorPlay, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { makeScene, type BackgroundRef } from '@lampstand/core';
import { IconButton, Typography } from '@lampstand/ui';
import { setBackground } from '../lib/actions';
import {
  setItemBackground,
  setServiceBackground,
  useBackgroundItemCount,
  useTargetItem,
} from '../lib/itemBackground';
import { itemTitle } from '../lib/slides';
import { useStore } from '../lib/store';
import { Tile, REVEAL } from './cards';
import { ITEM_CLASS, MENU_CLASS, MENU_LABEL_CLASS, SEPARATOR_CLASS } from './menu';
import { SceneView } from './SceneView';

/**
 * A background's "…" menu: show it now (behind whatever's live), or put it behind every slide
 * of the item being worked on, so it comes up with those slides each time.
 */
export function BackgroundMenu({ bg, name }: { bg: BackgroundRef; name: string }) {
  const { t } = useTranslation();
  const target = useTargetItem();
  const songs = useStore((s) => s.songs);
  const media = useStore((s) => s.media);
  const targetName = target ? itemTitle(target, { songs, media }) : '';
  const allCount = useBackgroundItemCount();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton
          size="2xs"
          variant="secondary"
          aria-label={t('itemBg.tileMenu', { name })}
          className={`absolute left-1.5 top-1.5 z-[1] !rounded-full !bg-black/60 !text-white backdrop-blur-sm hover:!bg-black/80 data-[state=open]:opacity-100 ${REVEAL}`}
        >
          <Ellipsis size={14} />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} className={MENU_CLASS}>
          <DropdownMenu.Label className={MENU_LABEL_CLASS}>{name}</DropdownMenu.Label>
          <DropdownMenu.Item
            className={ITEM_CLASS}
            disabled={!target}
            onSelect={() => target && setItemBackground(target, bg)}
          >
            <Layers size={14} />
            <Typography truncate className="flex-1">
              {target ? t('itemBg.useFor', { name: targetName }) : t('itemBg.pickItemFirst')}
            </Typography>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={ITEM_CLASS}
            disabled={allCount === 0}
            onSelect={() => setServiceBackground(bg)}
          >
            <Layers size={14} />
            <Typography truncate className="flex-1">
              {t('itemBg.useForAll', { count: allCount })}
            </Typography>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={SEPARATOR_CLASS} />
          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => void setBackground(bg)}>
            <MonitorPlay size={14} />
            {t('itemBg.showNow')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** A tile with its background menu over the corner. */
export function WithBackgroundMenu({
  bg,
  name,
  children,
}: {
  bg: BackgroundRef;
  name: string;
  children: ReactNode;
}) {
  return (
    <div className="group relative">
      {children}
      <BackgroundMenu bg={bg} name={name} />
    </div>
  );
}

/**
 * A built-in background in the picker, drawn by the output renderer: a still frame, and for
 * motion backgrounds live motion while hovered or focused (one animated preview at a time).
 * Click shows it now; its "…" can put it behind an item's slides instead.
 */
export function BackgroundTile({
  name,
  bgRef,
  title,
  onPick,
  menu = true,
}: {
  name: string;
  bgRef: BackgroundRef;
  title: string;
  onPick: () => void;
  /** The "…" menu (off for tiles that do something else, like countdowns). */
  menu?: boolean;
}) {
  const [hot, setHot] = useState(false);
  const moving = bgRef.kind === 'generated';
  const scene = useMemo(() => makeScene({ background: { ref: bgRef } }), [bgRef]);
  const tile = (
    <Tile
      label={name}
      title={title}
      onClick={onPick}
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
    >
      <SceneView scene={scene} mode={moving && hot ? 'monitor' : 'thumbnail'} />
      {moving && (
        <span
          aria-hidden
          className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/45 text-white/90 backdrop-blur-sm"
        >
          <Sparkles size={11} />
        </span>
      )}
    </Tile>
  );
  return menu ? (
    <WithBackgroundMenu bg={bgRef} name={name}>
      {tile}
    </WithBackgroundMenu>
  ) : (
    tile
  );
}

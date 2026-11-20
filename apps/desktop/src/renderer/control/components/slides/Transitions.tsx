import type { ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MediaTransition, ServiceItem, TransitionSpec } from '@lampstand/core';
import { Button, IconButton, Typography } from '@lampstand/ui';
import {
  MEDIA_LENGTHS,
  SLIDE_KINDS,
  SLIDE_LENGTHS,
  describeTransition,
  setDefaultMediaTransition,
  setDefaultSlideTransition,
  setItemTransition,
  slideSpec,
} from '../../lib/transitions';
import { useStore } from '../../lib/store';
import { ITEM_CLASS, MENU_CLASS, MENU_LABEL_CLASS, SEPARATOR_CLASS } from '../menu';
import { HEADER_TOOL, SplitGlyph } from '../icons/ConsoleIcons';

/**
 * Two squares, one in front of the other: which layer a picture or video plays on. The front
 * one filled: over everything; the back one filled: behind the words.
 */
export function LayerGlyph({ behind, size = 14 }: { behind: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <rect
        x="1.25"
        y="1.25"
        width="9"
        height="9"
        rx="1.5"
        fill={behind ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect
        x="5.75"
        y="5.75"
        width="9"
        height="9"
        rx="1.5"
        fill={behind ? '#1b1c20' : 'currentColor'}
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

/**
 * A transition: a square going from solid to transparent (a checkerboard), as one picture gives
 * way to the next.
 */
function TransitionGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <rect
        x="1.5"
        y="1.5"
        width="13"
        height="13"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M2.2 2.2h5.8v11.6H2.2z" fill="currentColor" />
      <path
        d="M8 2.2h3v3H8zM11 5.2h3v3h-3zM8 8.2h3v3H8zM11 11.2h3v2.6h-3z"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  );
}

/** A menu row with a tick when it's the current one. */
function Pick({
  on,
  onSelect,
  children,
}: {
  on: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenu.Item className={ITEM_CLASS} onSelect={onSelect}>
      <Typography className="flex-1">{children}</Typography>
      {on && <Check size={14} />}
    </DropdownMenu.Item>
  );
}

/**
 * The menu of slide transitions: a default choice (the theme's own, or the default one for an
 * item), the kinds, then the lengths.
 */
function SlideTransitionMenu({
  trigger,
  current,
  defaultLabel,
  onPick,
}: {
  trigger: ReactNode;
  current: TransitionSpec | undefined;
  defaultLabel: string;
  onPick: (t: TransitionSpec | undefined) => void;
}) {
  const { t } = useTranslation();
  const name = (k: string): string => t(`transition.kinds.${k}`);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="top" align="start" sideOffset={6} className={MENU_CLASS}>
          <DropdownMenu.Label className={MENU_LABEL_CLASS}>
            {t('transition.slides')}
          </DropdownMenu.Label>
          <Pick on={!current} onSelect={() => onPick(undefined)}>
            {defaultLabel}
          </Pick>
          {SLIDE_KINDS.map((k) => (
            <Pick
              key={k}
              on={current?.kind === k}
              onSelect={() => onPick(slideSpec(k, current?.durationMs || 400))}
            >
              {name(k)}
            </Pick>
          ))}
          {current && current.kind !== 'cut' && (
            <>
              <DropdownMenu.Separator className={SEPARATOR_CLASS} />
              <DropdownMenu.Label className={MENU_LABEL_CLASS}>
                {t('transition.length')}
              </DropdownMenu.Label>
              {SLIDE_LENGTHS.map((ms) => (
                <Pick
                  key={ms}
                  on={current.durationMs === ms}
                  onSelect={() => onPick(slideSpec(current.kind, ms))}
                >
                  {t('transition.seconds', { s: ms / 1000 })}
                </Pick>
              ))}
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** A coloured transition button for the bottom bar: orange for slides, purple for media. */
function TransitionPill({
  colour,
  label,
  value,
  ...rest
}: {
  colour: string;
  label: string;
  value: string;
} & React.ComponentPropsWithoutRef<'button'>) {
  return (
    <Button
      size="xs"
      variant="ghost"
      {...rest}
      aria-label={`${label}: ${value}`}
      title={`${label}: ${value}`}
      className="!gap-1.5 !px-2"
    >
      <span
        aria-hidden
        className="flex h-4 w-4 items-center justify-center rounded-[3px]"
        style={{ background: colour, color: '#fff' }}
      >
        <TransitionGlyph size={11} />
      </span>
      <Typography
        size={11}
        tone="secondary"
        truncate
        className="max-w-[110px] @max-[760px]:max-w-[56px] @max-[560px]:hidden"
      >
        {value}
      </Typography>
    </Button>
  );
}

const SLIDE_COLOUR = '#e0892e';
const MEDIA_COLOUR = '#8b5cf6';

/**
 * The default transitions, bottom left of the slides: how slides change (orange; each theme's
 * own unless set, and an item can set its own) and how pictures and videos change (purple).
 */
export function DefaultTransitions() {
  const { t } = useTranslation();
  const slide = useStore((s) => s.settings?.transitions.slide);
  const media = useStore((s) => s.settings?.transitions.media);
  const name = (k: string): string => t(`transition.kinds.${k}`);
  const pickMedia = (m: MediaTransition | undefined): void => setDefaultMediaTransition(m);
  return (
    <div className="flex items-center gap-0.5">
      <SlideTransitionMenu
        current={slide}
        defaultLabel={t('transition.themes')}
        onPick={setDefaultSlideTransition}
        trigger={
          <TransitionPill
            colour={SLIDE_COLOUR}
            label={t('transition.slides')}
            value={slide ? describeTransition(slide, name) : t('transition.themesShort')}
          />
        }
      />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <TransitionPill
            colour={MEDIA_COLOUR}
            label={t('transition.media')}
            value={media ? describeTransition(media, name) : t('transition.usual')}
          />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content side="top" align="start" sideOffset={6} className={MENU_CLASS}>
            <DropdownMenu.Label className={MENU_LABEL_CLASS}>
              {t('transition.media')}
            </DropdownMenu.Label>
            <Pick on={!media} onSelect={() => pickMedia(undefined)}>
              {t('transition.usualLong')}
            </Pick>
            <Pick
              on={media?.kind === 'cut'}
              onSelect={() => pickMedia({ kind: 'cut', durationMs: 0 })}
            >
              {name('cut')}
            </Pick>
            <Pick
              on={media?.kind === 'dissolve'}
              onSelect={() => pickMedia({ kind: 'dissolve', durationMs: media?.durationMs || 800 })}
            >
              {name('dissolve')}
            </Pick>
            {media?.kind === 'dissolve' && (
              <>
                <DropdownMenu.Separator className={SEPARATOR_CLASS} />
                <DropdownMenu.Label className={MENU_LABEL_CLASS}>
                  {t('transition.length')}
                </DropdownMenu.Label>
                {MEDIA_LENGTHS.map((ms) => (
                  <Pick
                    key={ms}
                    on={media.durationMs === ms}
                    onSelect={() => pickMedia({ kind: 'dissolve', durationMs: ms })}
                  >
                    {t('transition.seconds', { s: ms / 1000 })}
                  </Pick>
                ))}
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

/** An item's own slide transition, in its header (lit when it has one). */
export function ItemTransition({
  item,
}: {
  item: Extract<
    ServiceItem,
    { kind: 'song' | 'scripture' | 'presentation' | 'announcements' | 'countdown' }
  >;
}) {
  const { t } = useTranslation();
  const fallback = useStore((s) => s.settings?.transitions.slide);
  const name = (k: string): string => t(`transition.kinds.${k}`);
  const own = item.transition;
  const label = own
    ? t('transition.itemOwn', { name: describeTransition(own, name) })
    : t('transition.itemDefault');
  return (
    <SlideTransitionMenu
      current={own}
      defaultLabel={t('transition.useDefault', {
        name: fallback ? describeTransition(fallback, name) : t('transition.themesShort'),
      })}
      onPick={(tr) => setItemTransition(item, tr)}
      trigger={
        <IconButton
          size="2xs"
          variant="quiet"
          aria-label={label}
          title={label}
          active={!!own}
          className={HEADER_TOOL}
        >
          <SplitGlyph />
        </IconButton>
      }
    />
  );
}

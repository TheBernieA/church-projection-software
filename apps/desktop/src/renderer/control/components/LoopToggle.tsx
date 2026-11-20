import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ServiceItem } from '@lampstand/core';
import { Button, Typography, typographyClass } from '@lampstand/ui';
import { ADVANCE_SECONDS, advanceOf, setAdvance, takesAdvance } from '../lib/advance';
import { AutoAdvanceGlyph } from './icons/ConsoleIcons';
import { ITEM_CLASS, MENU_CLASS, MENU_LABEL_CLASS, SEPARATOR_CLASS } from './menu';

/**
 * Auto-advance, in an item's header: "8.0s" and a film strip with an arrow (blue) while its
 * slides move on by themselves, the strip alone (grey) while they wait for a click. Click to
 * turn it off or pick how often, and whether it loops back to the first slide.
 */
export function LoopToggle({ item }: { item: ServiceItem }) {
  const { t } = useTranslation();
  if (!takesAdvance(item)) return null;
  const adv = advanceOf(item);
  const announcements = item.kind === 'announcements';
  const label = adv
    ? announcements
      ? t('announce.loopOn', { s: adv.seconds })
      : t('advance.on', { s: adv.seconds })
    : t('announce.loopOff');
  const seconds =
    adv && !ADVANCE_SECONDS.includes(adv.seconds)
      ? [...ADVANCE_SECONDS, adv.seconds].sort((a, b) => a - b)
      : ADVANCE_SECONDS;
  const pick = (s: number): void =>
    setAdvance(item, { seconds: s, loop: adv?.loop ?? announcements });
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          size="2xs"
          variant="bare"
          aria-pressed={!!adv}
          aria-label={label}
          title={adv ? t('advance.help', { s: adv.seconds }) : t('advance.offHelp')}
          className={`flex h-[30px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[5px] px-1.5 hover:bg-[var(--surface-3)] ${typographyClass({ size: 14, weight: 'semibold', tabular: true })}`}
          style={{ color: adv ? 'var(--select)' : 'var(--text-3)' }}
        >
          {adv && `${adv.seconds.toFixed(1)}s`}
          <AutoAdvanceGlyph />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className={MENU_CLASS}>
          <DropdownMenu.Label className={MENU_LABEL_CLASS}>{t('advance.title')}</DropdownMenu.Label>
          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => setAdvance(item, null)}>
            <Typography className="flex-1">{t('advance.off')}</Typography>
            {!adv && <Check size={14} />}
          </DropdownMenu.Item>
          {seconds.map((s) => (
            <DropdownMenu.Item key={s} className={ITEM_CLASS} onSelect={() => pick(s)}>
              <Typography className="flex-1">{t('advance.every', { s })}</Typography>
              {adv?.seconds === s && <Check size={14} />}
            </DropdownMenu.Item>
          ))}
          {/* Announcements always go round; other slides can stop on their last one. */}
          {!announcements && adv && (
            <>
              <DropdownMenu.Separator className={SEPARATOR_CLASS} />
              <DropdownMenu.CheckboxItem
                className={ITEM_CLASS}
                checked={adv.loop}
                onCheckedChange={(loop) => setAdvance(item, { ...adv, loop })}
              >
                <Typography className="flex-1">{t('advance.loop')}</Typography>
                {adv.loop && <Check size={14} />}
              </DropdownMenu.CheckboxItem>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

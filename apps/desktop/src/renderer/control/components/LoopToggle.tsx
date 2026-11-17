import { Repeat } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@lampstand/ui';
import { updateItem } from '../lib/store';
import { type TextItem } from '../types';

/**
 * Announcements move to their next slide on their own while live. This says so (and how often)
 * and turns it on or off.
 */
export function LoopToggle({ item }: { item: TextItem }) {
  const { t } = useTranslation();
  if (item.kind !== 'announcements' || item.slides.length < 2) return null;
  const on = item.autoAdvance;
  return (
    <Button
      size="2xs"
      variant={on ? 'primary' : 'subtle'}
      aria-pressed={on}
      icon={<Repeat size={12} />}
      title={on ? t('announce.loopOnHelp', { s: item.loopIntervalSec }) : t('announce.loopOffHelp')}
      onClick={() =>
        updateItem(item.id, (x) => (x.kind === 'announcements' ? { ...x, autoAdvance: !on } : x))
      }
      className="shrink-0"
    >
      {on ? t('announce.loopOn', { s: item.loopIntervalSec }) : t('announce.loopOff')}
    </Button>
  );
}

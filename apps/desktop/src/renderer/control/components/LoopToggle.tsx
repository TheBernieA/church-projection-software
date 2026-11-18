import { useTranslation } from 'react-i18next';
import { Button, typographyClass } from '@lampstand/ui';
import { AutoAdvanceGlyph } from './icons/ConsoleIcons';
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
  const label = on ? t('announce.loopOn', { s: item.loopIntervalSec }) : t('announce.loopOff');
  return (
    <Button
      size="2xs"
      variant="bare"
      aria-pressed={on}
      aria-label={label}
      title={on ? t('announce.loopOnHelp', { s: item.loopIntervalSec }) : t('announce.loopOffHelp')}
      onClick={() =>
        updateItem(item.id, (x) => (x.kind === 'announcements' ? { ...x, autoAdvance: !on } : x))
      }
      className={`flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-[5px] px-1.5 hover:bg-[var(--surface-3)] ${typographyClass({ size: 12, weight: 'semibold', tabular: true })}`}
      style={{ color: on ? 'var(--select)' : 'var(--text-3)' }}
    >
      {/* "8.0s" and a film strip with an arrow: the slides move on by themselves. */}
      {on && `${item.loopIntervalSec.toFixed(1)}s`}
      <AutoAdvanceGlyph size={17} />
    </Button>
  );
}

import {
  ChevronRight,
  Images,
  ListVideo,
  Store,
  Video,
  Wallpaper,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SoonBadge, Text, NavItem } from '@lampstand/ui';
import { feature } from '../../lib/features';
import { useStore } from '../../lib/store';
import { BackgroundsPanel, MediaPanel } from '../MediaPanel';
import { SoonPanel } from '../bins/SoonPanel';
import { type BinTab } from '../../types';

const CATEGORIES: { tab: BinTab; icon: LucideIcon; soon?: string[] }[] = [
  { tab: 'media', icon: Images },
  { tab: 'backgrounds', icon: Wallpaper },
  { tab: 'video-input', icon: Video, soon: ['video-input'] },
  { tab: 'media-playlists', icon: ListVideo, soon: ['media-playlists'] },
  { tab: 'stock-media', icon: Store, soon: ['stock-media'] },
];

/**
 * Media bin, under the slides (opened from the toolbar's Media button): categories on the
 * left, a breadcrumb on top, and the pictures, videos or backgrounds of the category.
 */
export function Bin({ height }: { height: number }) {
  const { t } = useTranslation();
  const tab = useStore((s) => s.binTab);
  const mediaCount = useStore(
    (s) => s.media.filter((m) => !m.isBackground && m.kind !== 'audio').length,
  );
  const current = CATEGORIES.find((c) => c.tab === tab) ?? CATEGORIES[0];
  return (
    <section aria-label={t('bin.label')} className="flex shrink-0" style={{ height }}>
      <nav
        aria-label={t('bin.label')}
        className="flex w-[180px] shrink-0 flex-col gap-px overflow-y-auto border-r border-[var(--divider)] bg-[var(--surface-1)] py-1.5"
      >
        <Text as="h2" variant="overline" className="px-3 pb-1">
          {t('bin.tabs.media')}
        </Text>
        {CATEGORIES.map(({ tab: x, icon: Icon, soon }) => {
          const on = x === tab;
          return (
            <NavItem
              key={x}
              aria-pressed={on}
              selected={on}
              dim={!!soon}
              title={soon ? t('soon.tooltip', { name: feature(soon[0] ?? '').name }) : undefined}
              onClick={() => useStore.setState({ binTab: x })}
              icon={<Icon size={14} className="text-[var(--text-3)]" />}
              label={t(`bin.tabs.${x}`)}
              trailing={
                <>
                  {x === 'media' && mediaCount > 0 && (
                    <Text size={11} tabular aria-hidden className="opacity-70">
                      {mediaCount}
                    </Text>
                  )}
                  {soon && <SoonBadge label={t('soon.badge')} />}
                </>
              }
            />
          );
        })}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col bg-[var(--surface-0)]">
        <div className="flex h-8 shrink-0 items-center gap-1 border-b border-[var(--divider)] bg-[var(--surface-1)] px-3 text-ui-12 text-[var(--text-2)]">
          <span>{t('bin.tabs.media')}</span>
          {current && current.tab !== 'media' && (
            <>
              <ChevronRight size={12} className="text-[var(--text-3)]" />
              <span className="text-[var(--text-1)]">{t(`bin.tabs.${current.tab}`)}</span>
            </>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {current?.soon ? (
            <SoonPanel ids={current.soon} icon={<current.icon size={20} />} />
          ) : tab === 'backgrounds' ? (
            <BackgroundsPanel />
          ) : (
            <MediaPanel />
          )}
        </div>
      </div>
    </section>
  );
}

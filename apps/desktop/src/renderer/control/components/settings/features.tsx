import { useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Segmented, SoonBadge, Typography } from '@lampstand/ui';
import { openDialog } from '../../lib/store';
import { FEATURE_CATEGORIES, FEATURES } from '../../lib/features';
import { SoonList } from '../Soon';
import { Group, SettingsPage } from './parts';
import { type FeatureStatus } from '../../types';

type Filter = 'all' | FeatureStatus;

/** Settings → Features: everything Lampstand does today, and what is coming. */
export function FeaturesPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const available = FEATURES.filter((f) => f.status === 'available').length;
  const soon = FEATURES.length - available;
  return (
    <SettingsPage
      title={t('settings.pages.features')}
      description={t('features.intro', { available, soon })}
      action={
        <Segmented<Filter>
          label={t('features.filter')}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('features.all') },
            { value: 'available', label: t('features.available') },
            { value: 'soon', label: t('soon.badge') },
          ]}
        />
      }
    >
      {FEATURE_CATEGORIES.map((c) => {
        const rows = FEATURES.filter(
          (f) => f.category === c.id && (filter === 'all' || f.status === filter),
        );
        if (!rows.length) return null;
        return (
          <Group key={c.id} title={c.name}>
            {rows.map((f) => (
              <div
                key={f.id}
                className="flex items-start gap-3 px-4 py-3"
                data-feature={f.id}
                data-status={f.status}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    f.status === 'available'
                      ? 'bg-[var(--tally-preview-soft)] text-[var(--tally-preview)]'
                      : 'bg-[var(--soon-soft)] text-[var(--soon)]'
                  }`}
                >
                  {f.status === 'available' ? (
                    <Check size={12} strokeWidth={3} />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <Typography
                    as="p"
                    size={13}
                    tone="primary"
                    weight="medium"
                    className="flex items-center gap-2"
                  >
                    {f.name}
                    {f.status === 'soon' && <SoonBadge label={t('soon.badge')} />}
                  </Typography>
                  <Typography as="p" variant="caption" leading="snug" className="mt-0.5">
                    {f.description}
                  </Typography>
                </div>
              </div>
            ))}
          </Group>
        );
      })}
    </SettingsPage>
  );
}

/** Settings → Connections: remote control, other software and services (coming soon). */
export function ConnectionsPage() {
  const { t } = useTranslation();
  return (
    <SettingsPage
      title={t('settings.pages.connections')}
      description={t('settings.pagesHelp.connections')}
    >
      <Group title={t('connections.streamingTitle')}>
        <div className="flex items-center gap-4 px-4 py-3.5">
          <Typography size={13} tone="secondary" className="flex-1">
            {t('connections.streaming')}
          </Typography>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openDialog('settings', { settingsPage: 'streaming' })}
          >
            {t('connections.streamingOpen')}
          </Button>
        </div>
      </Group>
      <Group title={t('connections.control')}>
        <SoonList ids={['remote', 'stage-app', 'stream-deck', 'midi-dmx', 'timecode']} />
      </Group>
      <Group title={t('connections.network')}>
        <SoonList ids={['network-link', 'api']} />
      </Group>
      <Group title={t('connections.services')}>
        <SoonList ids={['songselect', 'multitracks', 'planning-center', 'cloud']} />
      </Group>
    </SettingsPage>
  );
}

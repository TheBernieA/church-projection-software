import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SoonBadge, Text, Button } from '@lampstand/ui';
import { feature } from '../../lib/features';
import { openDialog } from '../../lib/store';

/**
 * Placeholder for a planned tool: says what it will do, marked "Coming soon", with a link to
 * the full roadmap. Text comes from the feature catalogue, so it stays in step with Settings.
 */
export function SoonPanel({ ids, icon }: { ids: string[]; icon: ReactNode }) {
  const { t } = useTranslation();
  const items = ids.map(feature);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto p-4">
      <div
        className="my-auto flex max-w-lg flex-col items-center gap-3 text-center"
        data-testid="soon-panel"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-[var(--soon-soft)] text-[var(--soon)]">
          {icon}
        </div>
        {items.map((f) => (
          <div key={f.id} className="flex flex-col items-center gap-1">
            <Text
              as="h3"
              size={14}
              tone="primary"
              weight="semibold"
              className="flex items-center gap-2"
            >
              {f.name}
              <SoonBadge label={t('soon.badge')} />
            </Text>
            <Text as="p" size={12} tone="secondary" leading="relaxed">
              {f.description}
            </Text>
          </div>
        ))}
        <Button
          variant="link"
          size="inline"
          onClick={() => openDialog('settings', { settingsPage: 'features' })}
          className="mt-1"
        >
          {t('soon.roadmap')}
        </Button>
      </div>
    </div>
  );
}

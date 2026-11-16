import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SoonBadge } from '@lampstand/ui';
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
            <h3 className="flex items-center gap-2 text-ui-14 font-semibold text-[var(--text-1)]">
              {f.name}
              <SoonBadge label={t('soon.badge')} />
            </h3>
            <p className="text-ui-12 leading-relaxed text-[var(--text-2)]">{f.description}</p>
          </div>
        ))}
        <button
          type="button"
          onClick={() => openDialog('settings', { settingsPage: 'features' })}
          className="mt-1 cursor-pointer text-ui-12 font-medium text-[var(--accent)] hover:underline"
        >
          {t('soon.roadmap')}
        </button>
      </div>
    </div>
  );
}

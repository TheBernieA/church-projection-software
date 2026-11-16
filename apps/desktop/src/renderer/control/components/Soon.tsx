import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ComingSoonButton, SoonBadge, Typography } from '@lampstand/ui';
import { feature } from '../lib/features';

/**
 * A planned feature's control, placed where it will live: looks like the real button, carries a
 * "Soon" badge, and its tooltip says what it will do (from the feature catalogue).
 */
export function SoonFeature({
  id,
  icon,
  label,
  compact,
  className,
}: {
  id: string;
  icon?: ReactNode;
  /** Shorter label than the feature's catalogue name. */
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const f = feature(id);
  return (
    <ComingSoonButton
      icon={icon}
      compact={compact}
      className={className}
      title={`${t('soon.tooltip', { name: f.name })}. ${f.description}`}
    >
      {label ?? f.name}
    </ComingSoonButton>
  );
}

/** A list of planned features with their descriptions, for settings pages and dialogs. */
export function SoonList({ ids }: { ids: string[] }) {
  const { t } = useTranslation();
  return (
    <ul className="divide-y divide-[var(--hairline)]" data-testid="soon-list">
      {ids.map(feature).map((f) => (
        <li key={f.id} className="flex items-start gap-3 px-4 py-3" data-feature={f.id}>
          <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--soon)]" />
          <div className="min-w-0 flex-1">
            <Typography
              as="p"
              size={13}
              tone="secondary"
              weight="medium"
              className="flex items-center gap-2"
            >
              {f.name}
              <SoonBadge label={t('soon.badge')} />
            </Typography>
            <Typography as="p" variant="caption" leading="snug" className="mt-0.5">
              {f.description}
            </Typography>
          </div>
        </li>
      ))}
    </ul>
  );
}

import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Typography } from '@lampstand/ui';
import { useDeviceAccess } from '../../lib/inputs';

/**
 * When the computer hasn't let Lampstand use its cameras (macOS and Windows ask once), say so
 * plainly and offer the fix: ask now, or open the privacy settings if it was refused. Nothing
 * shows once access is granted.
 */
export function CameraAccess({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const access = useDeviceAccess('camera');
  if (access.status === 'granted' || access.status === 'unknown') return null;
  const refused = access.status === 'denied' || access.status === 'restricted';
  return (
    <div
      role="alert"
      className={`flex items-center gap-3 rounded-[8px] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-3 py-2.5 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_35%,transparent)] ${className}`}
    >
      <Typography tone="inherit" className="flex shrink-0 text-[var(--accent)]">
        <ShieldAlert size={18} />
      </Typography>
      <div className="min-w-0 flex-1">
        <Typography as="p" size={12} weight="semibold" tone="primary">
          {t('inputs.access.title')}
        </Typography>
        <Typography as="p" size={11} tone="muted">
          {refused ? t('inputs.access.refused') : t('inputs.access.ask')}
        </Typography>
      </div>
      {refused ? (
        <>
          <Button size="xs" variant="primary" onClick={access.openSettings}>
            {t('inputs.access.openSettings')}
          </Button>
          <Button size="xs" variant="ghost" onClick={access.recheck}>
            {t('inputs.lookAgain')}
          </Button>
        </>
      ) : (
        <Button size="xs" variant="primary" onClick={access.ask}>
          {t('inputs.access.allow')}
        </Button>
      )}
    </div>
  );
}

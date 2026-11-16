import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Typography } from '@lampstand/ui';
import { useDeviceAccess } from '../../lib/inputs';

/**
 * When the computer hasn't let Lampstand use its cameras or microphones (macOS and Windows ask once), say so
 * plainly and offer the fix: ask now, or open the privacy settings if it was refused. Nothing
 * shows once access is granted.
 */
export function CameraAccess({
  className = '',
  kind = 'camera',
}: {
  className?: string;
  /** Cameras (the default) or microphones. */
  kind?: 'camera' | 'microphone';
}) {
  const { t } = useTranslation();
  const access = useDeviceAccess(kind);
  const k = kind === 'camera' ? 'access' : 'micAccess';
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
          {t(`inputs.${k}.title`)}
        </Typography>
        <Typography as="p" size={11} tone="muted">
          {refused ? t(`inputs.${k}.refused`) : t(`inputs.${k}.ask`)}
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
          {t(`inputs.${k}.allow`)}
        </Button>
      )}
    </div>
  );
}

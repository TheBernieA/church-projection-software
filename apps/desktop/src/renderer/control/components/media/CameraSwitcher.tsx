import { Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Typography } from '@lampstand/ui';
import { showCamera, useCameraSettingsVersion, useInputDevices } from '../../lib/inputs';
import { useStore } from '../../lib/store';
import { Select } from '../Select';

const OFF = 'off';

/**
 * Which camera is on screen: pick another to cut straight to it (with its own settings), or
 * Off. Lists the cameras offered in Media (Settings › Video can hide unused ones).
 */
export function CameraSwitcher({
  size = 'sm',
  label = true,
  className = '',
}: {
  size?: 'sm' | 'md';
  /** Show "Camera" before the dropdown. */
  label?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const devices = useInputDevices('videoinput');
  const saved = useCameraSettingsVersion();
  const liveId = useStore((s) => s.live?.program.input?.deviceId ?? null);
  const offered = (devices ?? []).filter(
    (d) => !saved[d.deviceId]?.hidden || d.deviceId === liveId,
  );
  const value = liveId && offered.some((d) => d.deviceId === liveId) ? liveId : OFF;
  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      {label && (
        <Typography size={12} tone="secondary" className="flex shrink-0 items-center gap-1.5">
          <Video size={13} />
          {t('inputs.onScreen')}
        </Typography>
      )}
      <div className="min-w-0 flex-1">
        <Select<string>
          size={size}
          aria-label={t('inputs.switcherLabel')}
          value={value}
          onChange={(id) => void showCamera(offered.find((d) => d.deviceId === id) ?? null)}
          options={[
            { value: OFF, label: t('inputs.switcherOff') },
            ...offered.map((d) => ({
              value: d.deviceId,
              label: saved[d.deviceId]?.name || d.label,
            })),
          ]}
        />
      </div>
    </div>
  );
}

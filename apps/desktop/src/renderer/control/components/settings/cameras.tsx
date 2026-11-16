import { useEffect, useRef } from 'react';
import { RotateCcw, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Segmented, Switch, Typography } from '@lampstand/ui';
import {
  CAMERA_FITS,
  CAMERA_RESOLUTIONS,
  DEFAULT_CAMERA,
  showCamera,
  updateCamera,
  useCameraSettings,
  useDeviceStream,
  useInputDevices,
  type CameraSettings,
  type InputDevice,
} from '../../lib/inputs';
import { useStore } from '../../lib/store';
import { DeferredInput } from '../DeferredControls';
import { Select } from '../Select';
import { Group, SettingsPage } from './parts';

/** One setting in a camera's card: its name on the left, the control on the right. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <Typography size={12} tone="secondary" className="w-28 shrink-0">
        {label}
      </Typography>
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
    </div>
  );
}

/**
 * One camera: a live preview drawn the way it goes on screen, and its settings (name, Fill or
 * Fit, mirror, capture size). The same settings as its "…" menu in the media bin; while it's
 * live, the screen follows each change.
 */
function CameraCard({ device }: { device: InputDevice }) {
  const { t } = useTranslation();
  const settings = useCameraSettings(device.deviceId);
  const stream = useDeviceStream('videoinput', device.deviceId);
  const video = useRef<HTMLVideoElement>(null);
  const live = useStore((s) => s.live?.program.input?.deviceId === device.deviceId);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  const name = settings.name || device.label;
  const change = (patch: Partial<CameraSettings>): void => updateCamera(device, patch);
  const custom = JSON.stringify(settings) !== JSON.stringify(DEFAULT_CAMERA);
  return (
    <section aria-label={name} className="flex gap-4 px-4 py-4">
      <div className="w-[200px] shrink-0">
        <div
          className={`relative aspect-video overflow-hidden rounded-[4px] bg-black ${
            live
              ? 'shadow-[0_0_0_2px_var(--tally-program)]'
              : 'shadow-[0_0_0_1px_var(--hairline-strong)]'
          }`}
        >
          <video
            ref={video}
            autoPlay
            muted
            playsInline
            aria-label={t('inputs.previewOf', { name })}
            className={`h-full w-full ${settings.fit === 'contain' ? 'object-contain' : 'object-cover'} ${settings.mirror ? '-scale-x-100' : ''}`}
          />
          {!stream && (
            <Typography
              as="div"
              tone="muted"
              className="absolute inset-0 flex items-center justify-center"
            >
              <Video size={22} />
            </Typography>
          )}
        </div>
        <Button
          size="xs"
          variant={live ? 'live' : 'ghost'}
          className="mt-2 w-full"
          onClick={() => void showCamera(live ? null : device)}
        >
          {live ? t('inputs.takeOffShort') : t('inputs.showShort')}
        </Button>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Field label={t('inputs.nameLabel')}>
          <DeferredInput
            aria-label={t('inputs.renameField', { name: device.label })}
            value={settings.name}
            placeholder={device.label}
            maxLength={200}
            onCommit={(v) => change({ name: v.trim() === device.label ? '' : v.trim() })}
            className="field !h-8 w-full"
          />
        </Field>
        <Field label={t('inputs.fitLabel')}>
          <Segmented<CameraSettings['fit']>
            label={t('inputs.fitLabel')}
            value={settings.fit}
            onChange={(fit) => change({ fit })}
            options={CAMERA_FITS.map((f) => ({ value: f, label: t(`inputs.fitShort.${f}`) }))}
          />
        </Field>
        <Field label={t('inputs.mirror')}>
          <Switch
            label={t('inputs.mirrorOf', { name })}
            checked={settings.mirror}
            onChange={(mirror) => change({ mirror })}
          />
        </Field>
        <Field label={t('inputs.resolutionLabel')}>
          <div className="w-40">
            <Select<CameraSettings['resolution']>
              size="sm"
              aria-label={t('inputs.resolutionOf', { name })}
              value={settings.resolution}
              onChange={(resolution) => change({ resolution })}
              options={CAMERA_RESOLUTIONS.map((r) => ({
                value: r,
                label: t(`inputs.resolution.${r}`),
              }))}
            />
          </div>
        </Field>
        {custom && (
          <div>
            <Button
              size="xs"
              variant="ghost"
              icon={<RotateCcw size={13} />}
              onClick={() => change(DEFAULT_CAMERA)}
            >
              {t('inputs.reset')}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Settings › Cameras: every camera and capture card this computer sees, each with how it goes
 * on screen. Kept per camera on this computer (a different computer has different cameras).
 */
export function CamerasPage() {
  const { t } = useTranslation();
  const devices = useInputDevices('videoinput');
  return (
    <SettingsPage title={t('settings.pages.cameras')} description={t('settings.pagesHelp.cameras')}>
      <Group title={t('inputs.camerasTitle')} footnote={t('inputs.camerasFootnote')}>
        {devices === null ? (
          <Typography as="p" size={12} tone="muted" className="px-4 py-4">
            {t('inputs.looking')}
          </Typography>
        ) : devices.length === 0 ? (
          <Typography as="p" size={12} tone="muted" className="px-4 py-4">
            {t('inputs.noCameras')}
          </Typography>
        ) : (
          devices.map((d) => <CameraCard key={d.deviceId} device={d} />)
        )}
      </Group>
    </SettingsPage>
  );
}

import { PtzSettings } from './PtzSettings';
import { useEffect, useRef } from 'react';
import { RefreshCw, RotateCcw, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Settings } from '@lampstand/core';
import { Button, Segmented, Switch, Typography } from '@lampstand/ui';
import {
  rescanDevices,
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
import { Group, Row, SettingsPage } from './parts';
import { CameraAccess } from '../media/CameraAccess';
import { CameraSwitcher } from '../media/CameraSwitcher';

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
  const shown = (c: CameraSettings) => [c.name, c.fit, c.mirror, c.resolution, c.hidden];
  const custom = JSON.stringify(shown(settings)) !== JSON.stringify(shown(DEFAULT_CAMERA));
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
        <Field label={t('inputs.offer')}>
          <Switch
            label={t('inputs.offerOf', { name })}
            checked={!settings.hidden}
            onChange={(on) => change({ hidden: !on })}
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
        <Field label={t('camera.ptzLabel')}>
          <PtzSettings deviceId={device.deviceId} settings={settings} />
        </Field>
        {custom && (
          <div>
            <Button
              size="xs"
              variant="ghost"
              icon={<RotateCcw size={13} />}
              // How it shows goes back to the defaults; its PTZ address and shots are kept.
              onClick={() =>
                change({ ...DEFAULT_CAMERA, ptz: settings.ptz, shots: settings.shots })
              }
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
 * Settings › Video: everything about video in one place. How clips behave when they go live,
 * and every camera and capture card this computer sees, each with how it goes on screen
 * (kept per camera on this computer: a different computer has different cameras).
 */
export function VideoPage({
  s,
  update,
}: {
  s: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  const { t } = useTranslation();
  const devices = useInputDevices('videoinput');
  return (
    <SettingsPage title={t('settings.pages.video')} description={t('settings.pagesHelp.video')}>
      <Group title={t('settings.videoPlayback')}>
        <Row label={t('settings.mediaAutoplay')} description={t('settings.mediaAutoplayHelp')}>
          <Segmented
            label={t('settings.mediaAutoplay')}
            value={s.mediaAutoplay ? 'play' : 'wait'}
            onChange={(v) => update({ mediaAutoplay: v === 'play' })}
            options={[
              { value: 'play', label: t('settings.autoplayPlay') },
              { value: 'wait', label: t('settings.autoplayWait') },
            ]}
          />
        </Row>
      </Group>
      <CameraAccess />
      <Group title={t('inputs.switchTitle')} footnote={t('inputs.switchHelp')}>
        <Row label={t('inputs.switcherLabel')} description={t('inputs.switcherHelp')}>
          <CameraSwitcher label={false} className="w-56" />
        </Row>
        <Row label={t('inputs.overCamera')} description={t('inputs.overCameraHelp')}>
          <Segmented
            label={t('inputs.overCamera')}
            value={s.keepCameraUnderWords ? 'keep' : 'replace'}
            onChange={(v) => update({ keepCameraUnderWords: v === 'keep' })}
            options={[
              { value: 'replace', label: t('inputs.overCameraReplace') },
              { value: 'keep', label: t('inputs.overCameraKeep') },
            ]}
          />
        </Row>
        <Row label={t('switcher.click')} description={t('switcher.clickHelp')}>
          <Segmented<'preview' | 'program'>
            label={t('switcher.click')}
            value={s.switcher.click}
            onChange={(click) => update({ switcher: { ...s.switcher, click } })}
            options={[
              { value: 'preview', label: t('switcher.clickPreview') },
              { value: 'program', label: t('switcher.clickProgram') },
            ]}
          />
        </Row>
        <Row label={t('switcher.pipCorner')} description={t('switcher.pipHelp')}>
          <Segmented<'tl' | 'tr' | 'bl' | 'br'>
            label={t('switcher.pipCorner')}
            value={s.switcher.pip.corner}
            onChange={(corner) =>
              update({ switcher: { ...s.switcher, pip: { ...s.switcher.pip, corner } } })
            }
            options={(['tl', 'tr', 'bl', 'br'] as const).map((c) => ({
              value: c,
              label: t(`switcher.corners.${c}`),
            }))}
          />
        </Row>
        <Row label={t('switcher.pipSize')}>
          <Segmented<string>
            label={t('switcher.pipSize')}
            value={String(s.switcher.pip.size)}
            onChange={(v) =>
              update({ switcher: { ...s.switcher, pip: { ...s.switcher.pip, size: Number(v) } } })
            }
            options={[
              { value: '0.2', label: t('switcher.sizes.small') },
              { value: '0.3', label: t('switcher.sizes.medium') },
              { value: '0.4', label: t('switcher.sizes.large') },
            ]}
          />
        </Row>
      </Group>
      <Group
        title={`${t('inputs.camerasTitle')}${devices ? ` · ${devices.length}` : ''}`}
        footnote={t('inputs.camerasFootnote')}
        action={
          <Button size="xs" variant="ghost" icon={<RefreshCw size={13} />} onClick={rescanDevices}>
            {t('inputs.lookAgain')}
          </Button>
        }
      >
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

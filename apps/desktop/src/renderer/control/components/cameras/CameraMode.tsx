import { Cctv, Play, RefreshCw, Settings2, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, Typography } from '@lampstand/ui';
import { useSize } from '../../lib/hooks';
import { rescanDevices, useCameraSettingsVersion, useInputDevices } from '../../lib/inputs';
import { openDialog, useStore } from '../../lib/store';
import { EmptyState } from '../EmptyState';
import { CameraAccess } from '../media/CameraAccess';
import { SWITCHER_STACKED_WIDTH, SwitcherBar } from '../media/SwitcherBar';
import { InputTile } from '../media/VideoInputs';
import { CameraDeck } from './CameraDeck';
import { ShotGrid } from './ShotGrid';

/** The controls' column on the right. */
const DECK_WIDTH = 340;
/** The camera strip's tiles (px wide). */
const TILE_WIDTH = 208;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** A titled band of the workspace (Cameras, Shots). */
function Band({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2.5 px-4 py-3.5">
      <div className="flex items-baseline gap-2">
        <Typography size={11} weight="bold" tone="muted" caps>
          {title}
        </Typography>
        {aside && (
          <Typography size={11} tone="muted" truncate>
            {aside}
          </Typography>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Cameras (toolbar): the camera operator's desk as a workspace of its own. Big Preview and
 * Program monitors with Cut, Auto and the T-bar; every camera live with its tally (click: to
 * Preview, double-click: straight to Program); the Preview camera's saved shots as pictures; and
 * its controls on the right (joystick, zoom, speed, Follow, focus and exposure). Clicking a
 * person on Preview follows them.
 */
export function CameraMode() {
  const { t } = useTranslation();
  const all = useInputDevices('videoinput');
  const saved = useCameraSettingsVersion();
  // Cameras switched off in Settings › Video stay out of the way here too.
  const devices = all?.filter((d) => !saved[d.deviceId]?.hidden) ?? null;
  const preview = useStore((s) => s.live?.switcher.preview ?? null);
  const previewFirst = useStore((s) => s.settings?.switcher.click !== 'program');
  const [main, size] = useSize();
  // Big monitors: the full width beside the take column (the transition settings go under
  // them), up to about half the height.
  const monitor = Math.round(
    clamp(
      Math.min(((size.width - SWITCHER_STACKED_WIDTH) / 2) * (9 / 16), size.height * 0.5),
      90,
      460,
    ),
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--surface-0)]">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--divider)] bg-[var(--surface-1)] px-3">
        <Cctv size={15} className="shrink-0 text-[var(--accent)]" />
        <Typography as="h2" size={13} weight="semibold" tone="primary" className="shrink-0">
          {t('cameraMode.title')}
        </Typography>
        {devices && (
          <Typography
            size={11}
            tone="muted"
            tabular
            className="shrink-0 rounded-full bg-[var(--surface-2)] px-1.5 py-px"
          >
            {devices.length}
          </Typography>
        )}
        <Typography size={11} tone="muted" truncate className="min-w-0 flex-1 pl-2">
          {previewFirst ? t('cameraMode.hint') : t('inputs.hintProgram')}
        </Typography>
        <IconButton
          size="sm"
          aria-label={t('inputs.lookAgain')}
          title={t('inputs.lookAgainHelp')}
          onClick={rescanDevices}
        >
          <RefreshCw size={14} />
        </IconButton>
        <IconButton
          size="sm"
          aria-label={t('cameraMode.settings')}
          onClick={() => openDialog('settings', { settingsPage: 'video' })}
        >
          <Settings2 size={14} />
        </IconButton>
        <Button
          size="xs"
          variant="subtle"
          icon={<Play size={12} />}
          title={t('cameraMode.backHelp')}
          onClick={() => useStore.setState({ mode: 'show' })}
        >
          {t('cameraMode.back')}
        </Button>
      </header>

      {devices && devices.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <CameraAccess className="w-full max-w-lg" />
          <EmptyState icon={<Video size={26} />} title={t('inputs.noCameras')} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div ref={main} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
            {devices && (
              <SwitcherBar devices={devices} monitorHeight={monitor} stacked controlMode />
            )}
            <CameraAccess className="mx-4 mt-3" />
            <Band title={t('inputs.cameras')}>
              <ul aria-label={t('inputs.cameras')} className="flex gap-3 overflow-x-auto p-1">
                {(devices ?? []).map((d, i) => (
                  <InputTile key={d.deviceId} device={d} n={i + 1} width={TILE_WIDTH} />
                ))}
              </ul>
            </Band>
            <div className="border-t border-[var(--divider)]" />
            <Band title={t('camera.shots')} aside={preview?.label}>
              <ShotGrid />
            </Band>
          </div>
          <aside
            aria-label={t('camera.title')}
            className="flex shrink-0 flex-col border-l border-[var(--divider)] bg-[var(--surface-1)]"
            style={{ width: DECK_WIDTH }}
          >
            <CameraDeck />
          </aside>
        </div>
      )}
    </div>
  );
}

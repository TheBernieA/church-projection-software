import { useState } from 'react';
import { Cctv, ExternalLink, PanelTopClose, Play, RefreshCw, Settings2, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EMPTY_SCENE } from '@lampstand/core';
import { Button, IconButton, Segmented, Typography } from '@lampstand/ui';
import { cmd } from '../../lib/api';
import { useSize } from '../../lib/hooks';
import { rescanDevices, useCameraSettingsVersion, useInputDevices } from '../../lib/inputs';
import { remember, remembered } from '../../lib/prefs';
import { attempt, openDialog, useStore } from '../../lib/store';
import { EmptyState } from '../EmptyState';
import { CameraAccess } from '../media/CameraAccess';
import { BusMonitor, ProgramMonitors } from '../media/SwitcherBar';
import { InputTile } from '../media/VideoInputs';
import {
  BarSection,
  CameraInfo,
  MoveControls,
  PtzImage,
  TrackingControls,
  useControlledCamera,
} from './CameraDeck';
import { RoutingView } from './RoutingView';
import { ShotRows } from './ShotRows';
import { TakePanel } from './TakePanel';

type View = 'operate' | 'routing';
const VIEW_KEY = 'lampstand.cameraView';

/** The control bar's height (px), and the camera strip's tiles (px wide). */
const BAR_HEIGHT = 258;
const TILE_WIDTH = 176;

/** Undock Cameras into a window of its own, or dock it back in the main window. */
const setUndocked = (open: boolean): Promise<unknown> =>
  attempt(() => cmd('cameras.window', { open }), 'errors.camera');

/** The Preview camera's column: its chip, and a PTZ camera's exposure and white balance. */
function CameraColumn() {
  const { t } = useTranslation();
  const { deviceId, isPtz } = useControlledCamera();
  return (
    <BarSection title={t('cameraMode.camera')} className="w-[218px] overflow-y-auto">
      <CameraInfo />
      {deviceId && isPtz && <PtzImage deviceId={deviceId} />}
    </BarSection>
  );
}

/** NEXT and LIVE, as big as the space allows (the stream's own camera inset in LIVE). */
function Monitors({ controlMode }: { controlMode: boolean }) {
  const { t } = useTranslation();
  const preview = useStore((s) => s.live?.switcher.preview ?? null);
  const [area, size] = useSize();
  const height = Math.round(
    Math.max(80, Math.min(size.height - 8, ((size.width - 12) / 2) * (9 / 16))),
  );
  return (
    <div
      ref={area}
      className="flex min-h-0 flex-1 items-center justify-center gap-3 px-4 pb-1 pt-4"
    >
      <BusMonitor
        scene={{ ...EMPTY_SCENE, input: preview }}
        tone="preview"
        label={t('cameraMode.next')}
        name={preview?.label ?? null}
        empty={t('switcher.previewEmpty')}
        height={height}
        clickToFollow={controlMode && !!preview}
      />
      <ProgramMonitors height={height} side={false} label={t('cameraMode.live')} />
    </div>
  );
}

/** In the main window while Cameras is in its own window. */
function Undocked() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-[var(--surface-2)]">
        <ExternalLink size={22} className="text-[var(--accent)]" />
      </span>
      <Typography size={16} weight="semibold" tone="primary">
        {t('cameraMode.undockedTitle')}
      </Typography>
      <Typography size={12} tone="muted" leading="snug" className="max-w-md">
        {t('cameraMode.undockedHelp')}
      </Typography>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => void setUndocked(true)}>
          {t('cameraMode.showWindow')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={<PanelTopClose size={14} />}
          onClick={() => void setUndocked(false)}
        >
          {t('cameraMode.dock')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Cameras: the camera operator's desk, in the main window (toolbar › Cameras) or undocked into a
 * window of its own (`inWindow`), e.g. on a second display.
 *
 * Operate: NEXT and LIVE monitors as big as the window allows, every camera live with its name and
 * tally, then one bar with everything for a service: the camera and its exposure, every camera's
 * saved shots, the joystick and zoom, focus and tracking, and taking it live (to the screens, the
 * stream or both) with FADE, CUT, BLACK and LOWER THIRDS. Routing: drag a camera onto the screens
 * or the livestream.
 */
export function CameraMode({ inWindow = false }: { inWindow?: boolean }) {
  const { t } = useTranslation();
  const undocked = useStore((s) => s.camerasWindow);
  const all = useInputDevices('videoinput');
  const saved = useCameraSettingsVersion();
  // Cameras switched off in Settings › Video stay out of the way here too.
  const devices = all?.filter((d) => !saved[d.deviceId]?.hidden) ?? null;
  const [view, setView] = useState<View>(() =>
    remembered(VIEW_KEY) === 'routing' ? 'routing' : 'operate',
  );
  if (!inWindow && undocked) return <Undocked />;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[var(--surface-0)]">
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
        <span className="ml-2 shrink-0">
          <Segmented<View>
            label={t('cameraMode.view')}
            value={view}
            onChange={(v) => {
              setView(v);
              remember(VIEW_KEY, v);
            }}
            options={[
              { value: 'operate', label: t('cameraMode.operate') },
              { value: 'routing', label: t('cameraMode.routing') },
            ]}
          />
        </span>
        <Typography size={11} tone="muted" truncate className="min-w-0 flex-1 pl-2">
          {view === 'routing' ? t('routing.hint') : t('cameraMode.hint')}
        </Typography>
        <IconButton
          size="sm"
          aria-label={t('inputs.lookAgain')}
          title={t('inputs.lookAgainHelp')}
          onClick={rescanDevices}
        >
          <RefreshCw size={14} />
        </IconButton>
        {/* Settings open in the main window (dialogs live there). */}
        {!inWindow && (
          <IconButton
            size="sm"
            aria-label={t('cameraMode.settings')}
            onClick={() => openDialog('settings', { settingsPage: 'video' })}
          >
            <Settings2 size={14} />
          </IconButton>
        )}
        <Button
          size="xs"
          variant="subtle"
          icon={inWindow ? <PanelTopClose size={12} /> : <ExternalLink size={12} />}
          title={inWindow ? t('cameraMode.dockHelp') : t('cameraMode.undockHelp')}
          onClick={() => void setUndocked(!inWindow)}
        >
          {inWindow ? t('cameraMode.dock') : t('cameraMode.undock')}
        </Button>
        {!inWindow && (
          <Button
            size="xs"
            variant="ghost"
            icon={<Play size={12} />}
            title={t('cameraMode.backHelp')}
            onClick={() => useStore.setState({ mode: 'show' })}
          >
            {t('cameraMode.back')}
          </Button>
        )}
      </header>

      {devices && devices.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <CameraAccess className="w-full max-w-lg" />
          <EmptyState icon={<Video size={26} />} title={t('inputs.noCameras')} />
        </div>
      ) : view === 'routing' ? (
        <RoutingView devices={devices ?? []} />
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Monitors controlMode />
          <CameraAccess className="mx-4 mt-2" />
          {/* Every camera, live, with its name and tally: click for Next, double-click to take. */}
          <ul
            aria-label={t('inputs.cameras')}
            className="flex shrink-0 justify-center gap-2.5 overflow-x-auto px-4 py-3"
          >
            {(devices ?? []).map((d, i) => (
              <InputTile key={d.deviceId} device={d} n={i + 1} width={TILE_WIDTH} overlay />
            ))}
          </ul>
          <div
            className="flex shrink-0 overflow-x-auto border-t border-[var(--divider)] bg-[var(--surface-1)]"
            style={{ height: BAR_HEIGHT }}
          >
            <CameraColumn />
            <BarSection title={t('camera.shots')} className="min-w-[220px] flex-1">
              <ShotRows devices={devices ?? []} />
            </BarSection>
            <BarSection title={t('cameraMode.move')} className="w-[214px]">
              <MoveControls stick={114} rocker={100} />
            </BarSection>
            <BarSection title={t('cameraMode.focusTracking')} className="w-[176px]">
              <TrackingControls />
            </BarSection>
            <BarSection title={t('cameraMode.takeLive')} className="w-[272px]">
              <TakePanel />
            </BarSection>
          </div>
        </div>
      )}
    </div>
  );
}

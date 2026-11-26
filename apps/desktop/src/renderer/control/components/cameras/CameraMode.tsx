import { useState } from 'react';
import { Cctv, Play, RefreshCw, Settings2, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, Segmented, Typography } from '@lampstand/ui';
import { useSize } from '../../lib/hooks';
import { rescanDevices, useCameraSettingsVersion, useInputDevices } from '../../lib/inputs';
import { remember, remembered } from '../../lib/prefs';
import { openDialog, useStore } from '../../lib/store';
import { EmptyState } from '../EmptyState';
import { CameraAccess } from '../media/CameraAccess';
import { SwitcherBar } from '../media/SwitcherBar';
import { InputTile } from '../media/VideoInputs';
import {
  BarSection,
  CameraInfo,
  FollowControls,
  MoveControls,
  PtzImage,
  useControlledCamera,
} from './CameraDeck';
import { RoutingView } from './RoutingView';
import { ShotRows } from './ShotRows';
import { TakePanel } from './TakePanel';

type View = 'operate' | 'routing';
const VIEW_KEY = 'lampstand.cameraView';

/** The control bar's height (px), and the camera strip's tiles. */
const BAR_HEIGHT = 262;
const TILE_WIDTH = 156;
const STRIP_HEIGHT = 150;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The Preview camera's column: who it is, and a PTZ camera's focus and exposure. */
function CameraColumn() {
  const { t } = useTranslation();
  const { deviceId, isPtz } = useControlledCamera();
  return (
    <BarSection title={t('cameraMode.camera')} className="w-[188px] overflow-y-auto">
      <CameraInfo />
      {deviceId && isPtz && <PtzImage deviceId={deviceId} />}
    </BarSection>
  );
}

/**
 * Cameras (toolbar): the camera operator's desk as a workspace of its own.
 *
 * Operate: NEXT (Preview) and LIVE monitors (the screens' and the stream's side by side when they
 * show different cameras), every camera live with its tally, then one bar with everything for a
 * service: the camera's details and exposure, every camera's saved shots, the joystick and zoom,
 * Follow, and taking it live (to the screens, the stream or both) with FADE, CUT, BLACK and LOWER
 * THIRDS. Routing: drag a camera onto the screens or the livestream.
 */
export function CameraMode() {
  const { t } = useTranslation();
  const all = useInputDevices('videoinput');
  const saved = useCameraSettingsVersion();
  // Cameras switched off in Settings › Video stay out of the way here too.
  const devices = all?.filter((d) => !saved[d.deviceId]?.hidden) ?? null;
  const split = useStore((s) => !!s.live?.streamCut);
  const [view, setView] = useState<View>(() =>
    remembered(VIEW_KEY) === 'routing' ? 'routing' : 'operate',
  );
  const [main, size] = useSize();
  // The monitors share the width (two, or three when the stream has its own camera) and take
  // what height the strip and the bar leave.
  const monitors = split ? 3 : 2;
  const monitor = Math.round(
    clamp(
      Math.min(
        ((size.width - 32 - 16 * (monitors - 1)) / monitors) * (9 / 16),
        size.height - BAR_HEIGHT - STRIP_HEIGHT - 26,
      ),
      90,
      440,
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
      ) : view === 'routing' ? (
        <RoutingView devices={devices ?? []} />
      ) : (
        <div ref={main} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          {devices && (
            <SwitcherBar
              devices={devices}
              monitorHeight={monitor}
              stacked
              controlMode
              monitorsOnly
            />
          )}
          <CameraAccess className="mx-4 mt-3" />
          {/* Every camera, live, with its tally: click for Preview, double-click to take. */}
          <ul
            aria-label={t('inputs.cameras')}
            className="flex shrink-0 justify-center gap-3 overflow-x-auto px-4 py-3"
            style={{ minHeight: STRIP_HEIGHT }}
          >
            {(devices ?? []).map((d, i) => (
              <InputTile key={d.deviceId} device={d} n={i + 1} width={TILE_WIDTH} />
            ))}
          </ul>
          <div
            className="mt-auto flex shrink-0 overflow-x-auto border-t border-[var(--divider)] bg-[var(--surface-1)]"
            style={{ height: BAR_HEIGHT }}
          >
            <CameraColumn />
            <BarSection title={t('camera.shots')} className="min-w-[220px] flex-1">
              <ShotRows devices={devices ?? []} />
            </BarSection>
            <BarSection title={t('cameraMode.move')} className="w-[214px]">
              <MoveControls stick={116} rocker={100} />
            </BarSection>
            <BarSection title={t('camera.follow')} className="w-[172px]">
              <FollowControls />
            </BarSection>
            <BarSection title={t('cameraMode.takeLive')} className="w-[254px]">
              <TakePanel />
            </BarSection>
          </div>
        </div>
      )}
    </div>
  );
}

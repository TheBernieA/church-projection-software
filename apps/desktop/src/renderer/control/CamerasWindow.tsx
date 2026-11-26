import { CameraMode } from './components/cameras/CameraMode';
import { ConfirmHost } from './components/ConfirmHost';
import { Toasts } from './components/Toasts';
import { useUiTheme } from './lib/hooks';

/**
 * Cameras undocked into a window of its own (`?view=cameras`): the camera desk on another
 * display while the main window runs the slides. Docking it (or closing the window) puts it
 * back in the main window's Cameras workspace.
 */
export function CamerasWindow() {
  useUiTheme('Lampstand Cameras');
  return (
    <div className="flex h-full flex-col bg-[var(--surface-0)]">
      <CameraMode inWindow />
      <Toasts />
      <ConfirmHost />
    </div>
  );
}

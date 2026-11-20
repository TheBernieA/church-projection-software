import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useInputDevices } from '../../lib/inputs';
import { applyScreenScene, screenSceneOn } from '../../lib/screenScenes';
import { useStore } from '../../lib/store';
import { SCREEN_SCENES } from '../../lib/streamOptions';
import { cameraPair, SceneStrip, sceneChoices, useCameras } from '../scenes/SceneStrip';

/**
 * Scenes for the screens, under the output monitor: the slides, a camera behind the words (full
 * screen or as a lower third), or two cameras together. The same strip as the stream's.
 */
export function ScreenScenes({ trailing }: { trailing?: ReactNode }) {
  const { t } = useTranslation();
  const cameras = useCameras();
  const devices = useInputDevices('videoinput');
  const live = useStore((s) => s.live);
  const input = live?.program.input?.deviceId;
  const pipCam = live?.program.pip?.deviceId;
  // A layout's two cameras: the ones on screen now, else the first two there are.
  const pair = useMemo(() => cameraPair(cameras, input, pipCam), [cameras, input, pipCam]);
  // No cameras: only the slides, so nothing to choose between (just the row's other controls).
  if (cameras.length === 0) return <div className="flex justify-end">{trailing}</div>;
  const choices = sceneChoices(SCREEN_SCENES, cameras, pair, (id, name) =>
    t(`screenScenes.${id}`, { name }),
  );
  const pick = (c: (typeof choices)[number]): void => void applyScreenScene(c, devices ?? []);
  const layout = choices.find((c) => c.patch.background === 'layout' && screenSceneOn(c, live));
  return (
    <SceneStrip
      prefKey="lampstand.screenScenes"
      trailing={trailing}
      label={t('screenScenes.label')}
      choices={choices}
      isOn={(c) => screenSceneOn(c, live)}
      onPick={pick}
      // The screens are always on air: the scene on them gets the red tally.
      onAir
      pair={
        layout && pair
          ? {
              cameras,
              value: pair,
              onChange: (camera, secondCamera) =>
                pick({ ...layout, patch: { ...layout.patch, camera, secondCamera } }),
            }
          : null
      }
    />
  );
}

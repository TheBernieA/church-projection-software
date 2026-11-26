import { Footprints, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { WHOLE } from '@lampstand/core';
import { Button } from '@lampstand/ui';
import { startFollow, stopFollow, useCameraControl } from '../../lib/cameraControl';
import { boxOnMonitor, monitorToPicture } from '../../lib/follow/mapping';
import { useStore } from '../../lib/store';

/**
 * Over a switcher monitor: the person its camera follows, outlined, with a badge that stops
 * following. In camera mode, a click on the Preview picture follows whoever was clicked.
 */
export function FollowOverlay({
  deviceId,
  mirror,
  clickToFollow,
}: {
  deviceId: string | null;
  mirror: boolean;
  /** A click on the picture starts following the person there. */
  clickToFollow: boolean;
}) {
  const { t } = useTranslation();
  const follow = useCameraControl((s) =>
    deviceId && s.follow?.deviceId === deviceId ? s.follow : null,
  );
  const view = useStore((s) => (deviceId ? s.live?.cameraViews[deviceId] : undefined)) ?? WHOLE;
  if (!deviceId || (!follow && !clickToFollow)) return null;
  const box = follow?.box ? boxOnMonitor(follow.box, view, mirror) : null;
  const lost = follow?.status === 'lost';
  return (
    <div
      className={`absolute inset-0 ${clickToFollow ? 'cursor-crosshair' : 'pointer-events-none'}`}
      title={clickToFollow ? t('camera.clickToFollow') : undefined}
      onClick={(e) => {
        if (!clickToFollow) return;
        const r = e.currentTarget.getBoundingClientRect();
        const at = monitorToPicture(
          { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height },
          view,
          mirror,
        );
        void startFollow(deviceId, at);
      }}
    >
      {box && (
        <span
          aria-hidden
          className="absolute rounded-[3px] border-2 border-white/85 shadow-[0_0_0_1px_rgba(0,0,0,0.4)] transition-[left,top,width,height] duration-100 ease-linear"
          style={{
            left: `${box.x * 100}%`,
            top: `${box.y * 100}%`,
            width: `${box.w * 100}%`,
            height: `${box.h * 100}%`,
          }}
        />
      )}
      {follow && (
        <Button
          variant="bare"
          onClick={(e) => {
            e.stopPropagation();
            stopFollow();
          }}
          aria-label={t('camera.stopFollow')}
          title={`${lost ? t('camera.badgeLost') : t('camera.badgeFollowing')} · ${t('camera.stopFollow')}`}
          className="pointer-events-auto absolute right-1.5 top-1.5 flex cursor-pointer items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-white hover:bg-black/80"
        >
          <Footprints size={11} />
          <X size={11} />
        </Button>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Plus, Video, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CameraShot } from '@lampstand/core';
import { cameraTransform } from '@lampstand/renderer';
import { Button, IconButton, Typography } from '@lampstand/ui';
import { deleteShot, recallShot, renameShot, saveShot } from '../../lib/cameraControl';
import { ask } from '../../lib/confirm';
import { useCameraSettings } from '../../lib/inputs';
import { useStore } from '../../lib/store';
import { DeferredInput } from '../DeferredControls';

/**
 * One stream per camera for every shot tile showing it (a camera with twelve shots opens once),
 * released a moment after the last tile goes.
 */
const pool = new Map<
  string,
  {
    stream: Promise<MediaStream | null>;
    users: number;
    timer: ReturnType<typeof setTimeout> | null;
  }
>();

function useSharedStream(deviceId: string, on: boolean): MediaStream | null {
  const [stream, setStream] = useState<MediaStream | null>(null);
  useEffect(() => {
    if (!on) return;
    let entry = pool.get(deviceId);
    if (!entry) {
      entry = {
        stream: navigator.mediaDevices
          .getUserMedia({ video: { deviceId: { exact: deviceId } } })
          .catch(() => null),
        users: 0,
        timer: null,
      };
      pool.set(deviceId, entry);
    }
    const e = entry;
    if (e.timer) clearTimeout(e.timer);
    e.timer = null;
    e.users++;
    let alive = true;
    void e.stream.then((s) => alive && setStream(s));
    return () => {
      alive = false;
      e.users--;
      if (e.users > 0) return;
      e.timer = setTimeout(() => {
        if (e.users > 0) return;
        pool.delete(deviceId);
        void e.stream.then((s) => s?.getTracks().forEach((t) => t.stop()));
      }, 1500);
    };
  }, [deviceId, on]);
  return stream;
}

/** A shot's picture: the camera live, cropped to the shot (digital), or its saved picture (PTZ). */
function ShotPicture({ deviceId, shot }: { deviceId: string; shot: CameraShot }) {
  const live = !shot.thumb && !!shot.view;
  const stream = useSharedStream(deviceId, live);
  const video = useRef<HTMLVideoElement>(null);
  const mirror = useCameraSettings(deviceId).mirror;
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  if (shot.thumb)
    return <img src={shot.thumb} alt="" draggable={false} className="h-full w-full object-cover" />;
  if (live)
    return (
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        className="h-full w-full object-cover"
        style={{ transform: cameraTransform(shot.view, mirror) }}
      />
    );
  return (
    <Typography as="div" tone="muted" className="flex h-full w-full items-center justify-center">
      <Video size={20} />
    </Typography>
  );
}

/** One saved shot: click to go there, double-click to rename, × to delete. */
function ShotTile({ deviceId, shot, n }: { deviceId: string; shot: CameraShot; n: number }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  return (
    <li className="group relative">
      <Button
        variant="bare"
        title={t('camera.shotHelp')}
        aria-label={t('cameraMode.goToShot', { name: shot.name })}
        onClick={() => recallShot(deviceId, shot)}
        onDoubleClick={() => setEditing(true)}
        className="block w-full text-left focus-visible:outline-none"
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-[6px] bg-black shadow-[0_0_0_1px_var(--hairline)] transition-shadow group-hover:shadow-[0_0_0_2px_color-mix(in_srgb,var(--text-1)_55%,transparent)] group-focus-visible:shadow-[0_0_0_2px_var(--accent)]">
          <ShotPicture deviceId={deviceId} shot={shot} />
          <Typography
            size={11}
            weight="bold"
            tone="white"
            tabular
            className="absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-[4px] bg-black/65 px-1"
          >
            {n}
          </Typography>
          {!editing && (
            <Typography
              size={12}
              weight="semibold"
              tone="white"
              truncate
              className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-5"
            >
              {shot.name}
            </Typography>
          )}
        </div>
      </Button>
      {editing && (
        <DeferredInput
          autoFocus
          aria-label={t('camera.renameShot')}
          value={shot.name}
          maxLength={40}
          onCommit={(v) => {
            renameShot(deviceId, shot.id, v);
            setEditing(false);
          }}
          onBlur={() => setEditing(false)}
          className="field absolute inset-x-1.5 bottom-1.5 !h-7"
        />
      )}
      <IconButton
        size="2xs"
        aria-label={t('camera.deleteShot', { name: shot.name })}
        className="absolute right-1.5 top-1.5 !rounded-full !bg-black/60 !text-white opacity-0 backdrop-blur-sm transition-opacity hover:!bg-black/80 focus-visible:opacity-100 group-hover:opacity-100"
        onClick={() =>
          void ask({
            message: t('camera.deleteShotConfirm', { name: shot.name }),
            tone: 'danger',
          }).then((ok) => ok && deleteShot(deviceId, shot.id))
        }
      >
        <X size={12} />
      </IconButton>
    </li>
  );
}

/** The Preview camera's saved shots as picture tiles, and a tile to save the shot it's on. */
export function ShotGrid() {
  const { t } = useTranslation();
  const preview = useStore((s) => s.live?.switcher.preview ?? null);
  const deviceId = preview?.deviceId ?? '';
  const settings = useCameraSettings(deviceId);
  const [saving, setSaving] = useState(false);
  if (!preview)
    return (
      <Typography size={12} tone="muted" className="px-1 py-6 text-center">
        {t('cameraMode.shotsNoCamera')}
      </Typography>
    );
  const shots = settings.shots;
  return (
    <ul
      aria-label={t('cameraMode.shotsOf', { name: preview.label })}
      className="grid gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))' }}
    >
      {shots.map((s, i) => (
        <ShotTile key={s.id} deviceId={deviceId} shot={s} n={i + 1} />
      ))}
      {shots.length < 40 && (
        <li>
          <Button
            variant="bare"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void saveShot(deviceId, t('camera.shotName', { n: shots.length + 1 })).finally(() =>
                setSaving(false),
              );
            }}
            className="flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-[6px] border border-dashed border-[var(--hairline-strong)] text-[var(--text-2)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-1)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <Plus size={18} />
            <Typography size={12} weight="medium" tone="inherit">
              {t('camera.saveShot')}
            </Typography>
          </Button>
        </li>
      )}
    </ul>
  );
}

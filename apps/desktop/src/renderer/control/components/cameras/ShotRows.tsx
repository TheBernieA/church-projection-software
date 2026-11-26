import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CameraShot } from '@lampstand/core';
import { Button, IconButton, Typography } from '@lampstand/ui';
import { deleteShot, recallShot, renameShot, saveShot } from '../../lib/cameraControl';
import { ask } from '../../lib/confirm';
import { useCameraSettings, type InputDevice } from '../../lib/inputs';
import { useStore } from '../../lib/store';
import { previewSource } from '../../lib/switcher';
import { DeferredInput } from '../DeferredControls';

/** One saved shot: click to put its camera on Preview there, double-click to rename. */
function ShotChip({
  device,
  shot,
  onAir,
}: {
  device: InputDevice;
  shot: CameraShot;
  onAir: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <DeferredInput
        autoFocus
        aria-label={t('camera.renameShot')}
        value={shot.name}
        maxLength={40}
        onCommit={(v) => {
          renameShot(device.deviceId, shot.id, v);
          setEditing(false);
        }}
        onBlur={() => setEditing(false)}
        className="field !h-8 w-[112px] shrink-0"
      />
    );
  return (
    <div className="group relative shrink-0">
      <Button
        variant="bare"
        disabled={onAir}
        title={onAir ? t('cameraMode.shotOnAir') : t('cameraMode.shotHelp')}
        aria-label={t('cameraMode.goToShot', { name: shot.name })}
        onClick={() => {
          // The camera goes to Preview and moves there, ready to take.
          void previewSource(device);
          recallShot(device.deviceId, shot);
        }}
        onDoubleClick={() => setEditing(true)}
        className="flex h-8 w-[112px] items-center gap-1.5 overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-3)] pr-2 text-left shadow-[var(--shadow-1)] transition-colors hover:bg-[var(--surface-4)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-45"
      >
        {shot.thumb ? (
          <img
            src={shot.thumb}
            alt=""
            draggable={false}
            className="h-full w-[38px] shrink-0 object-cover"
          />
        ) : (
          <span className="w-1" />
        )}
        <Typography size={12} weight="medium" tone="primary" truncate className="min-w-0">
          {shot.name}
        </Typography>
      </Button>
      <IconButton
        size="xs"
        aria-label={t('camera.deleteShot', { name: shot.name })}
        className="absolute -right-1.5 -top-1.5 hidden !size-5 rounded-full bg-[var(--surface-4)] group-hover:flex"
        onClick={() =>
          void ask({
            message: t('camera.deleteShotConfirm', { name: shot.name }),
            tone: 'danger',
          }).then((ok) => ok && deleteShot(device.deviceId, shot.id))
        }
      >
        <X size={11} />
      </IconButton>
    </div>
  );
}

/** One camera's row: its name with its tally, its shots, and + to save where it's pointing. */
function ShotRow({ device, n }: { device: InputDevice; n: number }) {
  const { t } = useTranslation();
  const settings = useCameraSettings(device.deviceId);
  const name = settings.name || device.label;
  const onPreview = useStore((s) => s.live?.switcher.preview?.deviceId === device.deviceId);
  const onAir = useStore(
    (s) =>
      s.live?.program.input?.deviceId === device.deviceId ||
      (!!s.live?.streamCut && s.live.streamCut.input?.deviceId === device.deviceId),
  );
  const [saving, setSaving] = useState(false);
  const tone = onAir
    ? 'bg-[var(--tally-program)] text-white'
    : onPreview
      ? 'bg-[var(--tally-preview)] text-white'
      : 'bg-[var(--surface-2)] text-[var(--text-2)]';
  return (
    <li className="flex items-center gap-1.5">
      <Button
        variant="bare"
        title={t('cameraMode.rowHelp', { name })}
        onClick={() => void previewSource(device)}
        className={`flex h-8 w-[92px] shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] px-2 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${tone}`}
      >
        <Typography size={11} weight="bold" tone="inherit" tabular>
          {n}
        </Typography>
        <Typography size={11} weight="semibold" tone="inherit" truncate className="min-w-0">
          {name}
        </Typography>
      </Button>
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1.5 pr-1.5 [scrollbar-width:none]">
        {settings.shots.map((s) => (
          <ShotChip key={s.id} device={device} shot={s} onAir={onAir} />
        ))}
        {settings.shots.length < 40 && (
          <IconButton
            size="sm"
            variant="ghost"
            aria-label={t('cameraMode.saveShotOf', { name })}
            title={t('cameraMode.saveShotOf', { name })}
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void saveShot(
                device.deviceId,
                t('camera.shotName', { n: settings.shots.length + 1 }),
              ).finally(() => setSaving(false));
            }}
            className="shrink-0 !border !border-dashed !border-[var(--hairline-strong)]"
          >
            <Plus size={14} />
          </IconButton>
        )}
      </div>
    </li>
  );
}

/** Every camera's saved shots, a row each (the Preview camera's row lit green, on air red). */
export function ShotRows({ devices }: { devices: InputDevice[] }) {
  const { t } = useTranslation();
  return (
    <ul aria-label={t('camera.shots')} className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
      {devices.map((d, i) => (
        <ShotRow key={d.deviceId} device={d} n={i + 1} />
      ))}
    </ul>
  );
}

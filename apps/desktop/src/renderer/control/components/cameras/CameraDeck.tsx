import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Crosshair,
  Focus,
  Footprints,
  ZoomIn,
  ZoomOut,
  Home,
  Minus,
  Plus,
  Rabbit,
  ScanEye,
  Snail,
  Video,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SHOT_SIZES, type ShotSize } from '@lampstand/core';
import { Button, IconButton, Segmented, Slider, Typography } from '@lampstand/ui';
import {
  homeCamera,
  letGo,
  moveCamera,
  ptz,
  setFollowSize,
  setSpeed,
  startFollow,
  stopFollow,
  useCameraControl,
} from '../../lib/cameraControl';
import { useCameraSettings } from '../../lib/inputs';
import { useStore } from '../../lib/store';
import { Select } from '../Select';

/** Stick travel ignored around the middle, and the curve that gives fine control near it. */
const STICK_DEAD = 0.08;
const shape = (v: number): number => {
  const a = Math.abs(v);
  return a < STICK_DEAD ? 0 : Math.sign(v) * Math.pow((a - STICK_DEAD) / (1 - STICK_DEAD), 1.5);
};

/**
 * The joystick: drag from the middle to pan and tilt, further for faster; let go to stop. The
 * zoom rocker beside it springs back to the middle the same way.
 */
function Joystick({
  disabled,
  onMove,
  label,
  size = 116,
}: {
  disabled: boolean;
  onMove: (pan: number, tilt: number) => void;
  label: string;
  size?: number;
}) {
  const pad = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const at = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const r = pad.current?.getBoundingClientRect();
    if (!r) return;
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    setKnob({ x, y });
    onMove(shape(x), shape(-y));
  };
  const release = (): void => {
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };
  return (
    <div
      ref={pad}
      role="application"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onPointerDown={(e) => {
        if (disabled) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        at(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) at(e);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      style={{ width: size, height: size }}
      className={`relative shrink-0 touch-none rounded-full bg-[radial-gradient(circle_at_50%_40%,var(--surface-2),var(--surface-0)_70%)] shadow-[inset_0_0_0_1px_var(--hairline-strong),inset_0_6px_18px_rgba(0,0,0,0.45)] ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing'}`}
    >
      <span className="absolute inset-[22%] rounded-full border border-dashed border-[var(--hairline-strong)]" />
      {/* Direction arrows. */}
      <ChevronUp
        size={14}
        className="absolute left-1/2 top-1.5 -translate-x-1/2 text-[var(--text-3)]"
      />
      <ChevronDown
        size={14}
        className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[var(--text-3)]"
      />
      <ChevronLeft
        size={14}
        className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]"
      />
      <ChevronRight
        size={14}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]"
      />
      <span
        className="absolute left-1/2 top-1/2 rounded-full bg-[linear-gradient(#5b5f69,#3b3e46)] shadow-[0_2px_6px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.18)]"
        style={{
          width: size * 0.38,
          height: size * 0.38,
          transform: `translate(calc(-50% + ${knob.x * size * 0.31}px), calc(-50% + ${knob.y * size * 0.31}px))`,
        }}
      />
    </div>
  );
}

/** The zoom rocker: up to zoom in, down to zoom out, further for faster; springs back. */
function ZoomRocker({
  disabled,
  onZoom,
  label,
  height = 84,
}: {
  disabled: boolean;
  onZoom: (speed: number) => void;
  label: string;
  height?: number;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(0);
  const at = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    const v = Math.max(-1, Math.min(1, -(e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
    setPos(v);
    onZoom(shape(v));
  };
  const release = (): void => {
    setPos(0);
    onZoom(0);
  };
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <ZoomIn size={13} className="text-[var(--text-3)]" />
      <div
        ref={track}
        role="application"
        aria-label={label}
        aria-disabled={disabled || undefined}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          at(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) at(e);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        style={{ height }}
        className={`relative w-8 touch-none rounded-full bg-[var(--surface-0)] shadow-[inset_0_0_0_1px_var(--hairline-strong)] ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-ns-resize'}`}
      >
        <span
          className="absolute left-1/2 top-1/2 h-5 w-6 rounded-[5px] bg-[linear-gradient(#5b5f69,#3b3e46)] shadow-[0_2px_4px_rgba(0,0,0,0.45)]"
          style={{ transform: `translate(-50%, calc(-50% + ${-pos * (height / 2 - 10)}px))` }}
        />
      </div>
      <ZoomOut size={13} className="text-[var(--text-3)]" />
    </div>
  );
}

/** A labelled pair of − / + step buttons (exposure). */
function Stepper({ label, onStep }: { label: string; onStep: (dir: 'up' | 'down') => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5">
      <Typography size={11} tone="secondary" className="w-14 shrink-0">
        {label}
      </Typography>
      <IconButton
        size="xs"
        aria-label={t('camera.less', { what: label })}
        onClick={() => onStep('down')}
      >
        <Minus size={12} />
      </IconButton>
      <IconButton
        size="xs"
        aria-label={t('camera.more', { what: label })}
        onClick={() => onStep('up')}
      >
        <Plus size={12} />
      </IconButton>
    </div>
  );
}

/** Focus, exposure and white balance: on the PTZ camera itself. */
/** Exposure (auto or manual steps) and white balance, on the PTZ camera itself. */
export function PtzImage({ deviceId }: { deviceId: string }) {
  const { t } = useTranslation();
  const [wb, setWb] = useState<'auto' | 'indoor' | 'outdoor' | 'onePush'>('auto');
  const [manual, setManual] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Segmented<'auto' | 'manual'>
        label={t('camera.exposure')}
        value={manual ? 'manual' : 'auto'}
        onChange={(v) => {
          setManual(v === 'manual');
          void ptz({ action: 'exposure', deviceId, mode: v });
        }}
        options={[
          { value: 'auto', label: t('camera.exposureAuto') },
          { value: 'manual', label: t('camera.exposureManual') },
        ]}
      />
      {manual && (
        <>
          <Stepper
            label={t('camera.gain')}
            onStep={(dir) => void ptz({ action: 'step', deviceId, what: 'gain', dir })}
          />
          <Stepper
            label={t('camera.shutter')}
            onStep={(dir) => void ptz({ action: 'step', deviceId, what: 'shutter', dir })}
          />
          <Stepper
            label={t('camera.iris')}
            onStep={(dir) => void ptz({ action: 'step', deviceId, what: 'iris', dir })}
          />
        </>
      )}
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <Select<typeof wb>
            size="sm"
            aria-label={t('camera.whiteBalance')}
            value={wb}
            onChange={(mode) => {
              setWb(mode);
              void ptz({ action: 'whiteBalance', deviceId, mode });
            }}
            options={(['auto', 'indoor', 'outdoor', 'onePush'] as const).map((m) => ({
              value: m,
              label: t(`camera.wb.${m}`),
            }))}
          />
        </div>
        {wb === 'onePush' && (
          <Button
            size="xs"
            variant="secondary"
            onClick={() => void ptz({ action: 'whiteBalanceOnce', deviceId })}
          >
            {t('camera.measureWhite')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** A titled column of the camera bar. */
export function BarSection({
  title,
  children,
  className = '',
  aside,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  aside?: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={`flex min-h-0 shrink-0 flex-col gap-2.5 border-r border-[var(--hairline)] px-4 py-3 last:border-r-0 ${className}`}
    >
      <div className="flex h-4 items-center justify-between gap-2">
        <Typography size={10} weight="bold" tone="muted" caps>
          {title}
        </Typography>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** The camera the bar controls (the one on Preview), and whether it's on air anywhere. */
export function useControlledCamera() {
  const preview = useStore((s) => s.live?.switcher.preview ?? null);
  const deviceId = preview?.deviceId ?? null;
  // On the screens or on the stream: moving it by hand would jump a live shot.
  const onAir = useStore(
    (s) =>
      !!deviceId &&
      (s.live?.program.input?.deviceId === deviceId ||
        s.live?.streamCut?.input?.deviceId === deviceId),
  );
  const settings = useCameraSettings(deviceId ?? '');
  return { preview, deviceId, onAir, settings, isPtz: !!settings.ptz };
}

/** The Preview camera: its name, its tally and what kind of control it has. */
export function CameraInfo() {
  const { t } = useTranslation();
  const { preview, deviceId, onAir, settings, isPtz } = useControlledCamera();
  if (!deviceId)
    return (
      <div className="flex flex-col gap-1.5">
        <span className="flex size-9 items-center justify-center rounded-full bg-[var(--surface-2)]">
          <Video size={16} className="text-[var(--text-3)]" />
        </span>
        <Typography size={12} weight="semibold" tone="primary">
          {t('cameraMode.pickTitle')}
        </Typography>
        <Typography size={11} tone="muted" leading="snug">
          {t('cameraMode.pickHelp')}
        </Typography>
      </div>
    );
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        className="flex min-w-0 max-w-full items-center gap-2 self-start rounded-[var(--radius-md)] bg-[var(--surface-2)] px-2.5 py-1.5"
        style={{
          boxShadow: `inset 0 0 0 1.5px ${onAir ? 'var(--tally-program)' : 'var(--tally-preview)'}`,
        }}
      >
        <Video size={14} className="shrink-0 text-[var(--text-2)]" />
        <Typography
          size={13}
          weight="semibold"
          tone="primary"
          truncate
          className="min-w-0 max-w-[130px]"
        >
          {preview?.label}
        </Typography>
        <Typography
          size={10}
          weight="bold"
          tone="white"
          caps
          className={`shrink-0 rounded-[3px] px-1.5 py-px ${onAir ? 'bg-[var(--tally-program)]' : 'bg-[var(--tally-preview)]'}`}
        >
          {onAir ? t('cameraMode.onAir') : t('cameraMode.onNext')}
        </Typography>
      </div>
      <Typography size={11} tone="muted" leading="snug">
        {isPtz
          ? t('cameraMode.ptzAt', { host: settings.ptz?.host ?? '' })
          : t('camera.digitalKind')}
      </Typography>
      {onAir && (
        <Typography size={11} tone="muted" leading="snug">
          {t('camera.lockedOnProgram')}
        </Typography>
      )}
    </div>
  );
}

/** Joystick, zoom rocker, speed and Home for the Preview camera. */
export function MoveControls({ stick = 128, rocker = 104 }: { stick?: number; rocker?: number }) {
  const { t } = useTranslation();
  const { deviceId, onAir, isPtz } = useControlledCamera();
  const speed = useCameraControl((s) => s.speed);
  const held = useRef({ pan: 0, tilt: 0, zoom: 0 });

  // A new camera on Preview, or this one taken live: whatever was moving stops.
  useEffect(() => {
    held.current = { pan: 0, tilt: 0, zoom: 0 };
    letGo();
  }, [deviceId, onAir]);
  useEffect(() => () => letGo(), []);

  const move = (patch: Partial<typeof held.current>): void => {
    if (!deviceId) return;
    held.current = { ...held.current, ...patch };
    const s = held.current;
    moveCamera(deviceId, s.pan, s.tilt, s.zoom);
  };
  const off = !deviceId || onAir;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-center gap-4">
        <Joystick
          size={stick}
          disabled={off}
          label={t('camera.joystick')}
          onMove={(pan, tilt) => move({ pan, tilt })}
        />
        <ZoomRocker
          height={rocker}
          disabled={off}
          label={t('camera.zoom')}
          onZoom={(zoom) => move({ zoom })}
        />
      </div>
      <div className="flex items-center gap-2" title={t('camera.speedHelp')}>
        <Snail size={14} className="shrink-0 text-[var(--text-3)]" />
        <Slider
          aria-label={t('camera.speed')}
          min={0.25}
          max={2}
          step={0.05}
          value={speed}
          format={(v) => `${v.toFixed(2)}×`}
          onChange={(e) => setSpeed(Number(e.target.value))}
          onDoubleClick={() => setSpeed(1)}
        />
        <Rabbit size={14} className="shrink-0 text-[var(--text-3)]" />
      </div>
      <Button
        size="xs"
        variant="secondary"
        icon={<Home size={12} />}
        disabled={off}
        onClick={() => deviceId && homeCamera(deviceId)}
      >
        {isPtz ? t('camera.home') : t('camera.wholePicture')}
      </Button>
    </div>
  );
}

/**
 * Focus and tracking (the reference's middle column): Focus once (PTZ), Tracking (Follow) on or
 * off, how close it frames, and what it's doing.
 */
export function TrackingControls() {
  const { t } = useTranslation();
  const { deviceId, onAir, isPtz } = useControlledCamera();
  const follow = useCameraControl((s) => s.follow);
  const size = useCameraControl((s) => s.size);
  const followingThis = !!deviceId && follow?.deviceId === deviceId;
  const sizeNow = followingThis ? follow.size : size;
  return (
    <div className="flex flex-col gap-2">
      {/* A disabled button shows no tooltip, so the reason sits on a wrapper that does. */}
      <span
        className="flex flex-col"
        title={isPtz ? t('cameraMode.focusHelp') : t('cameraMode.focusPtzOnly')}
      >
        <Button
          size="sm"
          variant="secondary"
          icon={<Focus size={13} />}
          disabled={!deviceId || !isPtz}
          title={isPtz ? t('cameraMode.focusHelp') : t('cameraMode.focusPtzOnly')}
          onClick={() => deviceId && void ptz({ action: 'focus', deviceId, mode: 'once' })}
        >
          {t('cameraMode.focus')}
        </Button>
      </span>
      {followingThis ? (
        <Button
          size="sm"
          variant="live"
          icon={<Footprints size={13} />}
          onClick={stopFollow}
          title={t('camera.stopFollow')}
        >
          {t('cameraMode.tracking')}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="subtle"
          icon={<ScanEye size={13} />}
          // Allowed on air too: following glides (it eases in like an operator's move), and with
          // one camera it's the only way to start it.
          disabled={!deviceId}
          onClick={() => deviceId && void startFollow(deviceId)}
          title={onAir ? t('camera.followHelpOnAir') : t('camera.followHelp')}
        >
          {t('cameraMode.tracking')}
        </Button>
      )}
      <Segmented<ShotSize>
        label={t('camera.size')}
        value={sizeNow}
        onChange={setFollowSize}
        fill
        options={SHOT_SIZES.map((s) => ({
          value: s,
          label: t(`camera.sizes.${s}`),
          hint: t(`camera.sizeHints.${s}`),
        }))}
      />
      <Typography size={11} tone="muted" leading="snug">
        {followingThis ? (
          t('cameraMode.followingAt', {
            status: t(`camera.status.${follow.status}`),
            size: t(`camera.sizes.${sizeNow}`),
          })
        ) : (
          <>
            <Crosshair size={11} className="mr-1 inline" />
            {t('camera.clickToFollow')}
          </>
        )}
      </Typography>
      {follow && !followingThis && (
        <Button size="xs" variant="ghost" icon={<X size={12} />} onClick={stopFollow}>
          {t('camera.stopOther')}
        </Button>
      )}
    </div>
  );
}

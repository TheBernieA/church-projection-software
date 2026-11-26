import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  Crosshair,
  Footprints,
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
      {/* Direction marks. */}
      <span className="absolute left-1/2 top-2 h-1.5 w-px -translate-x-1/2 bg-[var(--text-3)]" />
      <span className="absolute bottom-2 left-1/2 h-1.5 w-px -translate-x-1/2 bg-[var(--text-3)]" />
      <span className="absolute left-2 top-1/2 h-px w-1.5 -translate-y-1/2 bg-[var(--text-3)]" />
      <span className="absolute right-2 top-1/2 h-px w-1.5 -translate-y-1/2 bg-[var(--text-3)]" />
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
      <Plus size={12} className="text-[var(--text-3)]" />
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
      <Minus size={12} className="text-[var(--text-3)]" />
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
function PtzImage({ deviceId }: { deviceId: string }) {
  const { t } = useTranslation();
  const [wb, setWb] = useState<'auto' | 'indoor' | 'outdoor' | 'onePush'>('auto');
  const [manual, setManual] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        <Button
          size="xs"
          variant="secondary"
          onClick={() => void ptz({ action: 'focus', deviceId, mode: 'once' })}
        >
          {t('camera.focusNow')}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => void ptz({ action: 'focus', deviceId, mode: 'auto' })}
        >
          {t('camera.autoFocus')}
        </Button>
      </div>
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

/** A titled group in the deck. */
function DeckSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-2.5 border-t border-[var(--hairline)] px-4 py-3.5"
    >
      <Typography size={10} weight="bold" tone="muted" caps>
        {title}
      </Typography>
      {children}
    </section>
  );
}

/**
 * The camera desk's controls (Cameras mode, right): they drive the camera on Preview. A PTZ
 * camera (Settings › Video: its address) moves on its motors; any other camera moves a digital
 * shot inside its picture. Follow keeps a person framed (Close, Waist, Full) and carries on when
 * the camera goes to Program. Moving by hand is off for the camera on Program, so a live shot
 * never jumps.
 */
export function CameraDeck() {
  const { t } = useTranslation();
  const preview = useStore((s) => s.live?.switcher.preview ?? null);
  const programId = useStore((s) => s.live?.program.input?.deviceId ?? null);
  const follow = useCameraControl((s) => s.follow);
  const speed = useCameraControl((s) => s.speed);
  const size = useCameraControl((s) => s.size);
  const deviceId = preview?.deviceId ?? null;
  const settings = useCameraSettings(deviceId ?? '');
  const onProgram = !!deviceId && deviceId === programId;
  const isPtz = !!settings.ptz;
  const stick = useRef({ pan: 0, tilt: 0, zoom: 0 });

  // A new camera on Preview, or this one taken to Program: whatever was moving stops.
  useEffect(() => {
    stick.current = { pan: 0, tilt: 0, zoom: 0 };
    letGo();
  }, [deviceId, onProgram]);
  useEffect(() => () => letGo(), []);

  const move = (patch: Partial<typeof stick.current>): void => {
    if (!deviceId) return;
    stick.current = { ...stick.current, ...patch };
    const s = stick.current;
    moveCamera(deviceId, s.pan, s.tilt, s.zoom);
  };

  if (!deviceId)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-[var(--surface-2)]">
          <Video size={20} className="text-[var(--text-3)]" />
        </span>
        <Typography size={13} weight="semibold" tone="primary">
          {t('cameraMode.pickTitle')}
        </Typography>
        <Typography size={12} tone="muted" leading="snug">
          {t('cameraMode.pickHelp')}
        </Typography>
        {follow && (
          <Button size="xs" variant="secondary" icon={<X size={12} />} onClick={stopFollow}>
            {t('camera.stopFollow')}
          </Button>
        )}
      </div>
    );

  const followingThis = follow?.deviceId === deviceId;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex flex-col gap-1 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Typography
            size={14}
            weight="semibold"
            tone="primary"
            truncate
            className="min-w-0 flex-1"
          >
            {preview?.label}
          </Typography>
          <Typography
            size={10}
            weight="bold"
            tone="white"
            caps
            className={`shrink-0 rounded-[3px] px-1.5 py-px ${onProgram ? 'bg-[var(--tally-program)]' : 'bg-[var(--tally-preview)]'}`}
          >
            {onProgram ? t('camera.onProgram') : t('camera.onPreview')}
          </Typography>
        </div>
        <Typography size={11} tone="muted" leading="snug">
          {isPtz
            ? t('cameraMode.ptzAt', { host: settings.ptz?.host ?? '' })
            : t('camera.digitalKind')}
        </Typography>
        {onProgram && (
          <Typography size={11} tone="muted" leading="snug" className="mt-1">
            {t('camera.lockedOnProgram')}
          </Typography>
        )}
      </div>

      <DeckSection title={t('cameraMode.move')}>
        <div className="flex items-center justify-center gap-5 py-1">
          <Joystick
            size={156}
            disabled={onProgram}
            label={t('camera.joystick')}
            onMove={(pan, tilt) => move({ pan, tilt })}
          />
          <ZoomRocker
            height={128}
            disabled={onProgram}
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
          size="sm"
          variant="secondary"
          icon={<Home size={13} />}
          disabled={onProgram}
          onClick={() => homeCamera(deviceId)}
        >
          {isPtz ? t('camera.home') : t('camera.wholePicture')}
        </Button>
      </DeckSection>

      <DeckSection title={t('camera.follow')}>
        {followingThis ? (
          <Button
            size="md"
            variant="live"
            icon={<Footprints size={14} />}
            onClick={stopFollow}
            title={t('camera.stopFollow')}
          >
            {t(`camera.status.${follow.status}`)}
          </Button>
        ) : (
          <Button
            size="md"
            variant="secondary"
            icon={<ScanEye size={14} />}
            disabled={onProgram}
            onClick={() => void startFollow(deviceId)}
            title={t('camera.followHelp')}
          >
            {t('camera.startFollow')}
          </Button>
        )}
        <Segmented<ShotSize>
          label={t('camera.size')}
          value={followingThis ? follow.size : size}
          onChange={setFollowSize}
          options={SHOT_SIZES.map((s) => ({ value: s, label: t(`camera.sizes.${s}`) }))}
        />
        <Typography size={11} tone="muted" leading="snug">
          <Crosshair size={11} className="mr-1 inline" />
          {t('camera.clickToFollow')}
        </Typography>
        {follow && !followingThis && (
          <Button size="xs" variant="ghost" icon={<X size={12} />} onClick={stopFollow}>
            {t('camera.stopOther')}
          </Button>
        )}
      </DeckSection>

      {isPtz && (
        <DeckSection title={t('camera.image')}>
          <PtzImage deviceId={deviceId} />
        </DeckSection>
      )}
    </div>
  );
}

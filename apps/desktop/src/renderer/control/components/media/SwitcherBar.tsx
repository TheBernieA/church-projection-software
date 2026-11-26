import { FollowOverlay } from './FollowOverlay';
import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Link2, Unlink2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  EMPTY_SCENE,
  SWITCH_TARGETS,
  type InputTransition,
  type Scene,
  type SwitchTarget,
} from '@lampstand/core';
import { Button, Kbd, Segmented, Typography } from '@lampstand/ui';
import { type InputDevice } from '../../lib/inputs';
import { saveSettings } from '../../lib/actions';
import { useStore } from '../../lib/store';
import { displayCombo, effectiveShortcuts } from '../../lib/shortcuts';
import {
  auto,
  cut,
  linkStream,
  setPip,
  setSwitchTarget,
  tbar,
  tbarRelease,
  useSwitchTarget,
} from '../../lib/switcher';
import { SceneView } from '../SceneView';
import { Select } from '../Select';

const KINDS: InputTransition['kind'][] = ['cut', 'fade', 'dip', 'wipe'];
const DURATIONS = [300, 600, 1000, 1500, 2000];
const OFF = 'off';
/** Cut and Auto stay this tall (px) however small the monitors get. */
const MIN_TAKE_HEIGHT = 72;
/** Width (px) of everything in the strip but the two monitors: the take column, the settings
 *  column, the gaps and padding (the monitors share what's left). */
export const SWITCHER_FIXED_WIDTH = 124 + 300 + 2 * 12 + 20 + 32;
/** The same with the settings on their own row under the monitors (a narrow pane). */
export const SWITCHER_STACKED_WIDTH = 124 + 2 * 12 + 32;
/** How much taller the strip is with the settings on their own row: the row and its gap (px). */
export const SWITCHER_STACKED_EXTRA = 32 + 12;
/** The strip is never shorter than its settings column (px). */
export const SWITCHER_MIN_HEIGHT = 72;

/**
 * One bus monitor (Preview or Program): the camera layer alone, with its tally colour. The
 * camera's name sits on the picture; an empty bus says what to do.
 */
function BusMonitor({
  scene,
  tone,
  label,
  name,
  empty,
  height,
  clickToFollow = false,
  children,
}: {
  /** In camera mode, a click on the picture follows the person there (Preview). */
  clickToFollow?: boolean;
  scene: Scene;
  tone: 'preview' | 'program';
  label: string;
  name: string | null;
  /** Shown on the black picture when nothing is on this bus. */
  empty: string;
  /** Picture height (px): the monitors scale with the room the pane has. */
  height: number;
  /** Something drawn over the picture (the stream's own camera, inset). */
  children?: ReactNode;
}) {
  const color = tone === 'program' ? 'var(--tally-program)' : 'var(--tally-preview)';
  return (
    // Sized from the pane, and free to shrink a little more rather than push the controls
    // out of line.
    <figure
      className="min-w-0 shrink self-center"
      style={{ flexBasis: (height * 16) / 9, maxWidth: (height * 16) / 9 }}
    >
      <div
        className="relative overflow-hidden rounded-[6px] bg-black"
        style={{ boxShadow: `0 0 0 2px ${color}` }}
      >
        <SceneView scene={scene} label={`${label}: ${name ?? '—'}`} />
        <FollowOverlay
          deviceId={scene.input?.deviceId ?? null}
          mirror={scene.input?.mirror ?? false}
          clickToFollow={clickToFollow && !!scene.input}
        />
        <Typography
          size={10}
          weight="bold"
          tone="white"
          caps
          className="absolute left-1.5 top-1.5 rounded-[3px] px-1.5 py-px"
          style={{ background: color }}
        >
          {label}
        </Typography>
        {name ? (
          <Typography
            as="figcaption"
            size={11}
            weight="semibold"
            tone="white"
            truncate
            className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-4"
          >
            {name}
          </Typography>
        ) : height < 90 ? null : (
          <Typography
            as="figcaption"
            size={11}
            tone="white"
            leading="snug"
            className="absolute inset-0 flex items-center justify-center px-4 text-center opacity-60"
          >
            {empty}
          </Typography>
        )}
        {children}
      </div>
    </figure>
  );
}

/**
 * The T-bar: drag it down to mix the Preview camera over Program by hand. Let go past half-way
 * and the take finishes; before that it goes back. It springs back to the top after each mix.
 */
export function TBar({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const track = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(0);
  const move = (e: PointerEvent<HTMLDivElement>): void => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    const p = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setPos(p);
    tbar(p);
  };
  return (
    <div
      ref={track}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={t('switcher.tbar')}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pos * 100)}
      aria-disabled={disabled}
      title={t('switcher.tbarHelp')}
      onPointerDown={(e) => {
        if (disabled) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e);
      }}
      // However the drag ends (let go, cancelled, or taking became impossible mid-drag), a
      // started mix is always finished, so Program is never left half-way.
      onLostPointerCapture={() => {
        tbarRelease();
        setPos(0);
      }}
      className={`relative h-full w-7 shrink-0 touch-none rounded-[6px] bg-[var(--surface-0)] shadow-[inset_0_0_0_1px_var(--hairline-strong)] ${disabled ? 'opacity-40' : 'cursor-ns-resize'}`}
    >
      <span
        className="absolute inset-x-[13px] top-1 rounded-full bg-[var(--tally-preview)] opacity-70"
        style={{ height: `calc((100% - 8px) * ${pos})` }}
      />
      <span
        className="absolute left-1/2 h-3 w-7 -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-[linear-gradient(#e9eaee,#a9acb5)] shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
        style={{ top: `calc(4px + (100% - 8px) * ${pos})` }}
      />
    </div>
  );
}

/** What Cut and Auto may do now: something on Preview that the destination doesn't show yet. */
export function useCanTake(): boolean {
  const to = useSwitchTarget((s) => s.to);
  const preview = useStore((s) => s.live?.switcher.preview?.deviceId ?? null);
  const screens = useStore((s) => s.live?.program.input?.deviceId ?? null);
  const own = useStore((s) => s.live?.streamCut ?? null);
  const stream = own ? (own.input?.deviceId ?? null) : screens;
  const current = to === 'stream' ? stream : screens;
  const split = to === 'both' && stream !== screens;
  return !!preview && (preview !== current || split);
}

/**
 * Where a take goes (Both, Screens, Stream), and Link while the stream has its own camera: the
 * same choice everywhere (Media › Video input, Cameras), remembered on this computer.
 */
export function TakeTo({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const to = useSwitchTarget((s) => s.to);
  const split = useStore((s) => !!s.live?.streamCut);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {!compact && (
        <Typography size={11} tone="secondary" className="shrink-0">
          {t('switcher.takeTo')}
        </Typography>
      )}
      <Segmented<SwitchTarget>
        label={t('switcher.takeTo')}
        value={to}
        onChange={setSwitchTarget}
        options={SWITCH_TARGETS.map((x) => ({
          value: x,
          label: t(`switcher.to.${x}`),
          name: t(`switcher.toHelp.${x}`),
        }))}
      />
      {split && (
        <Button
          size="2xs"
          variant="subtle"
          icon={<Link2 size={12} />}
          title={t('switcher.linkHelp')}
          onClick={() => void linkStream()}
        >
          {t('switcher.link')}
        </Button>
      )}
    </div>
  );
}

/** The Program side: one monitor, or the screens' and the stream's when they differ. */
function ProgramMonitors({
  height,
  side,
}: {
  height: number;
  /** Split: the stream's monitor beside the screens' (else inset in its corner). */
  side: boolean;
}) {
  const { t } = useTranslation();
  const input = useStore((s) => s.live?.program.input ?? null);
  const inputNext = useStore((s) => s.live?.program.inputNext ?? null);
  const pip = useStore((s) => s.live?.program.pip ?? null);
  const own = useStore((s) => s.live?.streamCut ?? null);
  const programScene: Scene = { ...EMPTY_SCENE, input, inputNext, pip };
  if (!own)
    return (
      <BusMonitor
        scene={programScene}
        tone="program"
        label={t('switcher.program')}
        name={input?.label ?? null}
        empty={t('switcher.programEmpty')}
        height={height}
      />
    );
  const streamScene: Scene = {
    ...EMPTY_SCENE,
    input: own.input,
    inputNext: own.inputNext ?? null,
    pip,
  };
  if (side)
    return (
      <>
        <BusMonitor
          scene={programScene}
          tone="program"
          label={t('switcher.screens')}
          name={input?.label ?? null}
          empty={t('switcher.slidesOnly')}
          height={height}
        />
        <BusMonitor
          scene={streamScene}
          tone="program"
          label={t('switcher.stream')}
          name={own.input?.label ?? null}
          empty={t('switcher.slidesOnly')}
          height={height}
        />
      </>
    );
  return (
    <BusMonitor
      scene={programScene}
      tone="program"
      label={t('switcher.screens')}
      name={input?.label ?? null}
      empty={t('switcher.slidesOnly')}
      height={height}
    >
      <div
        className="absolute bottom-1.5 right-1.5 w-[38%] overflow-hidden rounded-[4px] bg-black shadow-[0_0_0_1.5px_var(--tally-program),0_4px_12px_rgba(0,0,0,0.5)]"
        title={t('switcher.streamOwn', { name: own.input?.label ?? t('switcher.slidesOnly') })}
      >
        <SceneView
          scene={streamScene}
          label={`${t('switcher.stream')}: ${own.input?.label ?? '—'}`}
        />
        <Typography
          size={10}
          weight="bold"
          tone="white"
          caps
          className="absolute left-1 top-1 flex items-center gap-1 rounded-[3px] bg-[var(--tally-program)] px-1 py-px"
        >
          <Unlink2 size={9} />
          {t('switcher.stream')}
        </Typography>
      </div>
    </BusMonitor>
  );
}

/**
 * The switcher's control strip (Media › Video input, Cameras): Preview and Program monitors,
 * Cut and Auto, the transition and its length, the T-bar, picture-in-picture, and where takes go.
 * `monitorsOnly`: just the monitors (Cameras puts the take controls in its own bar).
 */
export function SwitcherBar({
  devices,
  monitorHeight,
  stacked,
  controlMode = false,
  monitorsOnly = false,
}: {
  /** In Cameras mode: a click on a person on Preview follows them. */
  controlMode?: boolean;
  monitorsOnly?: boolean;
  devices: InputDevice[];
  /** How tall the Preview and Program pictures are (px), from the space available. */
  monitorHeight: number;
  /** A narrow pane: the transition settings go on a row of their own, under the monitors. */
  stacked: boolean;
}) {
  const { t } = useTranslation();
  const settings = useStore((s) => s.settings?.switcher);
  const preview = useStore((s) => s.live?.switcher.preview ?? null);
  const input = useStore((s) => s.live?.program.input ?? null);
  const streamId = useStore((s) => s.live?.streamCut?.input?.deviceId ?? null);
  const canTake = useCanTake();
  // Subscribed, so the key hints follow a shortcut remapped in Settings.
  useStore((s) => s.settings?.shortcuts);
  if (!settings) return null;
  const keys = effectiveShortcuts();
  const previewScene: Scene = { ...EMPTY_SCENE, input: preview };
  const live = preview && (preview.deviceId === input?.deviceId || preview.deviceId === streamId);
  const previewMonitor = (
    <BusMonitor
      scene={previewScene}
      tone="preview"
      label={t('switcher.preview')}
      name={preview?.label ?? null}
      empty={t('switcher.previewEmpty')}
      height={monitorHeight}
      clickToFollow={controlMode && !!preview && !live}
    />
  );
  if (monitorsOnly)
    return (
      <section
        aria-label={t('switcher.title')}
        className="flex shrink-0 items-center justify-center gap-4 border-b border-[var(--divider)] bg-[var(--surface-1)] px-4 py-3"
      >
        {previewMonitor}
        <ProgramMonitors height={monitorHeight} side />
      </section>
    );
  const transition = settings.transition;
  const setTransition = (patch: Partial<InputTransition>): void =>
    void saveSettings({ switcher: { ...settings, transition: { ...transition, ...patch } } });
  const duration = (
    <TransitionLength
      value={transition.durationMs}
      onChange={(durationMs) => setTransition({ durationMs })}
    />
  );
  const pipCamera = <PipSelect devices={devices} />;
  return (
    <section
      aria-label={t('switcher.title')}
      className={`flex shrink-0 items-stretch border-b border-[var(--divider)] bg-[var(--surface-1)] px-4 py-3 ${stacked ? 'flex-col gap-3' : 'gap-5'}`}
    >
      {/* Preview → take → Program, left to right: the way a camera travels to the screen. */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {previewMonitor}
        <div
          className="flex w-[124px] shrink-0 gap-2"
          style={{ height: Math.max(MIN_TAKE_HEIGHT, monitorHeight) }}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="!h-auto flex-1"
              disabled={!canTake}
              onClick={() => void cut()}
              title={t('shortcuts.action.switcherCut')}
            >
              {t('switcher.cut')}
              <Kbd>{displayCombo(keys.switcherCut)}</Kbd>
            </Button>
            <Button
              size="sm"
              variant="live"
              className="!h-auto flex-1"
              disabled={!canTake}
              onClick={() => void auto()}
              title={t('shortcuts.action.switcherAuto')}
            >
              {t('switcher.auto')}
              <Kbd tone="onColor">{displayCombo(keys.switcherAuto)}</Kbd>
            </Button>
          </div>
          <TBar disabled={!canTake} />
        </div>
        <ProgramMonitors height={monitorHeight} side={false} />
      </div>
      {/* How Auto and the T-bar mix, the second camera in a corner, and where takes go. */}
      {stacked ? (
        // A narrow pane: one row of three under the monitors, so the cameras keep their room.
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">
            <Select<InputTransition['kind']>
              size="sm"
              aria-label={t('switcher.transition')}
              value={transition.kind}
              onChange={(kind) => setTransition({ kind })}
              options={KINDS.map((k) => ({ value: k, label: t(`switcher.kinds.${k}`) }))}
            />
            {duration}
            {pipCamera}
          </div>
          <TakeTo />
        </div>
      ) : (
        <div className="flex w-[300px] shrink-0 flex-col justify-center gap-2">
          <Segmented<InputTransition['kind']>
            label={t('switcher.transition')}
            value={transition.kind}
            onChange={(kind) => setTransition({ kind })}
            options={KINDS.map((k) => ({ value: k, label: t(`switcher.kinds.${k}`) }))}
          />
          {/* Two rows, so the strip (and the monitors) can be short in a short pane. */}
          <div className="flex gap-3">
            <Row label={t('switcher.duration')}>{duration}</Row>
            <Row label={t('switcher.pip')}>{pipCamera}</Row>
          </div>
          <TakeTo />
        </div>
      )}
    </section>
  );
}

/** The transition's length (Auto and a double-clicked camera). */
export function TransitionLength({
  value,
  onChange,
}: {
  value: number;
  onChange: (ms: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <Select<string>
      size="sm"
      aria-label={t('switcher.duration')}
      value={String(value)}
      onChange={(v) => onChange(Number(v))}
      options={[...new Set([...DURATIONS, value])].map((ms) => ({
        value: String(ms),
        label: t('switcher.seconds', { s: ms / 1000 }),
      }))}
    />
  );
}

/** Picture-in-picture: which camera goes in the corner (or none). */
export function PipSelect({ devices }: { devices: InputDevice[] }) {
  const { t } = useTranslation();
  const pip = useStore((s) => s.live?.program.pip ?? null);
  return (
    <Select<string>
      size="sm"
      aria-label={t('switcher.pipLabel')}
      value={pip?.deviceId ?? OFF}
      onChange={(id) => void setPip(devices.find((d) => d.deviceId === id) ?? null)}
      options={[
        { value: OFF, label: t('switcher.pipOff') },
        ...devices.map((d) => ({ value: d.deviceId, label: d.label })),
      ]}
    />
  );
}

export { KINDS as TRANSITION_KINDS };

/** A labelled control in the switcher's settings column. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Typography size={11} tone="secondary" className="shrink-0">
        {label}
      </Typography>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

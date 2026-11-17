import { useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { EMPTY_SCENE, type InputTransition, type Scene } from '@lampstand/core';
import { Button, Kbd, Segmented, Typography } from '@lampstand/ui';
import { type InputDevice } from '../../lib/inputs';
import { saveSettings } from '../../lib/actions';
import { useStore } from '../../lib/store';
import { auto, cut, setPip, tbar, tbarRelease } from '../../lib/switcher';
import { SceneView } from '../SceneView';
import { Select } from '../Select';

const KINDS: InputTransition['kind'][] = ['cut', 'fade', 'dip', 'wipe'];
const DURATIONS = [300, 600, 1000, 1500, 2000];
const OFF = 'off';

/** One bus monitor (Preview or Program): the camera layer alone, with its tally colour. */
function BusMonitor({
  scene,
  tone,
  label,
  name,
}: {
  scene: Scene;
  tone: 'preview' | 'program';
  label: string;
  name: string | null;
}) {
  const color = tone === 'program' ? 'var(--tally-program)' : 'var(--tally-preview)';
  return (
    <figure className="flex min-w-0 flex-1 flex-col gap-1">
      <div
        className="relative overflow-hidden rounded-[6px] bg-black"
        style={{ boxShadow: `0 0 0 2px ${color}` }}
      >
        <SceneView scene={scene} label={`${label}: ${name ?? '—'}`} />
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
      </div>
      <Typography as="figcaption" size={11} tone="secondary" truncate>
        {name ?? '—'}
      </Typography>
    </figure>
  );
}

/**
 * The T-bar: drag it down to mix the Preview camera over Program by hand. Let go past half-way
 * and the take finishes; before that it goes back. It springs back to the top after each mix.
 */
function TBar({ disabled }: { disabled: boolean }) {
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
      onPointerUp={() => {
        if (disabled) return;
        tbarRelease();
        setPos(0);
      }}
      className={`relative h-full w-8 touch-none rounded-[6px] bg-[var(--surface-0)] shadow-[inset_0_0_0_1px_var(--hairline-strong)] ${disabled ? 'opacity-40' : 'cursor-ns-resize'}`}
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

/**
 * The switcher's control strip (Media › Video input): Preview and Program monitors, Cut and
 * Auto, the transition and its length, the T-bar, and picture-in-picture.
 */
export function SwitcherBar({ devices }: { devices: InputDevice[] }) {
  const { t } = useTranslation();
  const settings = useStore((s) => s.settings?.switcher);
  const preview = useStore((s) => s.live?.switcher.preview ?? null);
  const input = useStore((s) => s.live?.program.input ?? null);
  const inputNext = useStore((s) => s.live?.program.inputNext ?? null);
  const pip = useStore((s) => s.live?.program.pip ?? null);
  if (!settings) return null;
  const transition = settings.transition;
  const setTransition = (patch: Partial<InputTransition>): void =>
    void saveSettings({ switcher: { ...settings, transition: { ...transition, ...patch } } });
  const canTake = !!preview && preview.deviceId !== input?.deviceId;
  const programScene: Scene = { ...EMPTY_SCENE, input, inputNext, pip };
  const previewScene: Scene = { ...EMPTY_SCENE, input: preview };
  return (
    <section
      aria-label={t('switcher.title')}
      className="flex shrink-0 gap-3 border-b border-[var(--divider)] bg-[var(--surface-1)] px-3 py-2.5"
    >
      <div className="flex min-w-0 max-w-[400px] flex-1 gap-3">
        <BusMonitor
          scene={previewScene}
          tone="preview"
          label={t('switcher.preview')}
          name={preview?.label ?? null}
        />
        <BusMonitor
          scene={programScene}
          tone="program"
          label={t('switcher.program')}
          name={input?.label ?? null}
        />
      </div>
      <div className="flex w-[220px] shrink-0 flex-col gap-2">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            disabled={!canTake}
            onClick={() => void cut()}
            title={t('shortcuts.actions.switcherCut')}
          >
            {t('switcher.cut')}
            <Kbd>C</Kbd>
          </Button>
          <Button
            size="sm"
            variant="live"
            className="flex-1"
            disabled={!canTake}
            onClick={() => void auto()}
            title={t('shortcuts.actions.switcherAuto')}
          >
            {t('switcher.auto')}
            <Kbd tone="onColor">T</Kbd>
          </Button>
        </div>
        <Segmented<InputTransition['kind']>
          label={t('switcher.transition')}
          value={transition.kind}
          onChange={(kind) => setTransition({ kind })}
          options={KINDS.map((k) => ({ value: k, label: t(`switcher.kinds.${k}`) }))}
        />
        <div className="flex items-center gap-2">
          <Typography size={11} tone="secondary" className="w-12 shrink-0">
            {t('switcher.duration')}
          </Typography>
          <div className="min-w-0 flex-1">
            <Select<string>
              size="sm"
              aria-label={t('switcher.duration')}
              value={String(transition.durationMs)}
              onChange={(v) => setTransition({ durationMs: Number(v) })}
              options={[...new Set([...DURATIONS, transition.durationMs])].map((ms) => ({
                value: String(ms),
                label: t('switcher.seconds', { s: ms / 1000 }),
              }))}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Typography size={11} tone="secondary" className="w-12 shrink-0">
            {t('switcher.pip')}
          </Typography>
          <div className="min-w-0 flex-1">
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
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1 py-0.5">
        <Typography size={10} tone="muted" caps weight="semibold">
          T-bar
        </Typography>
        <div className="min-h-0 flex-1">
          <TBar disabled={!canTake} />
        </div>
      </div>
    </section>
  );
}

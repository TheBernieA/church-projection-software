import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  AudioLines,
  ChevronDown,
  Film,
  Headphones,
  Lock,
  LockOpen,
  Mic,
  Music,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  formatDb,
  PRESET_IDS,
  type MixerBus,
  type MixerBusId,
  type MixerChannel,
} from '@lampstand/core';
import {
  Button,
  Fader,
  IconButton,
  Meter,
  Slider,
  Switch,
  Typography,
  typographyClass,
} from '@lampstand/ui';
import { useHiddenAudioInputs, useInputDevices } from '../../lib/inputs';
import { onMeters, readDyn, readLoudness, readMeter } from '../../lib/meters';
import { mixerCmd, mixerLive } from '../../lib/mixer';
import { openDialog, useStore } from '../../lib/store';
import { DeferredInput } from '../DeferredControls';
import { Select } from '../Select';
import { ITEM_CLASS, MENU_CLASS } from '../menu';
import { ask } from '../../lib/confirm';
import { eqResponseDb } from './eqResponse';

const KIND_ICON = { tracks: Music, video: Film, input: Mic } as const;

/** What can be open in the editor: a channel, or a bus's own settings. */
type Selection = { channel: string } | { bus: MixerBusId } | null;

/** YouTube and Facebook play streams at about this loudness (LUFS). */
const STREAM_TARGET_LUFS = -14;

/** A meter reading one channel of the room mix, or a whole bus. */
function LevelMeter({
  bus,
  channel,
  label,
  className = 'h-full',
}: {
  bus: MixerBusId;
  channel: string | null;
  label: string;
  className?: string;
}) {
  const read = useCallback(() => readMeter(bus, channel), [bus, channel]);
  return <Meter read={read} subscribe={onMeters} label={label} className={className} />;
}

/**
 * Text that follows the meters without re-rendering React: `text` is asked on every report and
 * written straight to the element (about 15 times a second).
 */
function LiveText({
  text,
  className = '',
}: {
  text: () => { value: string; lit: boolean };
  className?: string;
}) {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const draw = (): void => {
      const t = text();
      if (!el.current) return;
      el.current.textContent = t.value;
      el.current.dataset.lit = t.lit ? 'true' : 'false';
    };
    draw();
    return onMeters(draw);
  }, [text]);
  return <span ref={el} aria-hidden className={className} />;
}

const dbText = (v: number): string => (v > -0.5 ? '0' : `−${Math.abs(v).toFixed(v > -10 ? 1 : 0)}`);

/** On a strip: the compressor's gain reduction and ducking, lit while they act. */
function DynReadout({ c }: { c: MixerChannel }) {
  const { t } = useTranslation();
  const comp = c.comp.on;
  const duck = c.duck.on;
  const text = useCallback(() => {
    const [gr, dk] = readDyn('room', c.id);
    const parts: string[] = [];
    if (comp) parts.push(`${t('mixer.grShort')} ${dbText(gr)}`);
    if (duck) parts.push(`${t('mixer.duckShort')} ${dbText(dk)}`);
    return { value: parts.join(' · ') || ' ', lit: gr < -1 || dk < -1 };
  }, [c.id, comp, duck, t]);
  if (!comp && !duck) return <div className="h-4" />;
  return (
    <LiveText
      text={text}
      className={`block h-4 truncate text-center ${typographyClass({ size: 10, tabular: true })} text-[var(--text-3)] data-[lit=true]:text-[#e8b04b]`}
    />
  );
}

/** A small lit toggle on a strip (Mute, Solo, Room, Stream). */
function StripToggle({
  on,
  onClick,
  label,
  title,
  tone,
  disabled = false,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  title?: string;
  tone: 'mute' | 'solo' | 'route';
  disabled?: boolean;
  children: ReactNode;
}) {
  const lit = {
    mute: 'bg-[var(--tally-program)] text-white',
    solo: 'bg-[#e8b04b] text-[#1c1306]',
    route:
      'bg-[var(--accent-soft)] text-[var(--accent)] shadow-[inset_0_0_0_1px_var(--accent-line)]',
  }[tone];
  return (
    <Button
      variant="bare"
      aria-pressed={on}
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-6 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-[4px] transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 ${typographyClass({ size: 10, weight: 'bold' })} ${on ? lit : 'bg-[var(--surface-3)] text-[var(--text-2)] hover:text-[var(--text-1)]'}`}
    >
      {children}
    </Button>
  );
}

/** The processing a channel has switched on, as the strip's chip says it. */
function processingLabel(c: MixerChannel): string {
  const eq = c.eq.on && (c.eq.low || c.eq.mid || c.eq.high);
  return [c.gate.on && 'GATE', c.hpf && 'LC', eq && 'EQ', c.comp.on && 'COMP', c.duck.on && 'DUCK']
    .filter(Boolean)
    .join(' · ');
}

function ChannelStrip({
  c,
  selected,
  onSelect,
}: {
  c: MixerChannel;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const Icon = KIND_ICON[c.kind];
  const locked = c.locked;
  const set = (patch: Partial<MixerChannel>): void =>
    void mixerCmd({ action: 'channel', id: c.id, patch });
  const processing = processingLabel(c);
  return (
    <section
      aria-label={c.name}
      data-channel={c.id}
      className={`flex w-[96px] shrink-0 flex-col gap-1.5 rounded-[8px] p-1.5 transition-colors ${selected ? 'bg-[var(--surface-3)] shadow-[inset_0_0_0_1px_var(--accent-line)]' : 'bg-[var(--surface-2)]'}`}
    >
      <div className="flex min-w-0 items-center gap-0.5">
        <Button
          variant="bare"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={t('mixer.edit', { name: c.name })}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-[4px] px-1 py-0.5 text-left hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <Icon size={12} className="shrink-0 text-[var(--text-3)]" />
          <Typography
            size={11}
            weight="semibold"
            tone="primary"
            truncate
            className="min-w-0 flex-1"
          >
            {c.name}
          </Typography>
        </Button>
        <Button
          variant="bare"
          aria-pressed={locked}
          aria-label={t(locked ? 'mixer.unlockOf' : 'mixer.lockOf', { name: c.name })}
          title={t(locked ? 'mixer.unlockOf' : 'mixer.lockOf', { name: c.name })}
          onClick={() => set({ locked: !locked })}
          className={`flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${locked ? 'text-[#e8b04b]' : 'text-[var(--text-3)] opacity-60 hover:opacity-100'}`}
        >
          {locked ? <Lock size={11} /> : <LockOpen size={11} />}
        </Button>
      </div>
      <Button
        variant="bare"
        onClick={onSelect}
        title={t('mixer.processing')}
        className={`flex h-5 cursor-pointer items-center justify-center gap-1 truncate rounded-[4px] px-1 ${typographyClass({ size: 10, weight: 'semibold', caps: true })} ${processing ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--surface-1)] text-[var(--text-3)]'}`}
      >
        {processing || t('mixer.flat')}
      </Button>
      <div className="flex gap-1">
        <StripToggle
          tone="mute"
          on={c.mute}
          disabled={locked}
          label={t('mixer.muteOf', { name: c.name })}
          onClick={() => set({ mute: !c.mute })}
        >
          M
        </StripToggle>
        <StripToggle
          tone="solo"
          on={c.solo}
          label={t('mixer.soloOf', { name: c.name })}
          title={t('mixer.soloHelp')}
          onClick={() => set({ solo: !c.solo })}
        >
          S
        </StripToggle>
      </div>
      <div className="flex gap-1">
        <StripToggle
          tone="route"
          on={c.room}
          disabled={locked}
          label={t('mixer.roomOf', { name: c.name })}
          onClick={() => set({ room: !c.room })}
        >
          {t('mixer.roomShort')}
        </StripToggle>
        <StripToggle
          tone="route"
          on={c.stream}
          disabled={locked}
          label={t('mixer.streamOf', { name: c.name })}
          onClick={() => set({ stream: !c.stream })}
        >
          {t('mixer.streamShort')}
        </StripToggle>
      </div>
      <DynReadout c={c} />
      <div className="flex min-h-[90px] flex-1 justify-center gap-1.5">
        <Fader
          value={c.gainDb}
          disabled={locked}
          label={t('mixer.levelOf', { name: c.name })}
          format={formatDb}
          onChange={(gainDb) => mixerLive({ action: 'channel', id: c.id, patch: { gainDb } })}
        />
        <LevelMeter bus="room" channel={c.id} label={t('mixer.meterOf', { name: c.name })} />
      </div>
      <Typography
        size={10}
        tabular
        tone={c.mute ? 'muted' : 'secondary'}
        className="text-center"
        aria-hidden
      >
        {formatDb(c.gainDb)}
      </Typography>
    </section>
  );
}

const luText = (v: number | null | undefined): string =>
  v == null || v < -60 ? '—' : v.toFixed(1);

/**
 * The stream's loudness as platforms measure it: Momentary (400 ms), Short-term (3 s) and
 * Integrated (since the stream window opened), against YouTube's and Facebook's −14 LUFS.
 */
function LoudnessReadout() {
  const { t } = useTranslation();
  const text = useCallback(() => {
    const l = readLoudness('stream');
    const s = l?.shortTerm ?? null;
    return {
      value: `S ${luText(s)}  ·  I ${luText(l?.integrated)}`,
      lit: s !== null && s > STREAM_TARGET_LUFS + 2,
    };
  }, []);
  return (
    <div
      className="flex flex-col items-center gap-0.5"
      title={t('mixer.loudnessHelp', { target: STREAM_TARGET_LUFS })}
    >
      <LiveText
        text={text}
        className={`block w-full truncate text-center ${typographyClass({ size: 10, tabular: true })} text-[var(--text-2)] data-[lit=true]:text-[#e8b04b]`}
      />
      <Typography size={10} tone="muted" caps>
        {t('mixer.lufs', { target: STREAM_TARGET_LUFS })}
      </Typography>
    </div>
  );
}

function BusStrip({
  id,
  bus,
  selected,
  onSelect,
}: {
  id: MixerBusId;
  bus: MixerBus;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const name = t(`mixer.bus.${id}`);
  const streaming = useStore((s) => !!s.stream && s.stream.state !== 'idle');
  return (
    <section
      aria-label={name}
      className={`flex w-[104px] shrink-0 flex-col gap-1.5 rounded-[8px] p-1.5 ${selected ? 'bg-[var(--surface-3)] shadow-[inset_0_0_0_1px_var(--accent-line)]' : 'bg-[var(--surface-2)] shadow-[inset_0_0_0_1px_var(--hairline-strong)]'}`}
    >
      <Button
        variant="bare"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={t('mixer.edit', { name })}
        className="flex cursor-pointer items-center gap-1 rounded-[4px] px-1 py-0.5 text-left hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <AudioLines size={12} className="shrink-0 text-[var(--accent)]" />
        <Typography size={11} weight="bold" tone="primary" caps truncate>
          {name}
        </Typography>
      </Button>
      <Typography size={10} tone="muted" className="h-5 px-1" truncate>
        {id === 'stream' && !streaming
          ? t('mixer.streamIdle')
          : bus.delayMs
            ? t('mixer.delayShort', { ms: bus.delayMs })
            : bus.limiter
              ? t('mixer.limiterAt', { db: bus.ceilingDb })
              : ' '}
      </Typography>
      <div className="flex gap-1">
        <StripToggle
          tone="mute"
          on={bus.mute}
          label={t('mixer.muteOf', { name })}
          onClick={() => void mixerCmd({ action: 'bus', bus: id, patch: { mute: !bus.mute } })}
        >
          M
        </StripToggle>
        <StripToggle
          tone="route"
          on={bus.limiter}
          label={t('mixer.limiterOf', { name })}
          title={t('mixer.limiterHelp', { db: bus.ceilingDb })}
          onClick={() =>
            void mixerCmd({ action: 'bus', bus: id, patch: { limiter: !bus.limiter } })
          }
        >
          LIM
        </StripToggle>
      </div>
      {id === 'stream' ? <LoudnessReadout /> : <div className="h-[30px]" />}
      <div className="flex min-h-[90px] flex-1 justify-center gap-1.5">
        <Fader
          value={bus.gainDb}
          label={t('mixer.levelOf', { name })}
          format={formatDb}
          onChange={(gainDb) => mixerLive({ action: 'bus', bus: id, patch: { gainDb } })}
        />
        <LevelMeter
          bus={id}
          channel={null}
          label={t('mixer.meterOf', { name })}
          className="h-full !w-2.5"
        />
      </div>
      <Typography size={10} tabular tone="secondary" className="text-center" aria-hidden>
        {formatDb(bus.gainDb)}
      </Typography>
    </section>
  );
}

/** A small curve of what the EQ and low cut do (a picture, not exact). */
function EqCurve({ c }: { c: MixerChannel }) {
  const W = 260;
  const H = 64;
  const path = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 80; i++) {
      const f = 20 * Math.pow(1000, i / 80); // 20 Hz … 20 kHz
      const db = eqResponseDb(c, f);
      const x = (i / 80) * W;
      const y = H / 2 - (Math.max(-15, Math.min(15, db)) / 15) * (H / 2 - 4);
      pts.push(`${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [c]);
  const at = (hz: number): number => (Math.log10(hz / 20) / 3) * W;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden
      className="h-16 w-full rounded-[6px] bg-[var(--surface-0)] shadow-[inset_0_0_0_1px_var(--hairline)]"
    >
      {[100, 1000, 10_000].map((hz) => (
        <line key={hz} x1={at(hz)} x2={at(hz)} y1="0" y2={H} stroke="var(--hairline)" />
      ))}
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--hairline-strong)" />
      <path
        d={path}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        opacity={c.eq.on || c.hpf ? 1 : 0.35}
      />
    </svg>
  );
}

/** One labelled control in an editor. */
function EditRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
      <Typography size={11} tone="secondary" truncate>
        {label}
      </Typography>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A section heading with its on/off switch. */
function Section({
  title,
  on,
  onToggle,
  label,
  disabled,
  children,
}: {
  title: string;
  on?: boolean;
  onToggle?: (on: boolean) => void;
  label?: string;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-[var(--hairline)] pt-2.5">
      <div className="flex items-center justify-between">
        <Typography size={11} weight="semibold" tone="primary">
          {title}
        </Typography>
        {onToggle && (
          <Switch label={label ?? title} checked={!!on} disabled={disabled} onChange={onToggle} />
        )}
      </div>
      {children}
    </div>
  );
}

const signedDb = (v: number): string => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} dB`;
const hz = (v: number): string =>
  v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)} kHz` : `${Math.round(v)} Hz`;

/** A frequency slider on a log scale (so 100 Hz and 10 kHz get the same room). */
function FreqSlider({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (hz: number) => void;
}) {
  const toPos = (v: number): number => Math.log(v / min) / Math.log(max / min);
  const fromPos = (p: number): number => {
    const v = min * Math.pow(max / min, p);
    return v >= 1000 ? Math.round(v / 50) * 50 : Math.round(v / 5) * 5;
  };
  return (
    <Slider
      aria-label={label}
      min={0}
      max={1}
      step={0.005}
      value={toPos(value)}
      disabled={disabled}
      format={() => hz(value)}
      onChange={(e) => onChange(Math.min(max, Math.max(min, fromPos(Number(e.target.value)))))}
    />
  );
}

/** The compressor's gain reduction as a bar that grows down from 0 (up to −20 dB). */
function ReductionBar({ id }: { id: string }) {
  const bar = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const draw = (): void => {
      const gr = readDyn('room', id)[0];
      if (bar.current) bar.current.style.width = `${Math.min(100, (-gr / 20) * 100)}%`;
      if (label.current) label.current.textContent = `${dbText(gr)} dB`;
    };
    draw();
    return onMeters(draw);
  }, [id]);
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-0)] shadow-[inset_0_0_0_1px_var(--hairline)]">
        <span ref={bar} className="absolute inset-y-0 right-0 bg-[#e8b04b]" />
      </div>
      <Typography ref={label} size={10} tabular tone="secondary" className="w-12 text-right" />
    </div>
  );
}

/** Pick a preset for a channel's processing. */
function PresetMenu({ c }: { c: MixerChannel }) {
  const { t } = useTranslation();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={c.locked}>
        <Button size="xs" variant="secondary" icon={<ChevronDown size={12} />}>
          {t('mixer.preset')}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} className={MENU_CLASS}>
          {PRESET_IDS.map((p) => (
            <DropdownMenu.Item
              key={p}
              className={ITEM_CLASS}
              onSelect={() => void mixerCmd({ action: 'preset', id: c.id, preset: p })}
            >
              <span className="flex flex-col">
                <span>{t(`mixer.presets.${p}`)}</span>
                <Typography size={11} tone="muted">
                  {t(`mixer.presets.${p}Help`)}
                </Typography>
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * The selected channel, in full: name, device and input (trim, polarity, delay, noise
 * suppression), pan, gate, EQ with low cut, compressor, ducking.
 */
function ChannelEditor({ c, onClose }: { c: MixerChannel; onClose: () => void }) {
  const { t } = useTranslation();
  const hidden = useHiddenAudioInputs();
  // The inputs chosen to show, and always the one this channel uses.
  const devices = useInputDevices('audioinput')?.filter(
    (d) => !hidden.has(d.deviceId) || d.deviceId === c.deviceId,
  );
  const off = c.locked;
  const set = (patch: Parameters<typeof mixerLive>[0]['patch']): void =>
    mixerLive({ action: 'channel', id: c.id, patch });
  const n = { name: c.name };
  return (
    <aside
      aria-label={t('mixer.editorOf', n)}
      className="flex w-[320px] shrink-0 flex-col gap-2.5 overflow-y-auto rounded-[8px] bg-[var(--surface-2)] p-3"
    >
      <div className="flex items-center gap-2">
        <DeferredInput
          aria-label={t('mixer.name')}
          value={c.name}
          maxLength={40}
          disabled={off}
          onCommit={(v) =>
            v.trim() && void mixerCmd({ action: 'channel', id: c.id, patch: { name: v.trim() } })
          }
          className="field !h-7 min-w-0 flex-1"
        />
        {c.kind === 'input' && (
          <IconButton
            size="xs"
            variant="danger"
            disabled={off}
            aria-label={t('mixer.remove', n)}
            onClick={() => {
              onClose();
              void mixerCmd({ action: 'remove', id: c.id });
            }}
          >
            <Trash2 size={13} />
          </IconButton>
        )}
        <IconButton size="xs" aria-label={t('mixer.closeEditor')} onClick={onClose}>
          <X size={13} />
        </IconButton>
      </div>
      <div className="flex items-center gap-2">
        <PresetMenu c={c} />
        <span className="flex-1" />
        <Typography size={11} tone="secondary">
          {t('mixer.lock')}
        </Typography>
        <Switch
          label={t(off ? 'mixer.unlockOf' : 'mixer.lockOf', n)}
          checked={off}
          onChange={(locked) => void mixerCmd({ action: 'channel', id: c.id, patch: { locked } })}
        />
      </div>
      {off && (
        <Typography size={11} tone="muted" leading="snug">
          {t('mixer.lockedHelp')}
        </Typography>
      )}

      <Section title={t('mixer.input')}>
        {c.kind === 'input' && (
          <>
            <EditRow label={t('mixer.device')}>
              <Select<string>
                size="sm"
                aria-label={t('mixer.device')}
                value={c.deviceId}
                onChange={(deviceId) =>
                  void mixerCmd({ action: 'channel', id: c.id, patch: { deviceId } })
                }
                options={(devices ?? []).map((d) => ({ value: d.deviceId, label: d.label }))}
                placeholder={t('mixer.deviceMissing')}
              />
            </EditRow>
            <EditRow label={t('mixer.mono')}>
              <Switch
                label={t('mixer.monoOf', n)}
                checked={c.mono}
                disabled={off}
                onChange={(mono) => set({ mono })}
              />
            </EditRow>
            <EditRow label={t('mixer.denoise')}>
              <Switch
                label={t('mixer.denoiseOf', n)}
                checked={c.denoise}
                disabled={off}
                onChange={(denoise) => set({ denoise })}
              />
            </EditRow>
          </>
        )}
        <EditRow label={t('mixer.trim')}>
          <Slider
            aria-label={t('mixer.trimOf', n)}
            min={-20}
            max={20}
            step={0.5}
            value={c.trimDb}
            disabled={off}
            format={signedDb}
            onChange={(e) => set({ trimDb: Number(e.target.value) })}
            onDoubleClick={() => set({ trimDb: 0 })}
          />
        </EditRow>
        <EditRow label={t('mixer.invert')}>
          <Switch
            label={t('mixer.invertOf', n)}
            checked={c.invert}
            disabled={off}
            onChange={(invert) => set({ invert })}
          />
        </EditRow>
        <EditRow label={t('mixer.syncDelay')}>
          <Slider
            aria-label={t('mixer.syncDelayOf', n)}
            min={0}
            max={1000}
            step={5}
            value={c.delayMs}
            disabled={off}
            format={(v) => `${v} ms`}
            onChange={(e) => set({ delayMs: Number(e.target.value) })}
            onDoubleClick={() => set({ delayMs: 0 })}
          />
        </EditRow>
        <EditRow label={t('mixer.pan')}>
          <Slider
            aria-label={t('mixer.panOf', n)}
            min={-1}
            max={1}
            step={0.05}
            value={c.pan}
            disabled={off}
            format={(v) =>
              Math.abs(v) < 0.025 ? 'C' : `${v < 0 ? 'L' : 'R'}${Math.round(Math.abs(v) * 100)}`
            }
            onChange={(e) => set({ pan: Number(e.target.value) })}
            onDoubleClick={() => set({ pan: 0 })}
          />
        </EditRow>
      </Section>

      <Section
        title={t('mixer.gate')}
        label={t('mixer.gateOf', n)}
        on={c.gate.on}
        disabled={off}
        onToggle={(on) => set({ gate: { on } })}
      >
        {c.gate.on && (
          <EditRow label={t('mixer.threshold')}>
            <Slider
              aria-label={t('mixer.gateThreshold')}
              min={-80}
              max={0}
              step={1}
              value={c.gate.thresholdDb}
              disabled={off}
              format={signedDb}
              onChange={(e) => set({ gate: { thresholdDb: Number(e.target.value) } })}
            />
          </EditRow>
        )}
      </Section>

      <Section
        title={t('mixer.eqTitle')}
        label={t('mixer.eqOnOf', n)}
        on={c.eq.on}
        disabled={off}
        onToggle={(on) => set({ eq: { on } })}
      >
        <EqCurve c={c} />
        <EditRow label={t('mixer.hpf')}>
          <div className="flex items-center gap-2">
            <Switch
              label={t('mixer.hpfOf', { ...n, hz: c.hpfHz })}
              checked={c.hpf}
              disabled={off}
              onChange={(hpf) => set({ hpf })}
            />
            <FreqSlider
              label={t('mixer.hpfFreq')}
              value={c.hpfHz}
              min={20}
              max={400}
              disabled={off || !c.hpf}
              onChange={(hpfHz) => set({ hpfHz })}
            />
          </div>
        </EditRow>
        {c.eq.on && (
          <>
            {(
              [
                ['low', 'lowHz', 40, 500],
                ['mid', 'midHz', 150, 10_000],
                ['high', 'highHz', 1500, 18_000],
              ] as const
            ).map(([band, freq, lo, hi]) => (
              <div key={band} className="flex flex-col gap-1">
                <EditRow label={t(`mixer.eq.${band}`)}>
                  <Slider
                    aria-label={t('mixer.eqOf', { band: t(`mixer.eq.${band}`), name: c.name })}
                    min={-15}
                    max={15}
                    step={0.5}
                    value={c.eq[band]}
                    disabled={off}
                    format={signedDb}
                    onChange={(e) => set({ eq: { [band]: Number(e.target.value) } })}
                    onDoubleClick={() => set({ eq: { [band]: 0 } })}
                  />
                </EditRow>
                <EditRow label="">
                  <FreqSlider
                    label={t('mixer.eqFreqOf', { band: t(`mixer.eq.${band}`) })}
                    value={c.eq[freq]}
                    min={lo}
                    max={hi}
                    disabled={off}
                    onChange={(v) => set({ eq: { [freq]: v } })}
                  />
                </EditRow>
                {band === 'mid' && (
                  <EditRow label={t('mixer.width')}>
                    <Slider
                      aria-label={t('mixer.widthOf')}
                      min={0.3}
                      max={8}
                      step={0.1}
                      value={c.eq.midQ}
                      disabled={off}
                      format={(v) => `Q ${v.toFixed(1)}`}
                      onChange={(e) => set({ eq: { midQ: Number(e.target.value) } })}
                    />
                  </EditRow>
                )}
              </div>
            ))}
          </>
        )}
      </Section>

      <Section
        title={t('mixer.comp')}
        label={t('mixer.compOf', n)}
        on={c.comp.on}
        disabled={off}
        onToggle={(on) => set({ comp: { on } })}
      >
        {c.comp.on && (
          <>
            <ReductionBar id={c.id} />
            <EditRow label={t('mixer.threshold')}>
              <Slider
                aria-label={t('mixer.threshold')}
                min={-60}
                max={0}
                step={1}
                value={c.comp.thresholdDb}
                disabled={off}
                format={signedDb}
                onChange={(e) => set({ comp: { thresholdDb: Number(e.target.value) } })}
              />
            </EditRow>
            <EditRow label={t('mixer.ratio')}>
              <Slider
                aria-label={t('mixer.ratio')}
                min={1}
                max={20}
                step={0.5}
                value={c.comp.ratio}
                disabled={off}
                format={(v) => `${v}:1`}
                onChange={(e) => set({ comp: { ratio: Number(e.target.value) } })}
              />
            </EditRow>
            <EditRow label={t('mixer.attack')}>
              <Slider
                aria-label={t('mixer.attack')}
                min={0.5}
                max={100}
                step={0.5}
                value={c.comp.attackMs}
                disabled={off}
                format={(v) => `${v} ms`}
                onChange={(e) => set({ comp: { attackMs: Number(e.target.value) } })}
              />
            </EditRow>
            <EditRow label={t('mixer.release')}>
              <Slider
                aria-label={t('mixer.release')}
                min={10}
                max={1000}
                step={10}
                value={c.comp.releaseMs}
                disabled={off}
                format={(v) => `${v} ms`}
                onChange={(e) => set({ comp: { releaseMs: Number(e.target.value) } })}
              />
            </EditRow>
            <EditRow label={t('mixer.makeup')}>
              <Slider
                aria-label={t('mixer.makeup')}
                min={0}
                max={24}
                step={0.5}
                value={c.comp.makeupDb}
                disabled={off}
                format={signedDb}
                onChange={(e) => set({ comp: { makeupDb: Number(e.target.value) } })}
              />
            </EditRow>
          </>
        )}
      </Section>

      <Section
        title={t('mixer.ducking')}
        label={t('mixer.duckOf', n)}
        on={c.duck.on}
        disabled={off}
        onToggle={(on) => set({ duck: { on } })}
      >
        <Typography size={11} tone="muted" leading="snug">
          {t('mixer.duckHelp')}
        </Typography>
        {c.duck.on && (
          <>
            <EditRow label={t('mixer.duckAmount')}>
              <Slider
                aria-label={t('mixer.duckAmount')}
                min={3}
                max={40}
                step={1}
                value={c.duck.amountDb}
                disabled={off}
                format={(v) => `−${v} dB`}
                onChange={(e) => set({ duck: { amountDb: Number(e.target.value) } })}
              />
            </EditRow>
            <EditRow label={t('mixer.duckWhen')}>
              <Slider
                aria-label={t('mixer.duckWhen')}
                min={-60}
                max={-10}
                step={1}
                value={c.duck.thresholdDb}
                disabled={off}
                format={signedDb}
                onChange={(e) => set({ duck: { thresholdDb: Number(e.target.value) } })}
              />
            </EditRow>
          </>
        )}
        {c.kind === 'input' && (
          <EditRow label={t('mixer.ducksOthers')}>
            <Switch
              label={t('mixer.ducksOthersOf', n)}
              checked={c.ducksOthers}
              disabled={off}
              onChange={(ducksOthers) => set({ ducksOthers })}
            />
          </EditRow>
        )}
      </Section>
    </aside>
  );
}

/** A bus's own settings: its limiter's ceiling and (stream) the lip-sync delay. */
function BusEditor({ id, bus, onClose }: { id: MixerBusId; bus: MixerBus; onClose: () => void }) {
  const { t } = useTranslation();
  const name = t(`mixer.bus.${id}`);
  const set = (patch: Parameters<typeof mixerLive>[0]['patch']): void =>
    mixerLive({ action: 'bus', bus: id, patch });
  return (
    <aside
      aria-label={t('mixer.editorOf', { name })}
      className="flex w-[300px] shrink-0 flex-col gap-2.5 overflow-y-auto rounded-[8px] bg-[var(--surface-2)] p-3"
    >
      <div className="flex items-center gap-2">
        <Typography size={13} weight="semibold" tone="primary" className="flex-1">
          {name}
        </Typography>
        <IconButton size="xs" aria-label={t('mixer.closeEditor')} onClick={onClose}>
          <X size={13} />
        </IconButton>
      </div>
      <Section
        title={t('mixer.limiter')}
        label={t('mixer.limiterOf', { name })}
        on={bus.limiter}
        onToggle={(limiter) => void mixerCmd({ action: 'bus', bus: id, patch: { limiter } })}
      >
        <Typography size={11} tone="muted" leading="snug">
          {t('mixer.limiterHelp', { db: bus.ceilingDb })}
        </Typography>
        {bus.limiter && (
          <EditRow label={t('mixer.ceiling')}>
            <Slider
              aria-label={t('mixer.ceilingOf', { name })}
              min={-12}
              max={0}
              step={0.5}
              value={bus.ceilingDb}
              format={(v) => `${v} dBFS`}
              onChange={(e) => set({ ceilingDb: Number(e.target.value) })}
              onDoubleClick={() => set({ ceilingDb: -1.5 })}
            />
          </EditRow>
        )}
      </Section>
      <Section title={id === 'stream' ? t('mixer.delay') : t('mixer.roomDelay')}>
        <EditRow label={t('mixer.syncDelay')}>
          <Slider
            aria-label={t('mixer.busDelayOf', { name })}
            min={0}
            max={1000}
            step={10}
            value={bus.delayMs}
            format={(v) => `${v} ms`}
            onChange={(e) => set({ delayMs: Number(e.target.value) })}
            onDoubleClick={() => set({ delayMs: 0 })}
          />
        </EditRow>
      </Section>
      {id === 'stream' && (
        <Section title={t('mixer.loudness')}>
          <Typography size={11} tone="muted" leading="snug">
            {t('mixer.loudnessHelp', { target: STREAM_TARGET_LUFS })}
          </Typography>
          <LoudnessReadout />
        </Section>
      )}
    </aside>
  );
}

/**
 * The Mixer: a sound desk docked under the workspace. Every source — the Audio tab's tracks,
 * video sound and each live input — has a strip (level, mute, solo to headphones, sends to the
 * room and the stream, lock) and its processing (input trim, polarity and delay, gate, EQ,
 * compressor, ducking, presets), and the room and stream mixes have their own master strips
 * (limiter ceiling, delay, and the stream's loudness). Meters read what the room and the stream
 * actually hear.
 */
export function MixerPanel({ height }: { height: number }) {
  const { t } = useTranslation();
  const mixer = useStore((s) => s.live?.mixer ?? null);
  const hidden = useHiddenAudioInputs();
  const devices = useInputDevices('audioinput')?.filter((d) => !hidden.has(d.deviceId)) ?? null;
  const [selected, setSelected] = useState<Selection>(null);
  if (!mixer) return null;
  const soloed = mixer.channels.some((c) => c.solo);
  const current =
    selected && 'channel' in selected
      ? (mixer.channels.find((c) => c.id === selected.channel) ?? null)
      : null;
  const busOpen = selected && 'bus' in selected ? selected.bus : null;
  const used = new Set(mixer.channels.map((c) => c.deviceId));
  const addable = (devices ?? []).filter((d) => !used.has(d.deviceId));
  const toggle = (s: NonNullable<Selection>): void =>
    setSelected((cur) => (JSON.stringify(cur) === JSON.stringify(s) ? null : s));

  return (
    <section
      aria-label={t('mixer.title')}
      className="flex flex-col bg-[var(--surface-1)]"
      style={{ height }}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--hairline)] px-3">
        <AudioLines size={15} className="text-[var(--accent)]" />
        <Typography as="h2" size={13} weight="semibold" tone="primary">
          {t('mixer.title')}
        </Typography>
        <span className="flex-1" />
        {soloed && (
          <Button
            size="xs"
            variant="subtle"
            icon={<Headphones size={13} />}
            onClick={() => void mixerCmd({ action: 'soloClear' })}
            title={t('mixer.soloHelp')}
          >
            {t('mixer.clearSolo')}
          </Button>
        )}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button size="xs" variant="secondary" icon={<Plus size={13} />}>
              {t('mixer.addInput')}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4} className={MENU_CLASS}>
              {addable.length === 0 ? (
                <DropdownMenu.Item disabled className={ITEM_CLASS}>
                  {devices === null ? '…' : t('mixer.noMoreInputs')}
                </DropdownMenu.Item>
              ) : (
                addable.map((d) => (
                  <DropdownMenu.Item
                    key={d.deviceId}
                    className={ITEM_CLASS}
                    onSelect={() =>
                      void mixerCmd({ action: 'add', deviceId: d.deviceId, name: d.label })
                    }
                  >
                    <Mic size={14} />
                    {d.label}
                  </DropdownMenu.Item>
                ))
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <IconButton
          size="xs"
          aria-label={t('mixer.reset')}
          onClick={() =>
            void ask({ message: t('mixer.resetConfirm'), tone: 'danger' }).then(
              (ok) => ok && void mixerCmd({ action: 'reset' }),
            )
          }
        >
          <RotateCcw size={14} />
        </IconButton>
        <IconButton
          size="xs"
          aria-label={t('mixer.settings')}
          onClick={() => openDialog('settings', { settingsPage: 'audio' })}
        >
          <Settings2 size={14} />
        </IconButton>
        <IconButton
          size="xs"
          aria-label={t('mixer.close')}
          onClick={() => useStore.setState({ mixerOpen: false })}
        >
          <X size={14} />
        </IconButton>
      </header>
      <div className="flex min-h-0 flex-1 gap-2 p-2">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {mixer.channels.map((c) => (
            <ChannelStrip
              key={c.id}
              c={c}
              selected={current?.id === c.id}
              onSelect={() => toggle({ channel: c.id })}
            />
          ))}
          {mixer.channels.length < 3 && (
            <div className="flex w-[140px] shrink-0 flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-[var(--hairline-strong)] px-3 text-center">
              <Mic size={18} className="text-[var(--text-3)]" />
              <Typography size={11} tone="muted" leading="snug">
                {t('mixer.addHint')}
              </Typography>
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5 border-l border-[var(--hairline)] pl-2">
          {(['room', 'stream'] as const).map((id) => (
            <BusStrip
              key={id}
              id={id}
              bus={mixer[id]}
              selected={busOpen === id}
              onSelect={() => toggle({ bus: id })}
            />
          ))}
        </div>
        {current && <ChannelEditor c={current} onClose={() => setSelected(null)} />}
        {busOpen && (
          <BusEditor id={busOpen} bus={mixer[busOpen]} onClose={() => setSelected(null)} />
        )}
      </div>
    </section>
  );
}

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  AudioLines,
  Film,
  Headphones,
  Mic,
  Music,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDb, type MixerBus, type MixerBusId, type MixerChannel } from '@lampstand/core';
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
import { useInputDevices } from '../../lib/inputs';
import { onMeters, readMeter } from '../../lib/meters';
import { mixerCmd, mixerLive } from '../../lib/mixer';
import { openDialog, useStore } from '../../lib/store';
import { DeferredInput } from '../DeferredControls';
import { Select } from '../Select';
import { ITEM_CLASS, MENU_CLASS } from '../menu';
import { ask } from '../../lib/confirm';

const KIND_ICON = { tracks: Music, video: Film, input: Mic } as const;

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

/** A small lit toggle on a strip (Mute, Solo, Room, Stream). */
function StripToggle({
  on,
  onClick,
  label,
  title,
  tone,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  title?: string;
  tone: 'mute' | 'solo' | 'route';
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
      onClick={onClick}
      className={`flex h-6 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-[4px] transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${typographyClass({ size: 10, weight: 'bold' })} ${on ? lit : 'bg-[var(--surface-3)] text-[var(--text-2)] hover:text-[var(--text-1)]'}`}
    >
      {children}
    </Button>
  );
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
  const set = (patch: Partial<MixerChannel>): void =>
    void mixerCmd({ action: 'channel', id: c.id, patch });
  const processing = c.hpf || c.comp.on || c.eq.low !== 0 || c.eq.mid !== 0 || c.eq.high !== 0;
  return (
    <section
      aria-label={c.name}
      data-channel={c.id}
      className={`flex w-[92px] shrink-0 flex-col gap-1.5 rounded-[8px] p-1.5 transition-colors ${selected ? 'bg-[var(--surface-3)] shadow-[inset_0_0_0_1px_var(--accent-line)]' : 'bg-[var(--surface-2)]'}`}
    >
      <Button
        variant="bare"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={t('mixer.edit', { name: c.name })}
        className="flex min-w-0 cursor-pointer items-center gap-1 rounded-[4px] px-1 py-0.5 text-left hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <Icon size={12} className="shrink-0 text-[var(--text-3)]" />
        <Typography size={11} weight="semibold" tone="primary" truncate className="min-w-0 flex-1">
          {c.name}
        </Typography>
      </Button>
      <Button
        variant="bare"
        onClick={onSelect}
        title={t('mixer.processing')}
        className={`flex h-5 cursor-pointer items-center justify-center gap-1 rounded-[4px] ${typographyClass({ size: 10, weight: 'semibold', caps: true })} ${processing ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--surface-1)] text-[var(--text-3)]'}`}
      >
        {[c.hpf && 'HPF', (c.eq.low || c.eq.mid || c.eq.high) && 'EQ', c.comp.on && 'COMP']
          .filter(Boolean)
          .join(' · ') || t('mixer.flat')}
      </Button>
      <div className="flex gap-1">
        <StripToggle
          tone="mute"
          on={c.mute}
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
          label={t('mixer.roomOf', { name: c.name })}
          onClick={() => set({ room: !c.room })}
        >
          {t('mixer.roomShort')}
        </StripToggle>
        <StripToggle
          tone="route"
          on={c.stream}
          label={t('mixer.streamOf', { name: c.name })}
          onClick={() => set({ stream: !c.stream })}
        >
          {t('mixer.streamShort')}
        </StripToggle>
      </div>
      <div className="flex min-h-[90px] flex-1 justify-center gap-1.5">
        <Fader
          value={c.gainDb}
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

function BusStrip({ id, bus }: { id: MixerBusId; bus: MixerBus }) {
  const { t } = useTranslation();
  const name = t(`mixer.bus.${id}`);
  const streaming = useStore((s) => !!s.stream && s.stream.state !== 'idle');
  return (
    <section
      aria-label={name}
      className="flex w-[100px] shrink-0 flex-col gap-1.5 rounded-[8px] bg-[var(--surface-2)] p-1.5 shadow-[inset_0_0_0_1px_var(--hairline-strong)]"
    >
      <div className="flex items-center gap-1 px-1 py-0.5">
        <AudioLines size={12} className="shrink-0 text-[var(--accent)]" />
        <Typography size={11} weight="bold" tone="primary" caps truncate>
          {name}
        </Typography>
      </div>
      <Typography size={10} tone="muted" className="h-5 px-1" truncate>
        {id === 'stream' && !streaming
          ? t('mixer.streamIdle')
          : bus.delayMs
            ? t('mixer.delayShort', { ms: bus.delayMs })
            : bus.limiter
              ? t('mixer.limiterOn')
              : ' '}
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
          title={t('mixer.limiterHelp')}
          onClick={() =>
            void mixerCmd({ action: 'bus', bus: id, patch: { limiter: !bus.limiter } })
          }
        >
          LIM
        </StripToggle>
      </div>
      <div className="h-6" />
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

/** A tiny curve of what the EQ and high-pass do (a picture, not exact). */
function EqCurve({ c }: { c: MixerChannel }) {
  const W = 220;
  const H = 56;
  const path = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 60; i++) {
      const f = 20 * Math.pow(1000, i / 60); // 20 Hz … 20 kHz
      const lf = Math.log10(f);
      let db = 0;
      db += c.eq.low / (1 + Math.pow(f / 120, 2));
      db += c.eq.high / (1 + Math.pow(8000 / f, 2));
      db += c.eq.mid * Math.exp(-Math.pow((lf - 3) / 0.35, 2));
      if (c.hpf) db -= 12 * Math.max(0, Math.log2(80 / f));
      const x = (i / 60) * W;
      const y = H / 2 - (Math.max(-15, Math.min(15, db)) / 15) * (H / 2 - 4);
      pts.push(`${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [c.eq.low, c.eq.mid, c.eq.high, c.hpf]);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden
      className="h-14 w-full rounded-[6px] bg-[var(--surface-0)] shadow-[inset_0_0_0_1px_var(--hairline)]"
    >
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--hairline-strong)" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />
    </svg>
  );
}

/** One labelled control in the channel editor. */
function EditRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2">
      <Typography size={11} tone="secondary" truncate>
        {label}
      </Typography>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const signedDb = (v: number): string => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} dB`;

/** The selected channel, in full: name, device, pan, high-pass, EQ, compressor. */
function ChannelEditor({ c, onClose }: { c: MixerChannel; onClose: () => void }) {
  const { t } = useTranslation();
  const devices = useInputDevices('audioinput');
  const set = (patch: Parameters<typeof mixerLive>[0]['patch']): void =>
    mixerLive({ action: 'channel', id: c.id, patch });
  return (
    <aside
      aria-label={t('mixer.editorOf', { name: c.name })}
      className="flex w-[300px] shrink-0 flex-col gap-2.5 overflow-y-auto rounded-[8px] bg-[var(--surface-2)] p-3"
    >
      <div className="flex items-center gap-2">
        <DeferredInput
          aria-label={t('mixer.name')}
          value={c.name}
          maxLength={40}
          onCommit={(v) =>
            v.trim() && void mixerCmd({ action: 'channel', id: c.id, patch: { name: v.trim() } })
          }
          className="field !h-7 min-w-0 flex-1"
        />
        {c.kind === 'input' && (
          <IconButton
            size="xs"
            variant="danger"
            aria-label={t('mixer.remove', { name: c.name })}
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
              label={t('mixer.monoOf', { name: c.name })}
              checked={c.mono}
              onChange={(mono) => set({ mono })}
            />
          </EditRow>
        </>
      )}
      <EditRow label={t('mixer.pan')}>
        <Slider
          aria-label={t('mixer.panOf', { name: c.name })}
          min={-1}
          max={1}
          step={0.05}
          value={c.pan}
          format={(v) =>
            Math.abs(v) < 0.025 ? 'C' : `${v < 0 ? 'L' : 'R'}${Math.round(Math.abs(v) * 100)}`
          }
          onChange={(e) => set({ pan: Number(e.target.value) })}
          onDoubleClick={() => set({ pan: 0 })}
        />
      </EditRow>
      <EqCurve c={c} />
      <EditRow label={t('mixer.hpf')}>
        <Switch
          label={t('mixer.hpfOf', { name: c.name })}
          checked={c.hpf}
          onChange={(hpf) => set({ hpf })}
        />
      </EditRow>
      {(['low', 'mid', 'high'] as const).map((band) => (
        <EditRow key={band} label={t(`mixer.eq.${band}`)}>
          <Slider
            aria-label={t('mixer.eqOf', { band: t(`mixer.eq.${band}`), name: c.name })}
            min={-15}
            max={15}
            step={0.5}
            value={c.eq[band]}
            format={signedDb}
            onChange={(e) => set({ eq: { [band]: Number(e.target.value) } })}
            onDoubleClick={() => set({ eq: { [band]: 0 } })}
          />
        </EditRow>
      ))}
      <div className="mt-1 flex items-center justify-between">
        <Typography size={11} weight="semibold" tone="primary">
          {t('mixer.comp')}
        </Typography>
        <Switch
          label={t('mixer.compOf', { name: c.name })}
          checked={c.comp.on}
          onChange={(on) => set({ comp: { on } })}
        />
      </div>
      {c.comp.on && (
        <>
          <EditRow label={t('mixer.threshold')}>
            <Slider
              aria-label={t('mixer.threshold')}
              min={-60}
              max={0}
              step={1}
              value={c.comp.thresholdDb}
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
              format={(v) => `${v}:1`}
              onChange={(e) => set({ comp: { ratio: Number(e.target.value) } })}
            />
          </EditRow>
          <EditRow label={t('mixer.makeup')}>
            <Slider
              aria-label={t('mixer.makeup')}
              min={0}
              max={24}
              step={0.5}
              value={c.comp.makeupDb}
              format={signedDb}
              onChange={(e) => set({ comp: { makeupDb: Number(e.target.value) } })}
            />
          </EditRow>
        </>
      )}
    </aside>
  );
}

/** Stream lip-sync delay and the room/stream bus details, under the bus strips. */
function StreamDelay({ bus }: { bus: MixerBus }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <Typography size={11} tone="secondary" className="shrink-0">
        {t('mixer.delay')}
      </Typography>
      <Slider
        aria-label={t('mixer.delayOf')}
        min={0}
        max={500}
        step={10}
        value={bus.delayMs}
        format={(v) => `${v} ms`}
        className="w-40"
        onChange={(e) =>
          mixerLive({ action: 'bus', bus: 'stream', patch: { delayMs: Number(e.target.value) } })
        }
      />
    </div>
  );
}

/**
 * The Mixer: a sound desk docked under the workspace. Every source — the Audio tab's tracks,
 * video sound and each live input — has a strip (level, mute, solo to headphones, sends to the
 * room and the stream, and its processing), and the room and stream mixes have their own
 * master strips. Meters read what the room and the stream actually hear.
 */
export function MixerPanel({ height }: { height: number }) {
  const { t } = useTranslation();
  const mixer = useStore((s) => s.live?.mixer ?? null);
  const devices = useInputDevices('audioinput');
  const [selected, setSelected] = useState<string | null>(null);
  if (!mixer) return null;
  const soloed = mixer.channels.some((c) => c.solo);
  const current = mixer.channels.find((c) => c.id === selected) ?? null;
  const used = new Set(mixer.channels.map((c) => c.deviceId));
  const addable = (devices ?? []).filter((d) => !used.has(d.deviceId));

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
        <span className="mx-1 h-5 w-px bg-[var(--hairline)]" />
        <StreamDelay bus={mixer.stream} />
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
              selected={c.id === selected}
              onSelect={() => setSelected(c.id === selected ? null : c.id)}
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
          <BusStrip id="room" bus={mixer.room} />
          <BusStrip id="stream" bus={mixer.stream} />
        </div>
        {current && <ChannelEditor c={current} onClose={() => setSelected(null)} />}
      </div>
    </section>
  );
}

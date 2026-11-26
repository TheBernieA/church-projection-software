import { useCallback, useEffect, useRef, type PointerEvent } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Film,
  Lock,
  LockOpen,
  Mic,
  Music,
  PanelBottom,
  Power,
  SquareArrowOutUpRight,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PRESET_IDS, type MixerChannel } from '@lampstand/core';
import { Button, IconButton, Meter, Segmented, Typography } from '@lampstand/ui';
import {
  closeChannelWindow,
  fitRect,
  MIN_H,
  MIN_W,
  openChannelWindow,
  selectNode,
  setChannelTab,
  setDocked,
  setRect,
  useChannelWindow,
  type ChannelTab,
  type WindowRect,
} from '../../../lib/eqWindow';
import { onMeters, readMeter } from '../../../lib/meters';
import { mixerCmd, mixerLive } from '../../../lib/mixer';
import { useStore } from '../../../lib/store';
import { ITEM_CLASS, MENU_CLASS } from '../../menu';
import { DynamicsView, GrMeter } from './DynamicsView';
import { EqBands } from './EqBands';
import { EqGraph } from './EqGraph';
import { InputView } from './InputView';

const KIND_ICON = { tracks: Music, video: Film, input: Mic } as const;

/** Pick a preset for a channel's processing. */
function PresetMenu({ c }: { c: MixerChannel }) {
  const { t } = useTranslation();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={c.locked}>
        <Button size="2xs" variant="subtle" icon={<ChevronDown size={12} />}>
          {t('mixer.preset')}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className={MENU_CLASS}>
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

/** Choose which channel the window shows (and step through them with the arrows). */
function ChannelPicker({ c, channels }: { c: MixerChannel; channels: MixerChannel[] }) {
  const { t } = useTranslation();
  const Icon = KIND_ICON[c.kind];
  const i = channels.findIndex((x) => x.id === c.id);
  const step = (d: number): void => {
    const next = channels[(i + d + channels.length) % channels.length];
    if (next) openChannelWindow(next.id);
  };
  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <IconButton size="xs" aria-label={t('mixer.eqw.previous')} onClick={() => step(-1)}>
        <ChevronLeft size={14} />
      </IconButton>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button
            variant="bare"
            aria-label={t('mixer.eqw.pickChannel')}
            className="flex h-7 min-w-0 max-w-[220px] items-center gap-1.5 rounded-[var(--radius-control)] px-2 hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <Icon size={13} className="shrink-0 text-[var(--accent)]" />
            <Typography size={13} weight="semibold" tone="primary" truncate>
              {c.name}
            </Typography>
            <ChevronDown size={12} className="shrink-0 text-[var(--text-3)]" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={4} className={MENU_CLASS}>
            {channels.map((x) => {
              const XIcon = KIND_ICON[x.kind];
              return (
                <DropdownMenu.Item
                  key={x.id}
                  className={ITEM_CLASS}
                  onSelect={() => openChannelWindow(x.id)}
                >
                  <XIcon size={14} />
                  {x.name}
                </DropdownMenu.Item>
              );
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <IconButton size="xs" aria-label={t('mixer.eqw.next')} onClick={() => step(1)}>
        <ChevronRight size={14} />
      </IconButton>
    </div>
  );
}

/** The channel's level (after its fader) beside the window's content. */
function SideMeters({ c }: { c: MixerChannel }) {
  const { t } = useTranslation();
  const read = useCallback(() => readMeter('room', c.id), [c.id]);
  return (
    <div className="flex shrink-0 items-start gap-2.5 border-l border-[var(--hairline)] pl-3">
      <div className="flex flex-col items-center gap-1">
        <Meter
          read={read}
          subscribe={onMeters}
          label={t('mixer.meterOf', { name: c.name })}
          className="h-[110px] !w-2.5"
        />
        <Typography size={10} weight="semibold" tone="muted" caps>
          {t('mixer.eqw.out')}
        </Typography>
      </div>
      {c.comp.on && <GrMeter id={c.id} />}
    </div>
  );
}

/**
 * The channel window: one channel's processing on a large screen. EQ (a graph to drag, over a
 * live spectrum), Dynamics (gate, compressor, ducking) and Input. It floats over everything,
 * moved by its header and resized from its corner, or docks into the Mixer.
 */
export function ChannelWindow({ mode }: { mode: 'floating' | 'docked' }) {
  const { t } = useTranslation();
  const channelId = useChannelWindow((s) => s.channel);
  const tab = useChannelWindow((s) => s.tab);
  const node = useChannelWindow((s) => s.node);
  const rect = useChannelWindow((s) => s.rect);
  const mixer = useStore((s) => s.live?.mixer ?? null);
  const root = useRef<HTMLElement>(null);
  const move = useRef<{ x: number; y: number; r: WindowRect; kind: 'move' | 'size' } | null>(null);
  const floating = mode === 'floating';

  // Keep the floating window on screen when the control window is resized.
  useEffect(() => {
    if (!floating) return;
    const fit = (): void => {
      const r = useChannelWindow.getState().rect;
      const next = fitRect(r, window.innerWidth, window.innerHeight);
      if (JSON.stringify(next) !== JSON.stringify(r)) setRect(next, false);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [floating]);

  const c = mixer?.channels.find((x) => x.id === channelId) ?? null;
  // The channel was removed: close.
  useEffect(() => {
    if (mixer && channelId && !c) closeChannelWindow();
  }, [mixer, channelId, c]);
  if (!mixer || !c) return null;

  const startMove = (kind: 'move' | 'size', e: PointerEvent<HTMLElement>): void => {
    if (!floating || e.button !== 0) return;
    // Controls in the header keep their clicks.
    if (
      kind === 'move' &&
      (e.target as Element).closest('button,[role="radio"],[role="slider"],input')
    )
      return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    move.current = { x: e.clientX, y: e.clientY, r: useChannelWindow.getState().rect, kind };
  };
  const onMove = (e: PointerEvent<HTMLElement>): void => {
    const m = move.current;
    if (!m) return;
    const dx = e.clientX - m.x;
    const dy = e.clientY - m.y;
    const next =
      m.kind === 'move'
        ? { ...m.r, x: m.r.x + dx, y: m.r.y + dy }
        : { ...m.r, w: Math.max(MIN_W, m.r.w + dx), h: Math.max(MIN_H, m.r.h + dy) };
    setRect(fitRect(next, window.innerWidth, window.innerHeight), false);
  };
  const endMove = (): void => {
    if (!move.current) return;
    move.current = null;
    setRect(useChannelWindow.getState().rect);
  };

  const off = c.locked;
  const n = { name: c.name };
  return (
    <section
      ref={root}
      aria-label={t('mixer.eqw.title', n)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && floating) closeChannelWindow();
      }}
      className={
        floating
          ? 'fixed z-40 flex flex-col overflow-hidden rounded-[var(--radius-xl)] bg-[var(--surface-2)] shadow-[var(--shadow-3)] animate-[ls-pop_140ms_ease-out]'
          : 'flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface-2)] shadow-[inset_0_0_0_1px_var(--hairline)]'
      }
      style={floating ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h } : undefined}
    >
      <header
        onPointerDown={(e) => startMove('move', e)}
        onPointerMove={onMove}
        onPointerUp={endMove}
        onPointerCancel={endMove}
        onDoubleClick={(e) => {
          if (!(e.target as Element).closest('button,[role="radio"]')) setDocked(floating);
        }}
        className={`flex h-11 shrink-0 items-center gap-2 border-b border-[var(--hairline)] bg-[var(--surface-1)] px-2 ${floating ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        <ChannelPicker c={c} channels={mixer.channels} />
        <span className="flex-1" />
        <Segmented<ChannelTab>
          label={t('mixer.eqw.tabs')}
          value={tab}
          options={[
            { value: 'eq', label: t('mixer.eqw.tab.eq') },
            { value: 'dynamics', label: t('mixer.eqw.tab.dynamics') },
            { value: 'input', label: t('mixer.eqw.tab.input') },
          ]}
          onChange={setChannelTab}
        />
        <span className="flex-1" />
        {tab === 'eq' && (
          <Button
            size="2xs"
            variant="bare"
            aria-pressed={!c.eq.on}
            disabled={off}
            title={t('mixer.eqw.bypassHelp')}
            onClick={() =>
              mixerLive({ action: 'channel', id: c.id, patch: { eq: { on: !c.eq.on } } })
            }
            className={`flex h-6 items-center gap-1 rounded-[var(--radius-sm)] px-2 transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-40 ${c.eq.on ? 'bg-[var(--surface-3)] text-[var(--text-2)] hover:text-[var(--text-1)]' : 'bg-[#e8b04b] text-[#1c1306]'}`}
          >
            <Power size={12} />
            <Typography size={11} weight="semibold" tone="inherit">
              {t('mixer.eqw.bypass')}
            </Typography>
          </Button>
        )}
        <PresetMenu c={c} />
        <IconButton
          size="xs"
          aria-pressed={off}
          aria-label={t(off ? 'mixer.unlockOf' : 'mixer.lockOf', n)}
          onClick={() => void mixerCmd({ action: 'channel', id: c.id, patch: { locked: !off } })}
          className={off ? '!text-[#e8b04b]' : ''}
        >
          {off ? <Lock size={13} /> : <LockOpen size={13} />}
        </IconButton>
        <span className="mx-0.5 h-5 w-px bg-[var(--hairline-strong)]" />
        <IconButton
          size="xs"
          aria-label={floating ? t('mixer.eqw.dock') : t('mixer.eqw.float')}
          title={floating ? t('mixer.eqw.dock') : t('mixer.eqw.float')}
          onClick={() => setDocked(floating)}
        >
          {floating ? <PanelBottom size={14} /> : <SquareArrowOutUpRight size={14} />}
        </IconButton>
        <IconButton size="xs" aria-label={t('mixer.eqw.close')} onClick={closeChannelWindow}>
          <X size={14} />
        </IconButton>
      </header>

      {off && (
        <div className="shrink-0 bg-[rgba(232,176,75,0.1)] px-3 py-1.5">
          <Typography size={11} tone="secondary">
            {t('mixer.lockedHelp')}
          </Typography>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3 overflow-auto p-3">
        {tab === 'eq' && (
          <div
            className={`flex min-h-0 min-w-0 flex-1 gap-3 ${floating ? 'flex-col' : 'flex-row'}`}
          >
            <div className="min-h-[120px] min-w-0 flex-1">
              <EqGraph c={c} node={node} onSelect={selectNode} disabled={off} />
            </div>
            <EqBands c={c} node={node} onSelect={selectNode} compact={!floating} />
          </div>
        )}
        {tab === 'dynamics' && <DynamicsView c={c} />}
        {tab === 'input' && <InputView c={c} />}
        <SideMeters c={c} />
      </div>

      {floating && (
        <div
          aria-hidden
          onPointerDown={(e) => startMove('size', e)}
          onPointerMove={onMove}
          onPointerUp={endMove}
          onPointerCancel={endMove}
          className="absolute bottom-0 right-0 size-4 cursor-nwse-resize"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" className="text-[var(--text-3)]">
            <path d="M12 6 6 12M12 10l-2 2" stroke="currentColor" strokeWidth="1.25" fill="none" />
          </svg>
        </div>
      )}
    </section>
  );
}

/** The floating window, wherever the Mixer is (mounted once in the app). */
export function FloatingChannelWindow() {
  const open = useChannelWindow((s) => !!s.channel && !s.docked);
  return open ? <ChannelWindow mode="floating" /> : null;
}

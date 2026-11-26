import { create } from 'zustand';
import type { NodeId } from '../components/mixer/eq/eqGeometry';
import { cmd } from './api';
import { remember, remembered } from './prefs';
import { useStore } from './store';

/**
 * The channel window: a channel's processing (EQ, dynamics, input) on a large screen of its
 * own. It floats over the workspace (moved and resized freely) or docks into the Mixer; where
 * it was, its size and the tab last used are remembered on this computer.
 */

export type ChannelTab = 'eq' | 'dynamics' | 'input' | 'presets' | 'desk';
export const CHANNEL_TABS: readonly ChannelTab[] = ['eq', 'dynamics', 'input', 'presets', 'desk'];

/** Where the floating window sits, in CSS px of the control window. */
export interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_W = 620;
export const MIN_H = 400;
const DEFAULT_RECT: WindowRect = { x: 120, y: 90, w: 920, h: 560 };

interface ChannelWindowState {
  /** The channel shown, or null when closed. */
  channel: string | null;
  tab: ChannelTab;
  docked: boolean;
  rect: WindowRect;
  /** The EQ node being edited. */
  node: NodeId;
}

function readRect(): WindowRect {
  try {
    const v = JSON.parse(remembered('lampstand.channelWindow.rect') ?? 'null') as unknown;
    if (v && typeof v === 'object') {
      const r = v as Record<string, unknown>;
      const n = (k: keyof WindowRect): number | null =>
        typeof r[k] === 'number' && Number.isFinite(r[k]) ? r[k] : null;
      const [x, y, w, h] = [n('x'), n('y'), n('w'), n('h')];
      if (x !== null && y !== null && w !== null && h !== null) return { x, y, w, h };
    }
  } catch {
    // A bad value: start from the default.
  }
  return DEFAULT_RECT;
}

function readTab(): ChannelTab {
  const t = remembered('lampstand.channelWindow.tab');
  return CHANNEL_TABS.find((x) => x === t) ?? 'eq';
}

export const useChannelWindow = create<ChannelWindowState>()(() => ({
  channel: null,
  tab: readTab(),
  docked: remembered('lampstand.channelWindow.docked') === '1',
  rect: readRect(),
  node: 2,
}));

/** Open a channel's window (on the tab last used), or close it if it's already showing. */
export function toggleChannelWindow(channel: string): void {
  const s = useChannelWindow.getState();
  useChannelWindow.setState({ channel: s.channel === channel ? null : channel });
}

export function openChannelWindow(channel: string, tab?: ChannelTab): void {
  useChannelWindow.setState({ channel, ...(tab ? { tab } : {}) });
  if (tab) remember('lampstand.channelWindow.tab', tab);
  // Docked, it lives in the Mixer: show the Mixer.
  if (useChannelWindow.getState().docked) useStore.setState({ mixerOpen: true });
}

export const closeChannelWindow = (): void => useChannelWindow.setState({ channel: null });

export function setChannelTab(tab: ChannelTab): void {
  useChannelWindow.setState({ tab });
  remember('lampstand.channelWindow.tab', tab);
}

/** Dock the window into the Mixer, or float it over the workspace again. */
export function setDocked(docked: boolean): void {
  useChannelWindow.setState({ docked });
  remember('lampstand.channelWindow.docked', docked ? '1' : '0');
  if (docked) useStore.setState({ mixerOpen: true });
}

/** Keep a floating window's rectangle inside the page (some of its header always reachable). */
export function fitRect(r: WindowRect, vw: number, vh: number): WindowRect {
  const w = Math.max(MIN_W, Math.min(r.w, vw - 16));
  const h = Math.max(MIN_H, Math.min(r.h, vh - 16));
  return {
    w,
    h,
    x: Math.round(Math.min(Math.max(r.x, 8 - w + 160), vw - 160)),
    y: Math.round(Math.min(Math.max(r.y, 8), vh - 48)),
  };
}

export function setRect(rect: WindowRect, save = true): void {
  useChannelWindow.setState({ rect });
  if (save) remember('lampstand.channelWindow.rect', JSON.stringify(rect));
}

export const selectNode = (node: NodeId): void => useChannelWindow.setState({ node });

/**
 * While the EQ tab shows a channel, the window that plays the room's mix measures that channel's
 * spectrum (and stops when it closes).
 */
export function installChannelScope(): () => void {
  let sent: string | null = null;
  const sync = (): void => {
    const s = useChannelWindow.getState();
    const live = useStore.getState().live;
    // The channel may have been removed.
    const exists = !!s.channel && !!live?.mixer.channels.some((c) => c.id === s.channel);
    const want = exists && s.tab === 'eq' ? s.channel : null;
    if (want === sent || !live) return;
    sent = want;
    void cmd('live.mixerScope', { channel: want }).catch(() => undefined);
  };
  sync();
  const offWindow = useChannelWindow.subscribe(sync);
  const offStore = useStore.subscribe(sync);
  return () => {
    offWindow();
    offStore();
    if (sent) void cmd('live.mixerScope', { channel: null }).catch(() => undefined);
  };
}

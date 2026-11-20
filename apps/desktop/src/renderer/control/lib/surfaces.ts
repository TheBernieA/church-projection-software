import { useSyncExternalStore } from 'react';
import {
  controlKey,
  encodeMidi,
  muteFromValue,
  muteToValue,
  oscToSurface,
  parseMidi,
  PressDetector,
  sameControl,
  type DeskEvent,
  type DeskMessage,
  type LiveState,
  type Mixer,
  type MixerTarget,
  type SurfaceBinding,
  type SurfaceMessage,
  type SurfaceSource,
  type SurfacesSettings,
} from '@lampstand/core';
import { dbToTravel, travelToDb } from '@lampstand/ui';
import { api } from './api';
import { mixerCmd, mixerLive } from './mixer';
import { runShowAction } from './shortcuts';
import { useStore } from './store';
import { previewSource, switcherSource, take, tbar, tbarRelease } from './switcher';

/**
 * Control surfaces (Settings › Control surfaces): a desk or controller drives the show over MIDI
 * or OSC, and Lampstand tells the desk what's happening. One engine for both protocols: every
 * message becomes a SurfaceMessage, matched against the operator's bindings.
 *
 * Kept light on the hot path: a fader sends up to a few hundred messages a second, so bindings
 * are looked up by control (an index rebuilt only when they change), mixer moves go through
 * `mixerLive` (sent at most every 40 ms) and the T-bar through `tbar` (likewise).
 */

// ---------- What the settings page shows (ports, activity, learning) ----------

interface SurfacePorts {
  /** MIDI is available on this computer (and allowed). */
  midi: 'off' | 'starting' | 'ready' | 'unavailable';
  inputs: string[];
  outputs: string[];
  /** The last control that moved, for the activity light ("CC 7 · ch 1"). */
  last: { source: SurfaceSource; value: number; at: number } | null;
}

let ports: SurfacePorts = { midi: 'off', inputs: [], outputs: [], last: null };
const listeners = new Set<() => void>();
function setPorts(p: Partial<SurfacePorts>): void {
  ports = { ...ports, ...p };
  for (const l of listeners) l();
}
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useSurfacePorts = (): SurfacePorts => useSyncExternalStore(subscribe, () => ports);

let learner: ((s: SurfaceSource) => void) | null = null;
/**
 * The next control moved (a fader, a key, a button) is handed to `done` instead of acting, so
 * the operator can teach Lampstand a control by touching it. Returns a cancel.
 */
export function learnControl(done: (s: SurfaceSource) => void): () => void {
  learner = done;
  return () => {
    if (learner === done) learner = null;
  };
}

// ---------- Incoming ----------

const surfaces = (): SurfacesSettings | undefined => useStore.getState().settings?.surfaces;

let presses = new PressDetector();
/** When each binding last moved Lampstand (feedback leaves it alone for a moment: no fight). */
const touched = new Map<string, number>();
/** Where each bound fader and mute was last sent, so only changes go out. */
const sentFeedback = new Map<string, number>();

/** The bindings changed: forget what was known about the old ones. */
function bindingsChanged(): void {
  presses = new PressDetector();
  touched.clear();
  sentFeedback.clear();
}
const TOUCH_HOLD_MS = 400;

/** The T-bar's travel: a hardware bar goes top to bottom for one take, then back for the next. */
let tbarFrom: 0 | 1 = 0;
let tbarMoving = false;

/** The fader and mute a target points at (a channel, or a master), or null when it's gone. */
const strip = (m: Mixer, t: MixerTarget): { gainDb: number; mute: boolean } | null =>
  t.bus === 'channel' ? (m.channels.find((c) => c.id === t.channelId) ?? null) : m[t.bus];

/** A fader move (live: sent at most every 40 ms) or a mute (sent at once). */
function setMixer(t: MixerTarget, patch: { gainDb?: number; mute?: boolean }, live: boolean): void {
  if (t.bus === 'channel' && !t.channelId) return;
  const a =
    t.bus === 'channel'
      ? { action: 'channel' as const, id: t.channelId ?? '', patch }
      : { action: 'bus' as const, bus: t.bus, patch };
  if (live) mixerLive(a);
  else void mixerCmd(a);
}

function run(b: SurfaceBinding, m: SurfaceMessage): void {
  const t = b.target;
  switch (t.kind) {
    case 'action':
      if (presses.press(b.id, m)) runShowAction(t.action);
      return;
    case 'camera': {
      if (!presses.press(b.id, m)) return;
      const device = switcherSource(t.n);
      if (device) void (t.take ? take(device, true, 'shortcut') : previewSource(device));
      return;
    }
    case 'fader': {
      if (m.trigger) return;
      touched.set(b.id, performance.now());
      setMixer(t, { gainDb: travelToDb(m.value) }, true);
      return;
    }
    case 'mute': {
      const mixer = useStore.getState().live?.mixer;
      const muted = mixer ? strip(mixer, t)?.mute : undefined;
      if (muted === undefined) return;
      // A switch says what it should be; a button flips it on each press.
      const wanted = m.trigger ? null : muteFromValue(t.mode, m.value);
      const next = wanted ?? (presses.press(b.id, m) ? !muted : muted);
      if (next === muted) return;
      touched.set(b.id, performance.now());
      setMixer(t, { mute: next }, false);
      return;
    }
    case 'tbar': {
      if (m.trigger) return;
      const progress = tbarFrom === 0 ? m.value : 1 - m.value;
      if (progress >= 0.98) {
        if (!tbarMoving) return; // resting at the end of the last take
        tbar(1);
        tbarRelease();
        tbarMoving = false;
        tbarFrom = tbarFrom === 0 ? 1 : 0;
        return;
      }
      if (progress <= 0.02) {
        // Pulled back to where it started: the take is called off.
        if (tbarMoving) {
          tbar(0);
          tbarRelease();
        }
        tbarMoving = false;
        return;
      }
      tbarMoving = true;
      tbar(progress);
      return;
    }
  }
}

/** Every message from MIDI and OSC lands here. */
export function handleSurfaceMessage(m: SurfaceMessage): void {
  const at = performance.now();
  // The activity light: at most ~10 updates a second, however fast a fader moves.
  if (!ports.last || at - ports.last.at > 100 || !sameControl(ports.last.source, m.source))
    setPorts({ last: { source: m.source, value: m.value, at } });
  if (learner) {
    // A release (a key let go) isn't the control being taught: wait for a real touch.
    if (m.trigger || m.value > 0 || m.source.kind === 'osc') {
      const done = learner;
      learner = null;
      done(m.source);
    }
    return;
  }
  const bindings = surfaces()?.bindings;
  if (!bindings?.length) return;
  for (const b of indexOf(bindings).get(controlKey(m.source)) ?? [])
    if (sameControl(b.source, m.source)) run(b, m);
}

/** The bindings by control, rebuilt only when the bindings change (not per message). */
let indexed: { from: SurfaceBinding[]; by: Map<string, SurfaceBinding[]> } | null = null;
function indexOf(bindings: SurfaceBinding[]): Map<string, SurfaceBinding[]> {
  if (indexed?.from !== bindings) {
    const by = new Map<string, SurfaceBinding[]>();
    for (const b of bindings) {
      const key = controlKey(b.source);
      by.set(key, [...(by.get(key) ?? []), b]);
    }
    indexed = { from: bindings, by };
  }
  return indexed.by;
}

// ---------- Outgoing: feedback and desk cues ----------

let access: MIDIAccess | null = null;

function midiOut(device: string, bytes: number[]): void {
  if (!access) return;
  for (const out of access.outputs.values())
    if (!device || out.name === device) {
      try {
        out.send(bytes);
      } catch {
        // the port went away mid-send
      }
    }
}

/** Send a desk cue (also used by the settings page's Test button). */
export function sendDeskMessage(m: DeskMessage): void {
  if (m.kind === 'midi') midiOut(m.device, encodeMidi(m.type, m.channel, m.number, m.value / 127));
  else api.oscSend(m.address, m.arg.type === 'none' ? [] : [m.arg]);
}

/** A position back to the control it came from (0–1; `onOff` sends OSC as a whole 0 or 1). */
function sendToControl(src: SurfaceSource, value: number, onOff: boolean): void {
  if (src.kind === 'osc')
    api.oscSend(src.address, [onOff ? { type: 'i', value: value ? 1 : 0 } : { type: 'f', value }]);
  // A program change has no position to show.
  else if (src.type !== 'pc')
    midiOut(src.device, encodeMidi(src.type, src.channel, src.number, value));
}

let feedbackLater: ReturnType<typeof setTimeout> | null = null;

/** Motor faders and button lights follow Lampstand's mixer (moved on screen or by a cue). */
function feedback(mixer: Mixer): void {
  const s = surfaces();
  if (!s?.feedback) return;
  const now = performance.now();
  for (const b of s.bindings) {
    const t = b.target;
    if (t.kind !== 'fader' && t.kind !== 'mute') continue;
    const s = strip(mixer, t);
    if (!s) continue;
    const value = t.kind === 'fader' ? dbToTravel(s.gainDb) : muteToValue(t.mode, s.mute);
    if (sentFeedback.get(b.id) === value) continue;
    // The operator's hand is on this one right now: moving it under them would fight. Try
    // again once they let go (the value is only "sent" once it really is).
    if (now - (touched.get(b.id) ?? -Infinity) < TOUCH_HOLD_MS) {
      feedbackLater ??= setTimeout(() => {
        feedbackLater = null;
        const latest = useStore.getState().live?.mixer;
        if (latest) feedback(latest);
      }, TOUCH_HOLD_MS);
      continue;
    }
    sentFeedback.set(b.id, value);
    sendToControl(b.source, value, t.kind === 'mute');
  }
}

/** The moments desk cues listen for, from one live state to the next. */
export function deskEvents(
  before: Pick<LiveState, 'program'> | null,
  after: Pick<LiveState, 'program'>,
): DeskEvent[] {
  const out: DeskEvent[] = [];
  const video = (s: Pick<LiveState, 'program'> | null): boolean =>
    s?.program.media?.kind === 'video' && s.program.media.playing;
  if (video(after) !== video(before)) out.push(video(after) ? 'videoPlay' : 'videoStop');
  const camera = (s: Pick<LiveState, 'program'> | null): boolean => !!s?.program.input;
  if (camera(after) !== camera(before)) out.push(camera(after) ? 'cameraOn' : 'cameraOff');
  if (after.program.masks.black && !before?.program.masks.black) out.push('black');
  const empty = (s: Pick<LiveState, 'program'> | null): boolean =>
    !!s && !s.program.content && !s.program.media && !s.program.input && !s.program.background;
  if (before && empty(after) && !empty(before)) out.push('clearAll');
  return out;
}

function fire(event: DeskEvent): void {
  for (const c of surfaces()?.cues ?? []) if (c.when === event) sendDeskMessage(c.send);
}

// ---------- Starting and stopping ----------

function attachInputs(): void {
  if (!access) return;
  for (const input of access.inputs.values()) {
    const name = input.name ?? '';
    input.onmidimessage = (e) => {
      if (!e.data) return;
      const m = parseMidi(e.data, name);
      if (m) handleSurfaceMessage(m);
    };
  }
  setPorts({
    inputs: [...access.inputs.values()].map((p) => p.name ?? ''),
    outputs: [...access.outputs.values()].map((p) => p.name ?? ''),
  });
}

async function startMidi(): Promise<void> {
  // Only from 'off': a computer that refused (or has no MIDI) isn't asked again on every change
  // of state, only when MIDI is switched off and on again.
  if (ports.midi !== 'off') return;
  if (!('requestMIDIAccess' in navigator)) {
    setPorts({ midi: 'unavailable' });
    return;
  }
  setPorts({ midi: 'starting' });
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
  } catch {
    setPorts({ midi: 'unavailable' });
    return;
  }
  // Turned off while the computer was being asked.
  if (!surfaces()?.midi) {
    stopMidi();
    return;
  }
  access.onstatechange = () => attachInputs();
  attachInputs();
  setPorts({ midi: 'ready' });
}

function stopMidi(): void {
  if (access) {
    for (const input of access.inputs.values()) input.onmidimessage = null;
    access.onstatechange = null;
  }
  access = null;
  setPorts({ midi: 'off', inputs: [], outputs: [] });
}

/** Start listening (from the control window's start-up); returns the stop. */
export function installSurfaces(): () => void {
  const offOsc = api.onOsc((messages) => {
    for (const m of messages) handleSurfaceMessage(oscToSurface(m));
  });
  let streamLive = useStore.getState().stream?.state === 'live';
  const offStore = useStore.subscribe((s, prev) => {
    const midiOn = s.settings?.surfaces.midi;
    if (midiOn && ports.midi === 'off') void startMidi();
    else if (midiOn === false && ports.midi !== 'off') stopMidi();
    if (s.live && s.live !== prev.live) {
      if (s.live.mixer !== prev.live?.mixer) feedback(s.live.mixer);
      if (s.live.program !== prev.live?.program)
        for (const e of deskEvents(prev.live, s.live)) fire(e);
    }
    if (s.settings?.surfaces.bindings !== prev.settings?.surfaces.bindings) {
      // New or changed bindings: send their positions afresh.
      bindingsChanged();
      if (s.live) feedback(s.live.mixer);
    }
    const live = s.stream?.state === 'live';
    if (live !== streamLive) {
      streamLive = live;
      fire(live ? 'streamLive' : 'streamEnd');
    }
  });
  if (useStore.getState().settings?.surfaces.midi) void startMidi();
  return () => {
    offOsc();
    offStore();
    stopMidi();
  };
}

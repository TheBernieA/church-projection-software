import {
  SURFACE_ACTIONS,
  type MidiType,
  type MixerTarget,
  type MuteMode,
  type OscArg,
  type SurfaceBinding,
  type SurfaceSource,
  type SurfaceTarget,
} from './schemas/surfaces';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Control-surface protocols, kept free of any platform: MIDI messages (Web MIDI hands over raw
 * bytes) and OSC packets (UDP datagrams), both reduced to one shape the binding engine matches.
 */

/** One incoming control message, from MIDI or OSC. */
export interface SurfaceMessage {
  source: SurfaceSource;
  /** Where the control is, 0–1 (a fader's travel; a button: 1 pressed, 0 released). */
  value: number;
  /** A button-like message with no position (OSC with no argument, MIDI program change). */
  trigger: boolean;
}

// ---------- MIDI ----------

/**
 * Raw MIDI bytes as a control message (null for anything else: clock, sysex, aftertouch).
 * Note on with velocity 0 is a note off, as the standard says.
 */
export function parseMidi(data: ArrayLike<number>, device = ''): SurfaceMessage | null {
  const status = data[0] ?? 0;
  const kind = status & 0xf0;
  const channel = (status & 0x0f) + 1;
  const a = (data[1] ?? 0) & 0x7f;
  const b = (data[2] ?? 0) & 0x7f;
  const midi = (type: MidiType, number: number): SurfaceSource => ({
    kind: 'midi',
    device,
    type,
    channel,
    number,
  });
  switch (kind) {
    case 0x90:
      return { source: midi('note', a), value: b / 127, trigger: false };
    case 0x80:
      return { source: midi('note', a), value: 0, trigger: false };
    case 0xb0:
      return { source: midi('cc', a), value: b / 127, trigger: false };
    case 0xc0:
      return { source: midi('pc', a), value: 1, trigger: true };
    case 0xe0:
      // 14 bits, low byte first: motor faders (Mackie and HUI style) send their position here.
      return { source: midi('pitch', 0), value: (a | (b << 7)) / 16383, trigger: false };
    default:
      return null;
  }
}

/** A MIDI message's bytes. `value` is 0–1 (to 7 bits, or 14 for pitch bend). */
export function encodeMidi(
  type: MidiType,
  channel: number,
  number: number,
  value: number,
): number[] {
  const ch = (clamp(channel, 1, 16) - 1) & 0x0f;
  const v = clamp(value, 0, 1);
  const n = number & 0x7f;
  switch (type) {
    case 'note':
      return [0x90 | ch, n, Math.round(v * 127)];
    case 'cc':
      return [0xb0 | ch, n, Math.round(v * 127)];
    case 'pc':
      return [0xc0 | ch, n];
    case 'pitch': {
      const x = Math.round(v * 16383);
      return [0xe0 | ch, x & 0x7f, (x >> 7) & 0x7f];
    }
  }
}

// ---------- OSC ----------

export type OscValue = number | string;
export interface OscMessage {
  address: string;
  args: OscValue[];
}

const pad4 = (n: number): number => (n + 3) & ~3;

function oscString(s: string): Uint8Array {
  const bytes = new TextEncoder().encode(s);
  const out = new Uint8Array(pad4(bytes.length + 1));
  out.set(bytes);
  return out;
}

/** An OSC message as a UDP datagram (int32 `i`, float32 `f` and string `s` arguments). */
export function encodeOsc(address: string, args: OscArg[] = []): Uint8Array {
  const typed = args.filter((a) => a.type !== 'none');
  const parts: Uint8Array[] = [
    oscString(address),
    oscString(`,${typed.map((a) => a.type).join('')}`),
  ];
  for (const a of typed) {
    if (a.type === 's') {
      parts.push(oscString(a.value));
      continue;
    }
    const b = new Uint8Array(4);
    const view = new DataView(b.buffer);
    if (a.type === 'i') view.setInt32(0, a.value);
    else view.setFloat32(0, a.value);
    parts.push(b);
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function readString(view: DataView, at: number): [string, number] {
  let end = at;
  while (end < view.byteLength && view.getUint8(end) !== 0) end += 1;
  if (end >= view.byteLength) throw new Error('unterminated OSC string');
  const s = new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset + at, end - at));
  return [s, pad4(end + 1)];
}

/**
 * The messages in an OSC datagram (bundles are opened, their timing ignored: everything is
 * acted on as it arrives). Malformed packets give nothing rather than throwing.
 */
export function decodeOsc(data: Uint8Array): OscMessage[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  try {
    return decodeAt(view, 0, view.byteLength, 0);
  } catch {
    return [];
  }
}

function decodeAt(view: DataView, start: number, end: number, depth: number): OscMessage[] {
  const sub = new DataView(view.buffer, view.byteOffset + start, end - start);
  const [head, after] = readString(sub, 0);
  if (head === '#bundle') {
    if (depth > 4) return [];
    const out: OscMessage[] = [];
    let at = after + 8; // the time tag
    while (at + 4 <= sub.byteLength) {
      const size = sub.getInt32(at);
      at += 4;
      if (size <= 0 || at + size > sub.byteLength) break;
      out.push(...decodeAt(view, start + at, start + at + size, depth + 1));
      at += size;
    }
    return out;
  }
  if (!head.startsWith('/')) return [];
  if (after >= sub.byteLength) return [{ address: head, args: [] }];
  const [tags, first] = readString(sub, after);
  if (!tags.startsWith(',')) return [{ address: head, args: [] }];
  const args: OscValue[] = [];
  let at = first;
  for (const t of tags.slice(1)) {
    if (t === 'i') {
      args.push(sub.getInt32(at));
      at += 4;
    } else if (t === 'f') {
      args.push(sub.getFloat32(at));
      at += 4;
    } else if (t === 's') {
      const [s, next] = readString(sub, at);
      args.push(s);
      at = next;
    } else if (t === 'T') args.push(1);
    else if (t === 'F') args.push(0);
    else if (t === 'd') {
      args.push(sub.getFloat64(at));
      at += 8;
    } else if (t === 'h') {
      args.push(Number(sub.getBigInt64(at)));
      at += 8;
    } else break; // a type we can't size: stop here, keep what we have
  }
  return [{ address: head, args }];
}

/**
 * An OSC message as a control message. Its first number is the position: floats are taken as
 * 0–1 travel (what desks and TouchOSC send for faders), integers as on/off. No argument is a
 * button press.
 */
export function oscToSurface(m: OscMessage): SurfaceMessage {
  const n = m.args.find((a): a is number => typeof a === 'number');
  const source: SurfaceSource = { kind: 'osc', address: m.address };
  if (n === undefined) return { source, value: 1, trigger: true };
  return { source, value: clamp(n, 0, 1), trigger: false };
}

// ---------- Matching ----------

/** The same physical control (a port of '' matches any port). */
export function sameControl(bound: SurfaceSource, got: SurfaceSource): boolean {
  if (bound.kind === 'osc') return got.kind === 'osc' && bound.address === got.address;
  if (got.kind === 'osc') return false;
  return (
    bound.type === got.type &&
    bound.channel === got.channel &&
    (bound.type === 'pitch' || bound.number === got.number) &&
    (!bound.device || !got.device || bound.device === got.device)
  );
}

/**
 * A control's lookup key (its port aside, which `sameControl` checks): bindings are indexed by
 * it, so a fader sending hundreds of messages a second finds its bindings without a search.
 */
export function controlKey(s: SurfaceSource): string {
  if (s.kind === 'osc') return `osc:${s.address}`;
  return `midi:${s.type}:${s.channel}:${s.type === 'pitch' ? 0 : s.number}`;
}

/** What a mute control's position means: muted, or null for a button (it flips on a press). */
export function muteFromValue(mode: MuteMode, value: number): boolean | null {
  if (mode === 'toggle') return null;
  const high = value >= 0.5;
  return mode === 'muted' ? high : !high;
}

/** The position to send a mute control so its light shows the mute. */
export const muteToValue = (mode: MuteMode, muted: boolean): number =>
  (mode === 'on' ? !muted : muted) ? 1 : 0;

/**
 * How a newly learned mute control most likely reports: an OSC address ending in /on (an X32
 * or M32 channel's on switch) is a switch where 1 means on; anything else a button.
 */
export const suggestMuteMode = (s: SurfaceSource): MuteMode =>
  s.kind === 'osc' && /\/on$/i.test(s.address) ? 'on' : 'toggle';

/** A control as people read it: "CC 7 · ch 1", "Note 36 · ch 10", "/ch/01/mix/fader". */
export function describeSource(s: SurfaceSource): string {
  if (s.kind === 'osc') return s.address;
  const what =
    s.type === 'cc'
      ? `CC ${s.number}`
      : s.type === 'note'
        ? `Note ${s.number}`
        : s.type === 'pc'
          ? `Program ${s.number + 1}`
          : 'Pitch bend';
  return `${what} · ch ${s.channel}`;
}

/**
 * Turns a stream of positions into button presses: a press is a rise through the middle (so a
 * button sending 127 then 0 fires once, and a fader nudged near the top doesn't chatter).
 */
export class PressDetector {
  private down = new Map<string, boolean>();

  press(key: string, m: SurfaceMessage): boolean {
    if (m.trigger) return true;
    const was = this.down.get(key) ?? false;
    const is = was ? m.value > 0.4 : m.value >= 0.5;
    this.down.set(key, is);
    return is && !was;
  }
}

// ---------- Targets as one string (the settings page's dropdown) ----------

/** A target as one string: "action:next", "camera:2:take", "fader:channel:tracks", "tbar". */
export function surfaceTargetKey(t: SurfaceTarget): string {
  switch (t.kind) {
    case 'action':
      return `action:${t.action}`;
    case 'camera':
      return `camera:${t.n}:${t.take ? 'take' : 'preview'}`;
    case 'fader':
    case 'mute':
      return t.bus === 'channel' ? `${t.kind}:channel:${t.channelId ?? ''}` : `${t.kind}:${t.bus}`;
    case 'tbar':
      return 'tbar';
  }
}

/**
 * The target for a key (null for one that makes no sense). A mute takes the way `source`
 * most likely reports (a button unless there's a reason to think otherwise).
 */
export function surfaceTargetFromKey(key: string, source?: SurfaceSource): SurfaceTarget | null {
  const [kind = '', a, b] = key.split(':');
  switch (kind) {
    case 'tbar':
      return { kind };
    case 'action': {
      const action = SURFACE_ACTIONS.find((x) => x === a);
      return action ? { kind, action } : null;
    }
    case 'camera': {
      const n = Number(a);
      return Number.isInteger(n) && n >= 1 && n <= 9 ? { kind, n, take: b === 'take' } : null;
    }
    case 'fader':
    case 'mute': {
      const where: MixerTarget | null =
        a === 'room' || a === 'stream'
          ? { bus: a }
          : a === 'channel' && b
            ? { bus: 'channel', channelId: b }
            : null;
      if (!where) return null;
      return kind === 'fader'
        ? { kind, ...where }
        : { kind, ...where, mode: source ? suggestMuteMode(source) : 'toggle' };
    }
    default:
      return null;
  }
}

/** A binding taught a new control (a mute re-guesses how that control reports). */
export const withSource = (b: SurfaceBinding, source: SurfaceSource): SurfaceBinding => ({
  ...b,
  source,
  target: b.target.kind === 'mute' ? { ...b.target, mode: suggestMuteMode(source) } : b.target,
});

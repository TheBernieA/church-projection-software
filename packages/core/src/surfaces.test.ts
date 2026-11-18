import { describe, expect, it } from 'vitest';
import {
  controlKey,
  muteFromValue,
  muteToValue,
  suggestMuteMode,
  decodeOsc,
  describeSource,
  encodeMidi,
  encodeOsc,
  oscToSurface,
  parseMidi,
  PressDetector,
  sameControl,
} from './surfaces';
import { SurfacesSettingsSchema } from './schemas/surfaces';

describe('MIDI', () => {
  it('reads control changes, notes, program changes and pitch bend', () => {
    expect(parseMidi([0xb0, 7, 127], 'Desk')).toEqual({
      source: { kind: 'midi', device: 'Desk', type: 'cc', channel: 1, number: 7 },
      value: 1,
      trigger: false,
    });
    expect(parseMidi([0x99, 36, 100])?.source).toMatchObject({ type: 'note', channel: 10 });
    expect(parseMidi([0x90, 36, 0])?.value).toBe(0); // note on, velocity 0: a note off
    expect(parseMidi([0x80, 36, 64])?.value).toBe(0);
    expect(parseMidi([0xc2, 4])).toMatchObject({
      trigger: true,
      source: { type: 'pc', number: 4 },
    });
    expect(parseMidi([0xe0, 0x7f, 0x7f])?.value).toBe(1);
    expect(parseMidi([0xe0, 0, 0x40])?.value).toBeCloseTo(0.5, 3);
  });

  it('ignores clock, sysex and aftertouch', () => {
    expect(parseMidi([0xf8])).toBeNull();
    expect(parseMidi([0xf0, 1, 2, 0xf7])).toBeNull();
    expect(parseMidi([0xd0, 40])).toBeNull();
  });

  it('writes what it reads', () => {
    for (const bytes of [
      [0xb3, 10, 64],
      [0x95, 60, 127],
      [0xe1, 0x12, 0x34],
    ]) {
      const m = parseMidi(bytes)!;
      const s = m.source as Extract<typeof m.source, { kind: 'midi' }>;
      expect(encodeMidi(s.type, s.channel, s.number, m.value)).toEqual(
        s.type === 'pitch' ? [bytes[0], bytes[1], bytes[2]] : bytes,
      );
    }
    expect(encodeMidi('pc', 1, 5, 1)).toEqual([0xc0, 5]);
  });
});

describe('OSC', () => {
  it('round-trips a message with int, float and string arguments', () => {
    const data = encodeOsc('/ch/01/mix/on', [
      { type: 'i', value: 0 },
      { type: 'f', value: 0.75 },
      { type: 's', value: 'Pulpit' },
    ]);
    expect(data.length % 4).toBe(0);
    expect(decodeOsc(data)).toEqual([{ address: '/ch/01/mix/on', args: [0, 0.75, 'Pulpit'] }]);
  });

  it('opens bundles', () => {
    const a = encodeOsc('/a', [{ type: 'i', value: 1 }]);
    const b = encodeOsc('/b');
    const head = encodeOsc('#bundle').slice(0, 8); // "#bundle\0"
    const parts: Uint8Array[] = [head, new Uint8Array(8)];
    for (const m of [a, b]) {
      const size = new Uint8Array(4);
      new DataView(size.buffer).setInt32(0, m.length);
      parts.push(size, m);
    }
    const bundle = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      bundle.set(p, at);
      at += p.length;
    }
    expect(decodeOsc(bundle)).toEqual([
      { address: '/a', args: [1] },
      { address: '/b', args: [] },
    ]);
  });

  it('gives nothing for junk', () => {
    expect(decodeOsc(new Uint8Array([1, 2, 3]))).toEqual([]);
    expect(decodeOsc(new TextEncoder().encode('/never-terminated'))).toEqual([]);
  });

  it('takes the first number as the position; no argument is a press', () => {
    expect(oscToSurface({ address: '/fader', args: [0.25] }).value).toBe(0.25);
    expect(oscToSurface({ address: '/go', args: [] })).toMatchObject({ trigger: true });
    expect(oscToSurface({ address: '/x', args: ['label', 3] }).value).toBe(1);
  });
});

describe('matching and presses', () => {
  const cc = { kind: 'midi', device: '', type: 'cc', channel: 1, number: 7 } as const;

  it('matches the same control on any port unless one is named', () => {
    expect(sameControl(cc, { ...cc, device: 'X32' })).toBe(true);
    expect(sameControl({ ...cc, device: 'X32' }, { ...cc, device: 'nanoKONTROL' })).toBe(false);
    expect(sameControl(cc, { ...cc, number: 8 })).toBe(false);
    expect(sameControl(cc, { ...cc, channel: 2 })).toBe(false);
    expect(sameControl({ kind: 'osc', address: '/a' }, { kind: 'osc', address: '/a' })).toBe(true);
    expect(sameControl({ kind: 'osc', address: '/a' }, cc)).toBe(false);
  });

  it('fires once per press, not on release or jitter', () => {
    const p = new PressDetector();
    const at = (value: number) => p.press('k', { source: cc, value, trigger: false });
    expect([at(1), at(0.9), at(0), at(0.45), at(0.6), at(0.42), at(0.38), at(0.55)]).toEqual([
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      true,
    ]);
  });

  it('describes controls for people', () => {
    expect(describeSource(cc)).toBe('CC 7 · ch 1');
    expect(describeSource({ ...cc, type: 'pc', number: 0 })).toBe('Program 1 · ch 1');
    expect(describeSource({ kind: 'osc', address: '/ch/01/mix/fader' })).toBe('/ch/01/mix/fader');
  });

  it('has safe defaults', () => {
    expect(SurfacesSettingsSchema.parse({})).toMatchObject({
      midi: true,
      feedback: true,
      osc: { enabled: false, port: 9000 },
      bindings: [],
      cues: [],
    });
  });

  it('keys controls for lookup (pitch bend has no number)', () => {
    expect(controlKey(cc)).toBe('midi:cc:1:7');
    expect(controlKey({ ...cc, type: 'pitch', number: 5 })).toBe('midi:pitch:1:0');
    expect(controlKey({ kind: 'osc', address: '/a' })).toBe('osc:/a');
  });

  it('reads and writes mutes for buttons and both kinds of switch', () => {
    expect(muteFromValue('toggle', 1)).toBeNull();
    expect(muteFromValue('muted', 1)).toBe(true);
    expect(muteFromValue('on', 1)).toBe(false); // an X32 channel switched on: not muted
    expect(muteFromValue('on', 0)).toBe(true);
    expect(muteToValue('on', true)).toBe(0);
    expect(muteToValue('toggle', true)).toBe(1);
    expect(suggestMuteMode({ kind: 'osc', address: '/ch/05/mix/on' })).toBe('on');
    expect(suggestMuteMode(cc)).toBe('toggle');
  });
});

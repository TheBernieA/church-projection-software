import { createSocket, type Socket } from 'node:dgram';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BUILT_IN_DESKS,
  decodeOsc,
  defaultSettings,
  deskReadAddresses,
  encodeOsc,
  type OscValue,
  type Processing,
  type Settings,
} from '@lampstand/core';
import { DeskLink } from './deskLink';

const log = { debug() {}, info() {}, warn() {}, error() {}, child: () => log } as never;
const x32 = BUILT_IN_DESKS[0]!;

/**
 * A pretend X32 on this computer: it keeps whatever it's sent, answers an address with no
 * arguments with its value (to the sender's port, as the desk does), and answers /info.
 */
async function pretendDesk(): Promise<{
  port: number;
  values: Map<string, OscValue>;
  close: () => void;
  heard: string[];
}> {
  const values = new Map<string, OscValue>();
  // A desk has a value everywhere: channels start flat-ish, named "Ch n".
  for (let ch = 1; ch <= 32; ch++) {
    for (const a of deskReadAddresses(x32, ch)) values.set(a, a.endsWith('/type') ? 2 : 0.5);
    values.set(`/ch/${String(ch).padStart(2, '0')}/config/name`, ch === 3 ? 'Pulpit' : '');
  }
  const heard: string[] = [];
  const socket: Socket = createSocket('udp4');
  socket.on('message', (data, from) => {
    for (const m of decodeOsc(new Uint8Array(data))) {
      heard.push(m.address);
      const reply = (address: string, v: OscValue): void => {
        const arg =
          typeof v === 'string'
            ? { type: 's' as const, value: v }
            : Number.isInteger(v) &&
                !address.endsWith('/f') &&
                !address.endsWith('/g') &&
                !address.endsWith('/q')
              ? { type: 'i' as const, value: v }
              : { type: 'f' as const, value: v };
        socket.send(encodeOsc(address, [arg]), from.port, from.address);
      };
      if (m.address === '/info') reply('/info', 'X32 pretend');
      else if (m.args.length === 0) {
        const v = values.get(m.address);
        if (v !== undefined) reply(m.address, v);
      } else if (m.args[0] !== undefined) values.set(m.address, m.args[0]);
    }
  });
  await new Promise<void>((r) => socket.bind(0, '127.0.0.1', r));
  return { port: socket.address().port, values, heard, close: () => socket.close() };
}

const settingsFor = (port: number, enabled = true): Settings => {
  const s = defaultSettings();
  return { ...s, desk: { enabled, profile: x32.id, host: '127.0.0.1', port } };
};

describe('the sound desk link', () => {
  const open: { close: () => void }[] = [];
  afterEach(() => {
    for (const o of open.splice(0)) o.close();
  });

  it('checks the desk answers, sends a channel’s processing, and reads it back', async () => {
    const desk = await pretendDesk();
    const link = new DeskLink({ log, getSettings: () => settingsFor(desk.port) });
    open.push(desk, link);
    expect(await link.status()).toMatchObject({ answering: true, profile: x32.name });

    const p: Processing = {
      eqOn: true,
      filters: [
        { kind: 'lowCut', on: true, hz: 90, db: 0, q: 0.71, slope: 12 },
        { kind: 'bell', on: true, hz: 3000, db: 3, q: 1 },
      ],
      comp: { on: true, thresholdDb: -18, ratio: 4, attackMs: 8, releaseMs: 150, makeupDb: 3 },
    };
    const sent = await link.write(3, p);
    expect(sent.notes).toEqual([]);
    // What was there before came back, for undo.
    expect(sent.previous?.filters.length).toBeGreaterThan(0);
    expect(desk.values.get('/ch/03/preamp/hpon')).toBe(1);

    const back = await link.read(3);
    expect(back.name).toBe('Pulpit');
    expect(back.processing.filters.find((f) => f.kind === 'lowCut')?.hz).toBeCloseTo(90, 0);
    expect(back.processing.filters.find((f) => f.kind === 'bell' && f.db > 1)).toMatchObject({
      hz: expect.closeTo(3000, -1) as number,
    });
    expect(back.processing.comp).toMatchObject({ on: true, ratio: 4 });
  });

  it('lists the desk’s channel names', async () => {
    const desk = await pretendDesk();
    const link = new DeskLink({ log, getSettings: () => settingsFor(desk.port) });
    open.push(desk, link);
    const names = await link.channels();
    expect(names).toHaveLength(32);
    expect(names[2]).toEqual({ channel: 3, name: 'Pulpit' });
    expect(names[0]?.name).toBeNull();
  });

  it('a desk that doesn’t answer, or a link that’s off, says so', async () => {
    const silent = createSocket('udp4');
    await new Promise<void>((r) => silent.bind(0, '127.0.0.1', r));
    const link = new DeskLink({ log, getSettings: () => settingsFor(silent.address().port) });
    open.push({ close: () => silent.close() }, link);
    expect((await link.status()).answering).toBe(false);
    await expect(link.read(1)).rejects.toThrow(/didn’t answer/);
    const off = new DeskLink({ log, getSettings: () => settingsFor(1, false) });
    open.push(off);
    expect((await off.status()).answering).toBeNull();
    await expect(off.read(1)).rejects.toThrow(/off/);
  });
});

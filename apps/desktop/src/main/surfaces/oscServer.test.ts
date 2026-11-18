import { createSocket } from 'node:dgram';
import { afterEach, describe, expect, it } from 'vitest';
import {
  decodeOsc,
  defaultSettings,
  encodeOsc,
  type OscMessage,
  type Settings,
} from '@lampstand/core';
import type { OscStatus } from '@lampstand/ipc-contract';
import { OscServer } from './oscServer';

const log = { info: () => {}, warn: () => {}, error: () => {}, child: () => log } as never;

/** A free UDP port (bound and released). */
async function freePort(): Promise<number> {
  const s = createSocket('udp4');
  await new Promise<void>((r) => s.bind(0, '127.0.0.1', r));
  const { port } = s.address();
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

function settingsWith(osc: Partial<Settings['surfaces']['osc']>): Settings {
  const s = defaultSettings();
  return { ...s, surfaces: { ...s.surfaces, osc: { ...s.surfaces.osc, ...osc } } };
}

const servers: OscServer[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

function start(settings: () => Settings) {
  const got: OscMessage[] = [];
  const statuses: OscStatus[] = [];
  const server = new OscServer({
    log,
    getSettings: settings,
    onMessages: (m) => got.push(...m),
    onStatus: (s) => statuses.push(s),
  });
  servers.push(server);
  server.settingsChanged();
  return { server, got, statuses };
}

const until = async (ok: () => boolean, ms = 2000): Promise<void> => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('OSC server', () => {
  it('listens on its port and hands over what arrives', async () => {
    const port = await freePort();
    const { got, statuses } = start(() => settingsWith({ enabled: true, port }));
    await until(() => statuses.some((s) => s.listening));
    const out = createSocket('udp4');
    out.send(encodeOsc('/lampstand/next'), port, '127.0.0.1');
    out.send(encodeOsc('/ch/01/mix/fader', [{ type: 'f', value: 0.5 }]), port, '127.0.0.1');
    await until(() => got.length === 2);
    out.close();
    expect(got).toEqual([
      { address: '/lampstand/next', args: [] },
      { address: '/ch/01/mix/fader', args: [0.5] },
    ]);
  });

  it('sends to the desk address', async () => {
    const desk = createSocket('udp4');
    const heard: OscMessage[] = [];
    desk.on('message', (d) => heard.push(...decodeOsc(new Uint8Array(d))));
    await new Promise<void>((r) => desk.bind(0, '127.0.0.1', r));
    const { server } = start(() =>
      settingsWith({ enabled: false, sendHost: '127.0.0.1', sendPort: desk.address().port }),
    );
    server.send('/ch/05/mix/on', [{ type: 'i', value: 0 }]);
    await until(() => heard.length === 1);
    desk.close();
    expect(heard).toEqual([{ address: '/ch/05/mix/on', args: [0] }]);
  });

  it('says so when the port is taken, and stops when turned off', async () => {
    const port = await freePort();
    const holder = createSocket({ type: 'udp4', reuseAddr: false });
    await new Promise<void>((r) => holder.bind({ port, exclusive: true }, r));
    let s = settingsWith({ enabled: true, port });
    const { server, statuses } = start(() => s);
    // macOS lets a reuseAddr socket share a port; either it listens or it reports why not.
    await until(() => statuses.length > 0);
    holder.close();
    s = settingsWith({ enabled: false, port });
    server.settingsChanged();
    expect(server.current.listening).toBe(false);
  });

  it('keeps an X32-style subscription, sent from the listening port, so the desk answers there', async () => {
    const port = await freePort();
    const desk = createSocket('udp4');
    const asked: { address: string; from: number }[] = [];
    desk.on('message', (d, from) => {
      for (const m of decodeOsc(new Uint8Array(d))) {
        asked.push({ address: m.address, from: from.port });
        // The desk answers the subscriber's port with a fader move.
        desk.send(
          encodeOsc('/ch/01/mix/fader', [{ type: 'f', value: 0.25 }]),
          from.port,
          '127.0.0.1',
        );
      }
    });
    await new Promise<void>((r) => desk.bind(0, '127.0.0.1', r));
    const { got } = start(() =>
      settingsWith({
        enabled: true,
        port,
        subscribe: true,
        sendHost: '127.0.0.1',
        sendPort: desk.address().port,
      }),
    );
    await until(() => got.length > 0);
    desk.close();
    expect(asked[0]).toEqual({ address: '/xremote', from: port });
    expect(got[0]).toEqual({ address: '/ch/01/mix/fader', args: [0.25] });
  });

  it('hands over a burst as one batch: fader positions merge, presses are all kept', async () => {
    const port = await freePort();
    const batches: OscMessage[][] = [];
    const server = new OscServer({
      log,
      getSettings: () => settingsWith({ enabled: true, port }),
      onMessages: (m) => batches.push(m),
      onStatus: () => {},
    });
    servers.push(server);
    server.settingsChanged();
    await until(() => server.current.listening);
    const out = createSocket('udp4');
    const send = (address: string, args: Parameters<typeof encodeOsc>[1] = []) =>
      new Promise<void>((r) => out.send(encodeOsc(address, args), port, '127.0.0.1', () => r()));
    for (const v of [0.1, 0.2, 0.3]) await send('/fader', [{ type: 'f', value: v }]);
    await send('/go', [{ type: 'i', value: 1 }]);
    await send('/go', [{ type: 'i', value: 0 }]);
    await until(() => batches.flat().length >= 3);
    out.close();
    const all = batches.flat();
    expect(all.filter((m) => m.address === '/go').map((m) => m.args[0])).toEqual([1, 0]);
    expect(all.filter((m) => m.address === '/fader').at(-1)?.args[0]).toBeCloseTo(0.3, 5);
    expect(batches.length).toBeLessThan(5);
  });
});

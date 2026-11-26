import { createServer, type Server } from 'node:net';
import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings, type Settings } from '@lampstand/core';
import { parsePanTilt, parseZoom, splitMessages, udpPacket, visca, ViscaCamera } from './visca';
import { PtzService } from './ptzService';

const log = { debug() {}, info() {}, warn() {}, error() {}, child: () => log } as never;
const hex = (b: readonly number[]) => Buffer.from(b).toString('hex');

async function until(pred: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('VISCA commands', () => {
  it('pan and tilt at a speed, and stop', () => {
    expect(hex(visca.drive(1, 0))).toBe('8101060118010203ff');
    expect(hex(visca.drive(-0.5, 0.5))).toBe('810106010c0a0101ff');
    expect(hex(visca.drive(0, -1))).toBe('8101060101140302ff');
    expect(hex(visca.stop())).toBe('8101060101010303ff');
  });

  it('zoom, presets, home, focus, exposure, white balance', () => {
    expect(hex(visca.zoom(1))).toBe('8101040727ff');
    expect(hex(visca.zoom(-0.3))).toBe('8101040732ff');
    expect(hex(visca.zoom(0))).toBe('8101040700ff');
    expect(hex(visca.recall(3))).toBe('8101043f0203ff');
    expect(hex(visca.store(0))).toBe('8101043f0100ff');
    expect(hex(visca.home())).toBe('81010604ff');
    expect(hex(visca.autoFocus(true))).toBe('8101043802ff');
    expect(hex(visca.focusOnce())).toBe('8101041801ff');
    expect(hex(visca.exposure('manual'))).toBe('8101043903ff');
    expect(hex(visca.gain('up'))).toBe('8101040c02ff');
    expect(hex(visca.iris('down'))).toBe('8101040b03ff');
    expect(hex(visca.whiteBalance('outdoor'))).toBe('8101043502ff');
  });

  it('absolute positions as nibbles, signed pan and tilt', () => {
    expect(hex(visca.goTo(-400, 0x0123, 1))).toBe('810106021814' + '0f0e0700' + '00010203' + 'ff');
    expect(hex(visca.zoomTo(0x4000))).toBe('8101044704000000ff');
    expect(
      parsePanTilt([0x90, 0x50, 0x0f, 0x0e, 0x07, 0x00, 0x00, 0x01, 0x02, 0x03, 0xff]),
    ).toEqual({
      pan: -400,
      tilt: 0x123,
    });
    expect(parseZoom([0x90, 0x50, 0x04, 0x00, 0x00, 0x00, 0xff])).toBe(0x4000);
    expect(parseZoom([0x90, 0x60, 0x02, 0xff])).toBeNull();
  });

  it('VISCA over IP framing and splitting a byte stream', () => {
    expect(udpPacket([0x81, 0x01, 0xff], 7).toString('hex')).toBe('010000030000000781' + '01ff');
    const { messages, rest } = splitMessages(
      Buffer.from([0x90, 0x41, 0xff, 0x90, 0x51, 0xff, 0x90]),
    );
    expect(messages.map((m) => m.toString('hex'))).toEqual(['9041ff', '9051ff']);
    expect(rest.toString('hex')).toBe('90');
  });
});

/** A pretend VISCA-over-TCP camera: records what it's sent, answers position inquiries. */
function tcpCamera(): Promise<{ server: Server; port: number; got: string[] }> {
  const got: string[] = [];
  const server = createServer((s) => {
    s.on('data', (d) => {
      for (const m of splitMessages(d).messages) {
        const h = m.toString('hex');
        got.push(h);
        if (h === '81090612ff')
          s.write(Buffer.from('9050' + '0f0e0700' + '00010203' + 'ff', 'hex'));
        else if (h === '81090447ff') s.write(Buffer.from('905004000000ff', 'hex'));
        else s.write(Buffer.from('9041ff9051ff', 'hex'));
      }
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const a = server.address();
      resolve({ server, port: typeof a === 'object' && a ? a.port : 0, got });
    }),
  );
}

/** A pretend VISCA-over-IP camera (UDP): records payloads, answers inquiries with the same header. */
function udpCamera(): Promise<{ socket: UdpSocket; port: number; got: string[] }> {
  const got: string[] = [];
  const socket = createSocket('udp4');
  socket.on('message', (m, from) => {
    const payload = m.subarray(8).toString('hex');
    got.push(payload);
    const reply = (hexBody: string) =>
      socket.send(
        udpPacket([...Buffer.from(hexBody, 'hex')], m.readUInt32BE(4), 0x0111),
        from.port,
        from.address,
      );
    if (payload === '81090612ff') reply('90500000000000000000ff');
    else if (payload === '81090447ff') reply('905001020304ff');
  });
  return new Promise((resolve) =>
    socket.bind(0, '127.0.0.1', () => resolve({ socket, port: socket.address().port, got })),
  );
}

const closers: (() => void)[] = [];
afterEach(() => {
  for (const c of closers.splice(0)) c();
});

describe('a VISCA camera on the network', () => {
  it('over TCP: a held joystick sends only the newest move, and a stop always goes out', async () => {
    const cam = await tcpCamera();
    closers.push(() => cam.server.close());
    const c = new ViscaCamera({ host: '127.0.0.1', port: cam.port, protocol: 'visca-tcp' }, log);
    closers.push(() => c.close());
    await new Promise((r) => setTimeout(r, 100));
    for (let i = 1; i <= 10; i++) c.drive(i / 10, 0);
    c.drive(0, 0);
    await until(() => cam.got.includes('8101060101010303ff'));
    const drives = cam.got.filter((h) => h.startsWith('81010601'));
    expect(drives.length).toBeLessThan(5); // coalesced, not ten
    expect(drives.at(-1)).toBe('8101060101010303ff');
  });

  it('over TCP: reads where it points', async () => {
    const cam = await tcpCamera();
    closers.push(() => cam.server.close());
    const c = new ViscaCamera({ host: '127.0.0.1', port: cam.port, protocol: 'visca-tcp' }, log);
    closers.push(() => c.close());
    await new Promise((r) => setTimeout(r, 100));
    expect(await c.position()).toEqual({ pan: -400, tilt: 0x123, zoom: 0x4000 });
  });

  it('over UDP: resets the sequence, then commands and inquiries in Sony’s header', async () => {
    const cam = await udpCamera();
    closers.push(() => cam.socket.close());
    const c = new ViscaCamera({ host: '127.0.0.1', port: cam.port, protocol: 'visca-udp' }, log);
    closers.push(() => c.close());
    expect(await c.position()).toEqual({ pan: 0, tilt: 0, zoom: 0x1234 });
    c.send(visca.home());
    await until(() => cam.got.includes('81010604ff'));
    expect(cam.got[0]).toBe('01'); // the sequence reset
  });

  it('a camera that never answers: no position, no hang', async () => {
    const c = new ViscaCamera({ host: '127.0.0.1', port: 9, protocol: 'visca-udp' }, log);
    closers.push(() => c.close());
    expect(await c.position()).toBeNull();
  });
});

describe('the PTZ service', () => {
  const withCamera = (port: number): Settings => {
    const s = defaultSettings();
    s.cameras = {
      cam1: {
        name: '',
        fit: 'cover',
        mirror: false,
        resolution: 'auto',
        hidden: false,
        ptz: { protocol: 'visca-tcp', host: '127.0.0.1', port },
        shots: [],
      },
    };
    return s;
  };

  it('stops a move that isn’t renewed (the control window went away mid-move)', async () => {
    const cam = await tcpCamera();
    closers.push(() => cam.server.close());
    const settings = withCamera(cam.port);
    const svc = new PtzService({ log, getSettings: () => settings });
    closers.push(() => svc.close());
    svc.settingsChanged();
    await new Promise((r) => setTimeout(r, 100));
    await svc.handle({ action: 'drive', deviceId: 'cam1', pan: 0.5, tilt: 0 });
    await until(() => cam.got.some((h) => h.startsWith('8101060') && h !== '8101060101010303ff'));
    await until(() => cam.got.includes('8101060101010303ff'), 2500);
  });

  it('a camera without an address says so; removing the address stops it', async () => {
    const cam = await tcpCamera();
    closers.push(() => cam.server.close());
    let settings = withCamera(cam.port);
    const svc = new PtzService({ log, getSettings: () => settings });
    closers.push(() => svc.close());
    svc.settingsChanged();
    await expect(svc.handle({ action: 'home', deviceId: 'other' })).rejects.toThrow(/no PTZ/);
    await new Promise((r) => setTimeout(r, 100));
    await svc.handle({ action: 'zoom', deviceId: 'cam1', speed: 1 });
    settings = defaultSettings();
    svc.settingsChanged();
    await until(() => cam.got.includes('8101040700ff'));
  });
});

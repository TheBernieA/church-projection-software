import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { Socket } from 'node:net';
import type { Logger } from '../types';

/**
 * VISCA: the PTZ camera protocol most makes speak (Sony, PTZOptics, BirdDog, Lumens, Avonic,
 * Panasonic and Canon in VISCA mode). Two ways in: VISCA over IP (UDP 52381, each message in an
 * 8-byte header with a sequence number) and VISCA over TCP (port 5678 on PTZOptics and most
 * budget cameras: the bare messages). The commands are the same either way.
 *
 * The builders below are the bytes of each command (address 1, `0x81`), pure and tested; a
 * `ViscaCamera` sends them.
 */

export type ViscaProtocol = 'visca-udp' | 'visca-tcp';
export const VISCA_PORTS: Record<ViscaProtocol, number> = { 'visca-udp': 52381, 'visca-tcp': 5678 };

/** Fastest pan and tilt speeds VISCA defines (most cameras accept these). */
const PAN_MAX = 0x18;
const TILT_MAX = 0x14;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
/** A speed from 0–1 as 1…max (0 stays 0: that axis stops). */
const speedOf = (v: number, max: number): number =>
  v === 0 ? 0 : clamp(Math.round(Math.abs(v) * max), 1, max);
/** A 16-bit value as four nibbles (VISCA's position encoding). */
const nibbles = (v: number): number[] => {
  const x = v & 0xffff;
  return [(x >> 12) & 0xf, (x >> 8) & 0xf, (x >> 4) & 0xf, x & 0xf];
};
const fromNibbles = (b: ArrayLike<number>, at: number): number => {
  const n = (i: number): number => (b[at + i] ?? 0) & 0xf;
  const v = (n(0) << 12) | (n(1) << 8) | (n(2) << 4) | n(3);
  return v >= 0x8000 ? v - 0x10000 : v; // pan and tilt are signed
};

export type ExposureMode = 'auto' | 'manual' | 'shutter' | 'iris' | 'bright';
export type WhiteBalance = 'auto' | 'indoor' | 'outdoor' | 'onePush' | 'manual';
export type Step = 'up' | 'down';

export const visca = {
  /** Pan and tilt at speeds from −1 to 1 (right and up positive); 0 stops that axis. */
  drive(pan: number, tilt: number): number[] {
    const ps = speedOf(pan, PAN_MAX);
    const ts = speedOf(tilt, TILT_MAX);
    const x = pan > 0 ? 0x02 : pan < 0 ? 0x01 : 0x03;
    const y = tilt > 0 ? 0x01 : tilt < 0 ? 0x02 : 0x03;
    return [0x81, 0x01, 0x06, 0x01, ps || 1, ts || 1, x, y, 0xff];
  },
  stop(): number[] {
    return visca.drive(0, 0);
  },
  /** Zoom at a speed from −1 (wide) to 1 (tele); 0 stops. */
  zoom(speed: number): number[] {
    if (speed === 0) return [0x81, 0x01, 0x04, 0x07, 0x00, 0xff];
    const p = clamp(Math.round(Math.abs(speed) * 7), 0, 7);
    return [0x81, 0x01, 0x04, 0x07, (speed > 0 ? 0x20 : 0x30) | p, 0xff];
  },
  home(): number[] {
    return [0x81, 0x01, 0x06, 0x04, 0xff];
  },
  /** The camera's own preset memory (0-based slot). */
  recall(slot: number): number[] {
    return [0x81, 0x01, 0x04, 0x3f, 0x02, clamp(slot, 0, 127), 0xff];
  },
  store(slot: number): number[] {
    return [0x81, 0x01, 0x04, 0x3f, 0x01, clamp(slot, 0, 127), 0xff];
  },
  /** Straight to a position (the camera's own counts), at speeds 0–1. */
  goTo(pan: number, tilt: number, speed = 1): number[] {
    return [
      0x81,
      0x01,
      0x06,
      0x02,
      speedOf(speed, PAN_MAX),
      speedOf(speed, TILT_MAX),
      ...nibbles(pan),
      ...nibbles(tilt),
      0xff,
    ];
  },
  zoomTo(zoom: number): number[] {
    return [0x81, 0x01, 0x04, 0x47, ...nibbles(clamp(zoom, 0, 0xffff)), 0xff];
  },
  autoFocus(on: boolean): number[] {
    return [0x81, 0x01, 0x04, 0x38, on ? 0x02 : 0x03, 0xff];
  },
  /** Focus once on what's in front now (one-push AF). */
  focusOnce(): number[] {
    return [0x81, 0x01, 0x04, 0x18, 0x01, 0xff];
  },
  exposure(mode: ExposureMode): number[] {
    const p = { auto: 0x00, manual: 0x03, shutter: 0x0a, iris: 0x0b, bright: 0x0d }[mode];
    return [0x81, 0x01, 0x04, 0x39, p, 0xff];
  },
  /** One step of iris, shutter or gain (manual exposure). */
  iris(step: Step): number[] {
    return [0x81, 0x01, 0x04, 0x0b, step === 'up' ? 0x02 : 0x03, 0xff];
  },
  shutter(step: Step): number[] {
    return [0x81, 0x01, 0x04, 0x0a, step === 'up' ? 0x02 : 0x03, 0xff];
  },
  gain(step: Step): number[] {
    return [0x81, 0x01, 0x04, 0x0c, step === 'up' ? 0x02 : 0x03, 0xff];
  },
  whiteBalance(mode: WhiteBalance): number[] {
    const p = { auto: 0x00, indoor: 0x01, outdoor: 0x02, onePush: 0x03, manual: 0x05 }[mode];
    return [0x81, 0x01, 0x04, 0x35, p, 0xff];
  },
  /** With one-push white balance: measure the white in front of it now. */
  whiteBalanceOnce(): number[] {
    return [0x81, 0x01, 0x04, 0x10, 0x05, 0xff];
  },
  panTiltInquiry(): number[] {
    return [0x81, 0x09, 0x06, 0x12, 0xff];
  },
  zoomInquiry(): number[] {
    return [0x81, 0x09, 0x04, 0x47, 0xff];
  },
};

/** A pan/tilt inquiry's answer: y0 50 0p 0p 0p 0p 0t 0t 0t 0t FF. */
export function parsePanTilt(reply: ArrayLike<number>): { pan: number; tilt: number } | null {
  if (reply.length < 11 || reply[1] !== 0x50) return null;
  return { pan: fromNibbles(reply, 2), tilt: fromNibbles(reply, 6) };
}

/** A zoom inquiry's answer: y0 50 0p 0q 0r 0s FF. */
export function parseZoom(reply: ArrayLike<number>): number | null {
  if (reply.length < 7 || reply[1] !== 0x50) return null;
  return fromNibbles(reply, 2) & 0xffff;
}

/** VISCA over IP: payload types (Sony's header). */
const UDP_COMMAND = 0x0100;
const UDP_INQUIRY = 0x0110;
const UDP_CONTROL = 0x0200;

/** A message in VISCA over IP's header: type, length, sequence number. */
export function udpPacket(payload: readonly number[], seq: number, type = UDP_COMMAND): Buffer {
  const b = Buffer.alloc(8 + payload.length);
  b.writeUInt16BE(type, 0);
  b.writeUInt16BE(payload.length, 2);
  b.writeUInt32BE(seq >>> 0, 4);
  Buffer.from(payload).copy(b, 8);
  return b;
}

/** The VISCA messages in a stream of bytes (each ends with 0xFF); the rest waits for more. */
export function splitMessages(buf: Buffer): { messages: Buffer[]; rest: Buffer } {
  const messages: Buffer[] = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++)
    if (buf[i] === 0xff) {
      messages.push(buf.subarray(start, i + 1));
      start = i + 1;
    }
  return { messages, rest: buf.subarray(start) };
}

/** A position a shot can go back to exactly: the camera's own counts. */
export interface ViscaPosition {
  pan: number;
  tilt: number;
  zoom: number;
}

export interface ViscaTarget {
  host: string;
  port: number;
  protocol: ViscaProtocol;
}

/** How long an inquiry waits for its answer. */
const INQUIRY_MS = 600;
/** Joystick moves at most this often (newest wins): cameras queue few commands. */
const DRIVE_EVERY_MS = 50;
const RECONNECT_MS = 3000;

/**
 * One VISCA camera on the network. Commands go out as they're given, except moves: while the
 * joystick is held, only the newest pan/tilt and zoom are sent, at most every 50 ms, and a stop
 * always goes out. Inquiries (where it's pointing) are answered one at a time.
 */
export class ViscaCamera {
  private udp: UdpSocket | null = null;
  private tcp: Socket | null = null;
  private tcpReady = false;
  private seq = 0;
  private inbox = Buffer.alloc(0);
  private waiting: { resolve: (b: Buffer | null) => void; timer: ReturnType<typeof setTimeout> }[] =
    [];
  private pendingDrive: number[] | null = null;
  private pendingZoom: number[] | null = null;
  private driveTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnect: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  /** The last moves sent (so a stop is known to be needed, and repeats aren't sent). */
  private moving = { drive: false, zoom: false };

  constructor(
    readonly target: ViscaTarget,
    private readonly log: Logger,
  ) {
    this.open();
  }

  private open(): void {
    if (this.closed) return;
    if (this.target.protocol === 'visca-udp') {
      const s = createSocket('udp4');
      s.on('message', (m) => this.onUdp(m));
      s.on('error', (e) =>
        this.log.warn('visca udp error', { host: this.target.host, e: e.message }),
      );
      this.udp = s;
      // Reset the camera's sequence number so it accepts ours from 0.
      this.sendRaw(udpPacket([0x01], 0, UDP_CONTROL));
      return;
    }
    const s = new Socket();
    s.setNoDelay(true);
    s.on('connect', () => {
      this.tcpReady = true;
    });
    s.on('data', (d) => this.onBytes(d));
    const lost = (): void => {
      if (this.tcp !== s) return;
      this.tcpReady = false;
      this.tcp = null;
      this.answerAll(null);
      if (!this.closed && !this.reconnect)
        this.reconnect = setTimeout(() => {
          this.reconnect = null;
          this.open();
        }, RECONNECT_MS);
    };
    s.on('error', (e) => {
      this.log.warn('visca tcp error', { host: this.target.host, e: e.message });
      lost();
    });
    s.on('close', lost);
    s.connect(this.target.port, this.target.host);
    this.tcp = s;
  }

  private sendRaw(b: Buffer): void {
    if (this.udp) this.udp.send(b, this.target.port, this.target.host);
    else if (this.tcp && this.tcpReady) this.tcp.write(b);
  }

  /** Send one VISCA message. */
  send(msg: readonly number[], inquiry = false): void {
    if (this.closed) return;
    if (this.udp) {
      this.sendRaw(udpPacket(msg, ++this.seq, inquiry ? UDP_INQUIRY : UDP_COMMAND));
      return;
    }
    this.sendRaw(Buffer.from(msg));
  }

  private onUdp(m: Buffer): void {
    // Strip the 8-byte header (a reply or an ack); control replies have no VISCA in them.
    if (m.length > 8 && m.readUInt16BE(0) !== UDP_CONTROL) this.onBytes(m.subarray(8));
  }

  private onBytes(d: Buffer): void {
    const { messages, rest } = splitMessages(Buffer.concat([this.inbox, d]));
    this.inbox = Buffer.from(rest);
    for (const m of messages) {
      // y0 50 …: an inquiry's answer (a command's completion is y0 5z FF with nothing in it).
      if (m.length > 3 && m[1] === 0x50) this.answer(m);
      // y0 6z …: an error. An inquiry the camera can't answer gets one.
      else if (m.length >= 3 && ((m[1] ?? 0) & 0xf0) === 0x60 && this.waiting.length)
        this.answer(null);
    }
  }

  private answer(m: Buffer | null): void {
    const w = this.waiting.shift();
    if (!w) return;
    clearTimeout(w.timer);
    w.resolve(m);
  }

  private answerAll(m: null): void {
    while (this.waiting.length) this.answer(m);
  }

  private inquire(msg: number[]): Promise<Buffer | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const i = this.waiting.findIndex((w) => w.timer === timer);
        if (i >= 0) this.waiting.splice(i, 1);
        resolve(null);
      }, INQUIRY_MS);
      this.waiting.push({ resolve, timer });
      this.send(msg, true);
    });
  }

  /** Where it points now (null: it didn't say). */
  async position(): Promise<ViscaPosition | null> {
    const pt = await this.inquire(visca.panTiltInquiry());
    const z = await this.inquire(visca.zoomInquiry());
    const p = pt && parsePanTilt(pt);
    const zoom = z && parseZoom(z);
    return p && zoom !== null ? { ...p, zoom } : null;
  }

  goTo(p: ViscaPosition, speed = 1): void {
    this.stopMoving();
    this.send(visca.goTo(p.pan, p.tilt, speed));
    this.send(visca.zoomTo(p.zoom));
  }

  /** Joystick: pan and tilt speeds −1 to 1 (0, 0 stops). */
  drive(pan: number, tilt: number): void {
    const stopping = pan === 0 && tilt === 0;
    if (stopping && !this.moving.drive) return;
    this.moving.drive = !stopping;
    this.queueMove('drive', visca.drive(pan, tilt), stopping);
  }

  /** Zoom rocker: −1 (wide) to 1 (tele); 0 stops. */
  zoom(speed: number): void {
    const stopping = speed === 0;
    if (stopping && !this.moving.zoom) return;
    this.moving.zoom = !stopping;
    this.queueMove('zoom', visca.zoom(speed), stopping);
  }

  private queueMove(kind: 'drive' | 'zoom', msg: number[], now: boolean): void {
    if (kind === 'drive') this.pendingDrive = msg;
    else this.pendingZoom = msg;
    if (now) return this.flushMoves();
    this.driveTimer ??= setTimeout(() => this.flushMoves(), DRIVE_EVERY_MS);
  }

  private flushMoves(): void {
    if (this.driveTimer) clearTimeout(this.driveTimer);
    this.driveTimer = null;
    if (this.pendingDrive) this.send(this.pendingDrive);
    if (this.pendingZoom) this.send(this.pendingZoom);
    this.pendingDrive = null;
    this.pendingZoom = null;
  }

  /** Stop every move it was making (always sent: a camera must never be left moving). */
  stopMoving(): void {
    this.pendingDrive = null;
    this.pendingZoom = null;
    if (this.driveTimer) clearTimeout(this.driveTimer);
    this.driveTimer = null;
    this.moving = { drive: false, zoom: false };
    this.send(visca.stop());
    this.send(visca.zoom(0));
  }

  close(): void {
    this.stopMoving();
    this.closed = true;
    if (this.reconnect) clearTimeout(this.reconnect);
    this.answerAll(null);
    const udp = this.udp;
    const tcp = this.tcp;
    this.udp = null;
    this.tcp = null;
    // Give the stop a moment to leave before the socket goes.
    setTimeout(() => {
      udp?.close();
      tcp?.end();
    }, 100);
  }
}

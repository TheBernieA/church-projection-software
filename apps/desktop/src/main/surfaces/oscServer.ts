import { createSocket, type Socket } from 'node:dgram';
import { networkInterfaces } from 'node:os';
import { decodeOsc, encodeOsc, type OscArg, type OscMessage, type Settings } from '@lampstand/core';
import type { OscStatus } from '@lampstand/ipc-contract';
import type { Logger } from '../types';

interface Deps {
  log: Logger;
  getSettings: () => Settings;
  /** Messages that arrived, for the control window's binding engine. */
  onMessages: (m: OscMessage[]) => void;
  onStatus: (s: OscStatus) => void;
}

/** This computer's IPv4 addresses on the network (what to type into the desk or app). */
function localAddresses(): string[] {
  return Object.values(networkInterfaces()).flatMap((list) =>
    (list ?? []).filter((n) => n.family === 'IPv4' && !n.internal).map((n) => n.address),
  );
}

/**
 * OSC over UDP (Settings › Control surfaces): listens on the chosen port for a desk or an app
 * (TouchOSC, a Behringer X32, an Allen & Heath desk via its OSC bridge) and sends replies and
 * cues to the desk's address. One socket does both, so desks that answer to the sender's port
 * also work.
 */
export class OscServer {
  private socket: Socket | null = null;
  private port = 0;
  private status: OscStatus = { listening: false, port: 0, error: null, addresses: [] };

  constructor(private readonly d: Deps) {}

  get current(): OscStatus {
    return { ...this.status, addresses: localAddresses() };
  }

  /** Start, stop or move the listener to match the settings. */
  settingsChanged(): void {
    const { enabled, port } = this.d.getSettings().surfaces.osc;
    if (!enabled) {
      if (this.socket) this.close();
      this.setStatus({ listening: false, port, error: null });
      return;
    }
    if (this.socket && this.port === port) return;
    this.close();
    this.listen(port);
  }

  private listen(port: number): void {
    const socket = createSocket({ type: 'udp4', reuseAddr: true });
    this.socket = socket;
    this.port = port;
    socket.on('message', (data) => {
      const messages = decodeOsc(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      if (messages.length) this.d.onMessages(messages);
    });
    socket.on('error', (e) => {
      this.d.log.warn('osc listener failed', { port, error: e.message });
      if (this.socket === socket) this.close();
      this.setStatus({ listening: false, port, error: e.message });
    });
    socket.bind(port, () => {
      if (this.socket !== socket) return;
      this.d.log.info('osc listening', { port });
      this.setStatus({ listening: true, port, error: null });
    });
  }

  /** An OSC message to the desk (the address in Settings); nothing when none is set. */
  send(address: string, args: OscArg[]): void {
    const { sendHost, sendPort } = this.d.getSettings().surfaces.osc;
    if (!sendHost) return;
    const data = encodeOsc(address, args);
    // Sent from the listening socket when there is one (desks often reply to that port).
    const socket = this.socket ?? createSocket('udp4');
    socket.send(data, sendPort, sendHost, (e) => {
      if (e) this.d.log.warn('osc send failed', { error: e.message });
      if (socket !== this.socket) socket.close();
    });
  }

  close(): void {
    const s = this.socket;
    this.socket = null;
    this.port = 0;
    try {
      s?.close();
    } catch {
      // already closed
    }
  }

  private setStatus(p: Omit<OscStatus, 'addresses'>): void {
    const next = { ...p, addresses: localAddresses() };
    if (JSON.stringify(next) === JSON.stringify(this.status)) return;
    this.status = next;
    this.d.onStatus(next);
  }
}

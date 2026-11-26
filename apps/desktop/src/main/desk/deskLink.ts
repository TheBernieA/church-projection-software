import { createSocket, type Socket } from 'node:dgram';
import {
  AppError,
  decodeOsc,
  deskAddress,
  deskProcessing,
  deskProfiles,
  deskReadAddresses,
  deskWrites,
  encodeOsc,
  type DeskProfile,
  type FitNote,
  type OscValue,
  type Processing,
  type Settings,
} from '@lampstand/core';
import type { DeskStatus } from '@lampstand/ipc-contract';
import type { Logger } from '../types';

interface Deps {
  log: Logger;
  getSettings: () => Settings;
}

/** How long to wait for the desk's answers. */
const ANSWER_MS = 1500;
/** Writes go in small bursts with a pause between, so a desk's input buffer never overflows. */
const BURST = 16;
const BURST_GAP_MS = 6;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * The link to a sound desk over its network control protocol (OSC over UDP), driven entirely by
 * the desk's profile: it asks for a channel's values and reads them, and sends the messages that
 * set them. One request at a time, so answers never mix. Nothing is sent until the operator reads
 * or sends something (no polling).
 */
export class DeskLink {
  private socket: Socket | null = null;
  /** Answers being waited for: address → first argument. */
  private waiting: { want: Set<string>; got: Map<string, OscValue>; done: () => void } | null =
    null;
  private queue: Promise<unknown> = Promise.resolve();
  private lastError: string | null = null;

  constructor(private readonly d: Deps) {}

  /** The chosen profile and where the desk is, or why there isn't one. */
  private target(): { profile: DeskProfile; host: string; port: number } {
    const s = this.d.getSettings();
    const { desk } = s;
    if (!desk.enabled)
      throw new AppError('desk-off', 'The sound desk link is off (Settings › Audio).');
    if (!desk.host) throw new AppError('desk-no-host', 'Give the sound desk’s address first.');
    const profile = deskProfiles(s.deskProfiles).find((p) => p.id === desk.profile);
    if (!profile) throw new AppError('desk-no-profile', 'Choose which desk it is first.');
    return { profile, host: desk.host, port: desk.port || profile.port };
  }

  private open(): Socket {
    if (this.socket) return this.socket;
    const socket = createSocket('udp4');
    socket.on('message', (data) => {
      const w = this.waiting;
      if (!w) return;
      for (const m of decodeOsc(new Uint8Array(data))) {
        if (!w.want.has(m.address) || w.got.has(m.address)) continue;
        w.got.set(m.address, m.args[0] ?? '');
        if (w.got.size >= w.want.size) w.done();
      }
    });
    socket.on('error', (err) => {
      this.lastError = err.message;
      this.d.log.warn('desk socket error', { error: err.message });
    });
    socket.bind(0);
    this.socket = socket;
    return socket;
  }

  /** Settings changed: a different desk or address starts from a fresh socket. */
  settingsChanged(): void {
    this.close();
  }

  /** Run one request at a time (answers from two would mix). */
  private serial<T>(job: () => Promise<T>): Promise<T> {
    const next = this.queue.then(job, job);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private send(
    host: string,
    port: number,
    address: string,
    args: Parameters<typeof encodeOsc>[1] = [],
  ): void {
    this.open().send(encodeOsc(address, args), port, host);
  }

  /** Ask for these addresses' values; resolves with what came back in time. */
  private ask(host: string, port: number, addresses: string[]): Promise<Map<string, OscValue>> {
    return new Promise((resolve) => {
      const got = new Map<string, OscValue>();
      let timer: ReturnType<typeof setTimeout> | null = null;
      const done = (): void => {
        if (timer) clearTimeout(timer);
        this.waiting = null;
        resolve(got);
      };
      this.waiting = { want: new Set(addresses), got, done };
      timer = setTimeout(done, ANSWER_MS);
      void (async () => {
        for (let i = 0; i < addresses.length; i += BURST) {
          for (const a of addresses.slice(i, i + BURST)) this.send(host, port, a);
          await sleep(BURST_GAP_MS);
        }
      })();
    });
  }

  /** Is the desk answering? */
  status(): Promise<DeskStatus> {
    const s = this.d.getSettings();
    const profile = deskProfiles(s.deskProfiles).find((p) => p.id === s.desk.profile) ?? null;
    const base: DeskStatus = {
      enabled: s.desk.enabled,
      profile: profile?.name ?? null,
      host: s.desk.host,
      port: s.desk.port || profile?.port || 0,
      answering: null,
      error: null,
    };
    if (!s.desk.enabled || !s.desk.host || !profile) return Promise.resolve(base);
    return this.serial(async () => {
      const { host, port } = this.target();
      this.lastError = null;
      const probe = profile.probe;
      const got = await new Promise<boolean>((resolve) => {
        // Any answer to the probe counts (desks reply with their name and firmware).
        let timer: ReturnType<typeof setTimeout> | null = null;
        const done = (): void => {
          if (timer) clearTimeout(timer);
          this.waiting = null;
          resolve(true);
        };
        this.waiting = { want: new Set([probe]), got: new Map(), done };
        timer = setTimeout(() => {
          this.waiting = null;
          resolve(false);
        }, ANSWER_MS);
        this.send(host, port, probe);
      });
      return { ...base, answering: got, error: got ? null : this.lastError };
    });
  }

  /** A channel's processing and name, from the desk. */
  read(channel: number): Promise<{ name: string | null; processing: Processing }> {
    return this.serial(async () => {
      const { profile, host, port } = this.target();
      if (channel > profile.channels)
        throw new AppError('desk-channel', `This desk has ${profile.channels} channels.`);
      const values = await this.ask(host, port, deskReadAddresses(profile, channel));
      const read = deskProcessing(profile, channel, values);
      if (!read)
        throw new AppError(
          'desk-no-answer',
          'The desk didn’t answer. Check its address, that it’s on the same network, and the desk type.',
        );
      return read;
    });
  }

  /**
   * Put processing on a desk channel. What the channel had is read first and returned, so it can
   * be put back (undo); the notes say what had to change to fit the desk.
   */
  async write(
    channel: number,
    processing: Processing,
  ): Promise<{ notes: FitNote[]; previous: Processing | null }> {
    const previous = await this.read(channel)
      .then((r) => r.processing)
      .catch(() => null);
    return this.serial(async () => {
      const { profile, host, port } = this.target();
      const { messages, notes } = deskWrites(profile, channel, processing);
      for (let i = 0; i < messages.length; i += BURST) {
        for (const m of messages.slice(i, i + BURST)) this.send(host, port, m.address, m.args);
        await sleep(BURST_GAP_MS);
      }
      this.d.log.info('desk channel set', {
        channel,
        messages: messages.length,
        notes: notes.length,
      });
      return { notes, previous };
    });
  }

  /** The desk's channel names (null where it has none, or didn't say). */
  channels(): Promise<{ channel: number; name: string | null }[]> {
    return this.serial(async () => {
      const { profile, host, port } = this.target();
      const template = profile.channelName;
      const numbers = Array.from({ length: profile.channels }, (_, i) => i + 1);
      if (!template) return numbers.map((channel) => ({ channel, name: null }));
      const values = await this.ask(
        host,
        port,
        numbers.map((n) => deskAddress(profile, template, n)),
      );
      return numbers.map((channel) => {
        const v = values.get(deskAddress(profile, template, channel));
        return { channel, name: typeof v === 'string' && v.trim() ? v.trim() : null };
      });
    });
  }

  close(): void {
    this.waiting?.done();
    this.socket?.close();
    this.socket = null;
  }
}

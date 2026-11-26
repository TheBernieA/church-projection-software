import type { PtzCommand, PtzConnection, PtzPosition, Settings } from '@lampstand/core';
import type { Logger } from '../types';
import { visca, ViscaCamera } from './visca';

interface Deps {
  log: Logger;
  getSettings: () => Settings;
}

/** A move not renewed for this long is stopped (the control window went away mid-move). */
const WATCHDOG_MS = 1000;

const keyOf = (c: PtzConnection): string => `${c.protocol}|${c.host}|${c.port}`;

/**
 * The PTZ cameras (Settings › Video: a camera with a network address): one VISCA connection
 * each, opened and closed as settings change, and `camera.ptz` commands carried out on them.
 * Every camera it moves is stopped when Lampstand quits, when its address changes, and when a
 * move isn't renewed (so a crash in the middle of a joystick move never leaves one turning).
 */
export class PtzService {
  private readonly cams = new Map<string, { key: string; cam: ViscaCamera }>();
  /** When each moving camera's move was last renewed. */
  private readonly moving = new Map<string, number>();
  private watchdog: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly d: Deps) {}

  /** Open, change or close connections to match the settings. */
  settingsChanged(): void {
    const wanted = new Map<string, PtzConnection>();
    for (const [deviceId, c] of Object.entries(this.d.getSettings().cameras))
      if (c.ptz) wanted.set(deviceId, c.ptz);
    for (const [deviceId, { key, cam }] of this.cams) {
      const w = wanted.get(deviceId);
      if (!w || keyOf(w) !== key) {
        cam.close();
        this.cams.delete(deviceId);
        this.moving.delete(deviceId);
      }
    }
    for (const [deviceId, c] of wanted)
      if (!this.cams.has(deviceId))
        this.cams.set(deviceId, {
          key: keyOf(c),
          cam: new ViscaCamera(c, this.d.log),
        });
  }

  /** Carry out a command; `position` answers where the camera points. */
  async handle(c: PtzCommand): Promise<PtzPosition | null> {
    const cam = this.cams.get(c.deviceId)?.cam;
    if (!cam) throw new Error('This camera has no PTZ address (Settings › Video).');
    switch (c.action) {
      case 'drive':
        cam.drive(c.pan, c.tilt);
        this.renew(c.deviceId, c.pan !== 0 || c.tilt !== 0);
        return null;
      case 'zoom':
        cam.zoom(c.speed);
        this.renew(c.deviceId, c.speed !== 0);
        return null;
      case 'stop':
        cam.stopMoving();
        this.moving.delete(c.deviceId);
        return null;
      case 'home':
        cam.stopMoving();
        cam.send(visca.home());
        return null;
      case 'focus':
        cam.send(c.mode === 'once' ? visca.focusOnce() : visca.autoFocus(c.mode === 'auto'));
        return null;
      case 'exposure':
        cam.send(visca.exposure(c.mode));
        return null;
      case 'step':
        cam.send(visca[c.what](c.dir));
        return null;
      case 'whiteBalance':
        cam.send(visca.whiteBalance(c.mode));
        return null;
      case 'whiteBalanceOnce':
        cam.send(visca.whiteBalanceOnce());
        return null;
      case 'goTo':
        this.moving.delete(c.deviceId);
        cam.goTo(c.position, c.speed);
        return null;
      case 'recall':
      case 'store':
        cam.stopMoving();
        this.moving.delete(c.deviceId);
        cam.send(c.action === 'recall' ? visca.recall(c.slot) : visca.store(c.slot));
        return null;
      case 'position':
        return cam.position();
    }
  }

  private renew(deviceId: string, moving: boolean): void {
    if (!moving) {
      this.moving.delete(deviceId);
      return;
    }
    this.moving.set(deviceId, Date.now());
    this.watchdog ??= setInterval(() => this.check(), 250);
  }

  private check(): void {
    const now = Date.now();
    for (const [deviceId, at] of this.moving)
      if (now - at > WATCHDOG_MS) {
        this.d.log.warn('ptz move not renewed: stopping', { deviceId: deviceId.slice(0, 12) });
        this.cams.get(deviceId)?.cam.stopMoving();
        this.moving.delete(deviceId);
      }
    if (this.moving.size === 0 && this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
  }

  /** Stop every camera (Cut took the moving one to Program, or the operator let go everywhere). */
  stopAll(): void {
    for (const { cam } of this.cams.values()) cam.stopMoving();
    this.moving.clear();
  }

  /** Quitting: stop everything and close the connections. */
  close(): void {
    for (const { cam } of this.cams.values()) cam.close();
    this.cams.clear();
    this.moving.clear();
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }
}

import { create } from 'zustand';
import {
  applyCameraAction,
  clampView,
  DigitalFollow,
  maxDigitalZoom,
  newId,
  PersonLock,
  PtzFollow,
  SHOT_THUMB_MAX,
  WHOLE,
  type CameraShot,
  type CameraView,
  type FrameRect,
  type FramePoint,
  type PtzCommand,
  type PtzPosition,
  type ShotSize,
} from '@lampstand/core';
import { cmd } from './api';
import { setCameraSettings } from './inputs';
import { attempt, useStore } from './store';
import { detectPeople, prepareDetector } from './follow/detector';

/**
 * Camera control (Media › Video input › Camera): the joystick, zoom, saved shots and follow, for
 * a PTZ camera (moved over the network, VISCA) or any other camera (a digital shot: a crop and
 * zoom inside its picture, shown the same in every window and on the stream).
 */

export interface FollowState {
  deviceId: string;
  size: ShotSize;
  status: 'starting' | 'following' | 'lost' | 'failed';
  /** The person followed, in the camera's picture (for the outline on the monitors). */
  box: FrameRect | null;
}

interface CameraControlState {
  follow: FollowState | null;
  /** How fast the joystick and zoom move (the tortoise-to-hare dial), 0.25–2. */
  speed: number;
  /** The shot size Follow frames people at. */
  size: ShotSize;
}

export const useCameraControl = create<CameraControlState>()(() => ({
  follow: null,
  speed: readSpeed(),
  size: 'waist',
}));

function readSpeed(): number {
  try {
    const v = Number(localStorage.getItem('lampstand.cameraSpeed'));
    return v >= 0.25 && v <= 2 ? v : 1;
  } catch {
    return 1;
  }
}

export function setSpeed(speed: number): void {
  useCameraControl.setState({ speed });
  try {
    localStorage.setItem('lampstand.cameraSpeed', String(speed));
  } catch {
    // Not kept: fine.
  }
}

const settingsOf = (deviceId: string) => useStore.getState().settings?.cameras[deviceId];
/** The camera's network address, if it's a PTZ camera. */
export const ptzOf = (deviceId: string) => settingsOf(deviceId)?.ptz ?? null;
/** How far its picture may be zoomed digitally. */
export const maxZoomOf = (deviceId: string): number =>
  maxDigitalZoom(settingsOf(deviceId)?.resolution ?? 'auto');
/** Its digital shot now (the whole picture if none). */
export const viewOf = (deviceId: string): CameraView =>
  useStore.getState().live?.cameraViews[deviceId] ?? WHOLE;

/** A command to a PTZ camera (errors shown as a notice). */
export const ptz = (c: PtzCommand): Promise<unknown> =>
  attempt(() => cmd('camera.ptz', c), 'errors.camera');

const pendingViews = new Map<string, CameraView | null>();
let viewTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Set a camera's digital shot: shown here at once, sent at most every 50 ms (the last always
 * goes), so dragging or following never floods the windows.
 */
export function setView(deviceId: string, view: CameraView | null): void {
  const s = useStore.getState();
  const v = view ? clampView(view, maxZoomOf(deviceId)) : null;
  if (s.live)
    useStore.setState({
      live: {
        ...s.live,
        cameraViews: applyCameraAction(s.live.cameraViews, { action: 'view', deviceId, view: v }),
      },
    });
  pendingViews.set(deviceId, v);
  viewTimer ??= setTimeout(() => {
    viewTimer = null;
    const all = [...pendingViews];
    pendingViews.clear();
    for (const [id, view] of all)
      void attempt(
        () => cmd('live.camera', { action: 'view', deviceId: id, view }),
        'errors.camera',
      );
  }, 50);
}

// —— The joystick and zoom ————————————————————————————————————————————————————————————————

/** While held: PTZ moves are renewed this often (the main process stops one that isn't). */
const RENEW_MS = 200;
const TICK_MS = 33;
/** Digital: the whole picture's width crossed in this many seconds at full stick, speed 1. */
const DIGITAL_CROSS_SEC = 2.5;

let held: { deviceId: string; pan: number; tilt: number; zoom: number } | null = null;
let heldTimer: ReturnType<typeof setInterval> | null = null;
let lastRenew = 0;
let lastTick = 0;

/**
 * Move the camera by hand: pan and tilt (−1 to 1, right and up positive) and zoom (−1 wide to 1
 * tele), scaled by the speed dial. All zero lets go. Moving a camera by hand stops following it.
 */
export function moveCamera(deviceId: string, pan: number, tilt: number, zoom: number): void {
  const still = pan === 0 && tilt === 0 && zoom === 0;
  if (held && held.deviceId !== deviceId) letGo();
  if (still) return letGo();
  if (useCameraControl.getState().follow?.deviceId === deviceId) stopFollow();
  const first = !held;
  held = { deviceId, pan, tilt, zoom };
  if (first) {
    lastTick = performance.now();
    lastRenew = 0;
    heldTimer = setInterval(tickHeld, TICK_MS);
  }
  tickHeld();
}

function tickHeld(): void {
  if (!held) return;
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastTick) / 1000);
  lastTick = now;
  const speed = useCameraControl.getState().speed;
  const { deviceId, pan, tilt, zoom } = held;
  if (ptzOf(deviceId)) {
    if (now - lastRenew < RENEW_MS && dt > 0) return;
    lastRenew = now;
    const k = Math.min(1, speed);
    void ptz({ action: 'drive', deviceId, pan: pan * k, tilt: tilt * k });
    void ptz({ action: 'zoom', deviceId, speed: zoom * k });
    return;
  }
  // Digital: the frame moves across the picture (slower when zoomed in, as a real lens feels).
  const v = viewOf(deviceId);
  const step = (dt / DIGITAL_CROSS_SEC) * speed;
  setView(deviceId, {
    x: v.x + (pan * step) / v.zoom,
    y: v.y - (tilt * step) / v.zoom,
    zoom: v.zoom * Math.exp(zoom * dt * 0.9 * speed),
  });
}

/** Let go of the joystick and zoom: a PTZ camera stops at once. */
export function letGo(): void {
  if (heldTimer) clearInterval(heldTimer);
  heldTimer = null;
  const was = held;
  held = null;
  if (was && ptzOf(was.deviceId)) void ptz({ action: 'stop', deviceId: was.deviceId });
}

/** Back to the middle: a PTZ camera's home position, or the whole picture. */
export function homeCamera(deviceId: string): void {
  stopFollowOf(deviceId);
  if (ptzOf(deviceId)) void ptz({ action: 'home', deviceId });
  else setView(deviceId, null);
}

// —— Saved shots ————————————————————————————————————————————————————————————————————————————

const shotsOf = (deviceId: string): CameraShot[] => settingsOf(deviceId)?.shots ?? [];

/**
 * Save where the camera is now as a shot. A PTZ camera is asked where it points; one that
 * doesn't say keeps the shot in its own next preset slot instead.
 */
export async function saveShot(deviceId: string, name: string): Promise<void> {
  const shots = shotsOf(deviceId);
  const shot: CameraShot = {
    id: newId(),
    name: name.trim().slice(0, 40) || `Shot ${shots.length + 1}`,
  };
  // A PTZ shot keeps a picture of itself (the camera can't show a shot it isn't pointing at); a
  // digital shot's tile shows the camera live, cropped to the shot.
  const thumb = ptzOf(deviceId) ? grabThumb(deviceId) : null;
  if (thumb) shot.thumb = thumb;
  if (ptzOf(deviceId)) {
    const pos = await attempt(
      () => cmd<PtzPosition | null>('camera.ptz', { action: 'position', deviceId }),
      'errors.camera',
    );
    if (pos) shot.ptz = pos;
    else {
      const used = new Set(shots.flatMap((s) => (s.preset === undefined ? [] : [s.preset])));
      let slot = 0;
      while (used.has(slot) && slot < 127) slot++;
      await ptz({ action: 'store', deviceId, slot });
      shot.preset = slot;
    }
  } else shot.view = viewOf(deviceId);
  setCameraSettings(deviceId, { shots: [...shots, shot] });
}

/** Shot pictures are this size (16:9). */
const THUMB_W = 192;
const THUMB_H = 108;

/**
 * A small JPEG of what a camera shows now, from a video on the page that's playing it (null if
 * none is, or the picture would be too big to keep).
 */
export function grabThumb(deviceId: string): string | null {
  const video = [...document.querySelectorAll('video')].find((v) => {
    const s = v.srcObject;
    return (
      s instanceof MediaStream &&
      v.readyState >= 2 &&
      v.videoWidth > 0 &&
      s.getVideoTracks().some((t) => t.getSettings().deviceId === deviceId)
    );
  });
  if (!video) return null;
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Fill the tile (crop the longer side), mirrored like the camera is set to show.
  const scale = Math.max(THUMB_W / video.videoWidth, THUMB_H / video.videoHeight);
  const w = video.videoWidth * scale;
  const h = video.videoHeight * scale;
  if (settingsOf(deviceId)?.mirror) {
    ctx.translate(THUMB_W, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h);
  const url = canvas.toDataURL('image/jpeg', 0.72);
  return url.length <= SHOT_THUMB_MAX ? url : null;
}

/** Go to a saved shot (following stops: the operator chose a shot). */
export function recallShot(deviceId: string, shot: CameraShot): void {
  stopFollowOf(deviceId);
  letGo();
  if (shot.ptz) void ptz({ action: 'goTo', deviceId, position: shot.ptz });
  else if (shot.preset !== undefined) void ptz({ action: 'recall', deviceId, slot: shot.preset });
  else setView(deviceId, shot.view ?? null);
}

export function renameShot(deviceId: string, id: string, name: string): void {
  const n = name.trim().slice(0, 40);
  if (!n) return;
  setCameraSettings(deviceId, {
    shots: shotsOf(deviceId).map((s) => (s.id === id ? { ...s, name: n } : s)),
  });
}

export function deleteShot(deviceId: string, id: string): void {
  setCameraSettings(deviceId, { shots: shotsOf(deviceId).filter((s) => s.id !== id) });
}

// —— Follow ———————————————————————————————————————————————————————————————————————————————

/** How often the camera's picture is looked at (frames a second ≈ 1000 / this). */
const DETECT_EVERY_MS = 80;

interface Session {
  deviceId: string;
  video: HTMLVideoElement;
  stream: MediaStream;
  lock: PersonLock;
  at?: FramePoint;
  started: boolean;
  digital: DigitalFollow | null;
  ptz: PtzFollow | null;
  timer: ReturnType<typeof setTimeout> | null;
  stopped: boolean;
}

let session: Session | null = null;

const patchFollow = (patch: Partial<FollowState>): void => {
  const f = useCameraControl.getState().follow;
  if (f) useCameraControl.setState({ follow: { ...f, ...patch } });
};

/**
 * Follow someone with a camera: the person at `at` (a click on its picture, in the picture's
 * fractions), or the one nearest the middle. Keeps going when the camera goes to Program.
 */
export async function startFollow(
  deviceId: string,
  at?: FramePoint,
  size: ShotSize = useCameraControl.getState().size,
): Promise<void> {
  if (session?.deviceId === deviceId && !session.stopped) {
    // Already following with this camera: someone else (a click on another person).
    session.lock = new PersonLock();
    session.at = at;
    session.started = false;
    patchFollow({ status: 'starting', box: null });
    return;
  }
  stopFollow();
  useCameraControl.setState({
    follow: { deviceId, size, status: 'starting', box: null },
  });
  letGo();
  const resolution = settingsOf(deviceId)?.resolution ?? 'auto';
  const h = resolution === 'auto' ? 0 : Number(resolution);
  let stream: MediaStream;
  try {
    [stream] = await Promise.all([
      navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          ...(h ? { height: { ideal: h }, width: { ideal: Math.round((h * 16) / 9) } } : {}),
        },
        audio: false,
      }),
      prepareDetector(),
    ]);
  } catch {
    patchFollow({ status: 'failed' });
    return;
  }
  if (useCameraControl.getState().follow?.deviceId !== deviceId) {
    for (const t of stream.getTracks()) t.stop();
    return;
  }
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  void video.play().catch(() => undefined);
  const isPtz = !!ptzOf(deviceId);
  session = {
    deviceId,
    video,
    stream,
    lock: new PersonLock(),
    at,
    started: false,
    digital: isPtz ? null : new DigitalFollow(size, maxZoomOf(deviceId), viewOf(deviceId)),
    ptz: isPtz ? new PtzFollow(size, useCameraControl.getState().speed) : null,
    timer: null,
    stopped: false,
  };
  void step(session);
}

/** Read afresh after an await (stopping happens elsewhere meanwhile). */
const stopped = (s: Session): boolean => s.stopped;

async function step(s: Session): Promise<void> {
  if (s.stopped) return;
  const began = performance.now();
  let people;
  try {
    people = await detectPeople(s.video);
  } catch {
    if (!stopped(s)) patchFollow({ status: 'failed' });
    return endSession(s);
  }
  // Stopped while it looked (the operator pressed Stop, or chose another camera).
  if (stopped(s)) return;
  const now = performance.now();
  if (!s.started && people.length) {
    s.started = s.lock.start(people, s.at) !== null;
  }
  const person = s.started ? s.lock.next(people, now) : null;
  if (s.ptz) {
    const sp = s.ptz.next(person, now);
    void ptz({ action: 'drive', deviceId: s.deviceId, pan: sp.pan, tilt: sp.tilt });
    void ptz({ action: 'zoom', deviceId: s.deviceId, speed: sp.zoom });
  } else if (s.digital) {
    if (person) setView(s.deviceId, s.digital.next(person, now));
    else s.digital.next(null, now);
  }
  patchFollow({
    status: person ? 'following' : s.started && !s.lock.lost(now) ? 'following' : 'lost',
    box:
      person?.box ?? (s.lock.lost(now) ? null : (useCameraControl.getState().follow?.box ?? null)),
  });
  const spent = performance.now() - began;
  s.timer = setTimeout(() => void step(s), Math.max(10, DETECT_EVERY_MS - spent));
}

function endSession(s: Session): void {
  s.stopped = true;
  if (s.timer) clearTimeout(s.timer);
  for (const t of s.stream.getTracks()) t.stop();
  s.video.srcObject = null;
  if (s.ptz) void ptz({ action: 'stop', deviceId: s.deviceId });
  if (session === s) session = null;
}

/** Reframe the person followed: Close, Waist or Full. */
export function setFollowSize(size: ShotSize): void {
  useCameraControl.setState({ size });
  patchFollow({ size });
  session?.digital?.setSize(size);
  session?.ptz?.setSize(size);
}

/** Stop following (a PTZ camera stops where it is; a digital shot stays as it is). */
export function stopFollow(): void {
  if (session) endSession(session);
  useCameraControl.setState({ follow: null });
}

function stopFollowOf(deviceId: string): void {
  if (useCameraControl.getState().follow?.deviceId === deviceId) stopFollow();
}

// Development: a hot update would leave a second copy of this store that only part of the page
// uses (the rest, listeners wired to main among them, keeps the old one), so reload the page
// instead. Main, and a stream in progress, carry on.
if (import.meta.hot) import.meta.hot.accept(() => location.reload());

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import type { DeviceAccess } from '@lampstand/ipc-contract';
import { RAW_AUDIO } from '@lampstand/renderer';
import { cmd, q } from './api';
import { attempt, useStore } from './store';

export interface InputDevice {
  deviceId: string;
  label: string;
}

/** Ask for camera/mic access once, so devices come with their real names. */
async function unlock(kind: 'videoinput' | 'audioinput' | 'audiooutput'): Promise<void> {
  try {
    const s = await navigator.mediaDevices.getUserMedia(
      kind === 'videoinput' ? { video: true } : { audio: true },
    );
    for (const t of s.getTracks()) t.stop();
  } catch {
    /* refused or no device: the list just stays empty */
  }
}

const RESCAN = 'lampstand:rescan-devices';
/** Look for devices again (after access was granted, or a device was plugged in). */
export const rescanDevices = (): void => void window.dispatchEvent(new Event(RESCAN));

/**
 * The cameras/capture cards (`videoinput`) or microphones/mixer inputs (`audioinput`) this
 * computer has, kept up to date as devices are plugged in or out.
 */
export function useInputDevices(
  kind: 'videoinput' | 'audioinput' | 'audiooutput',
): InputDevice[] | null {
  const [devices, setDevices] = useState<InputDevice[] | null>(null);
  useEffect(() => {
    let alive = true;
    const read = async (): Promise<void> => {
      const all = await navigator.mediaDevices.enumerateDevices();
      if (!alive) return;
      setDevices(
        all
          .filter((d) => d.kind === kind && d.deviceId && d.deviceId !== 'default')
          .map((d, i) => ({
            deviceId: d.deviceId,
            label:
              d.label ||
              `${kind === 'videoinput' ? 'Camera' : kind === 'audiooutput' ? 'Output' : 'Input'} ${i + 1}`,
          })),
      );
    };
    const onChange = (): void => void read();
    window.addEventListener(RESCAN, onChange);
    // Ask for access only when devices come back nameless (not yet allowed this session).
    void navigator.mediaDevices
      .enumerateDevices()
      .then((all) => all.some((d) => d.kind === kind && !d.label))
      .then((nameless) => (nameless ? unlock(kind) : undefined))
      .then(read);
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => {
      alive = false;
      navigator.mediaDevices.removeEventListener('devicechange', onChange);
      window.removeEventListener(RESCAN, onChange);
    };
  }, [kind]);
  return devices;
}

/** A device's live stream while a component shows it (previews, level meters). */
export function useDeviceStream(
  kind: 'videoinput' | 'audioinput',
  deviceId: string,
): MediaStream | null {
  const [stream, setStream] = useState<MediaStream | null>(null);
  useEffect(() => {
    let alive = true;
    let s: MediaStream | null = null;
    void navigator.mediaDevices
      .getUserMedia(
        kind === 'videoinput'
          ? { video: { deviceId: { exact: deviceId } } }
          : {
              audio: { deviceId: { exact: deviceId }, ...RAW_AUDIO },
            },
      )
      .then((got) => {
        if (!alive) {
          for (const t of got.getTracks()) t.stop();
          return;
        }
        s = got;
        setStream(got);
      })
      .catch(() => setStream(null));
    return () => {
      alive = false;
      for (const t of s?.getTracks() ?? []) t.stop();
    };
  }, [kind, deviceId]);
  return stream;
}

/** One AudioContext for every level meter (each row only adds an analyser). */
let meterCtx: AudioContext | null = null;

/**
 * A level meter for an audio stream: the loudness (peak, quick attack, gentle fall) is written
 * straight to the bar each frame, so a moving meter never re-renders its row.
 */
export function useLevelMeter(stream: MediaStream | null): {
  track: RefObject<HTMLDivElement | null>;
  bar: RefObject<HTMLDivElement | null>;
} {
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!stream) return;
    meterCtx ??= new AudioContext();
    const analyser = meterCtx.createAnalyser();
    analyser.fftSize = 512;
    const source = meterCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let level = 0;
    let shown = -1;
    let raf = 0;
    const tick = (): void => {
      analyser.getFloatTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v));
      level = Math.max(peak, level * 0.85);
      const pctNow = Math.min(100, Math.round(level * 140));
      if (pctNow !== shown) {
        shown = pctNow;
        if (bar.current) bar.current.style.width = `${pctNow}%`;
        track.current?.setAttribute(
          'aria-valuenow',
          String(Math.min(100, Math.round(level * 100))),
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
    };
  }, [stream]);
  return { track, bar };
}

/** How a camera goes on screen: kept per device on this computer. */
export interface CameraSettings {
  /** Shown instead of the device's own name ('' = the device's name). */
  name: string;
  fit: 'cover' | 'contain';
  mirror: boolean;
  resolution: 'auto' | '720' | '1080' | '2160';
  /** Left out of Media › Video input (e.g. a virtual camera nobody uses). */
  hidden: boolean;
}
export const CAMERA_FITS = ['cover', 'contain'] as const;
export const CAMERA_RESOLUTIONS = ['auto', '720', '1080', '2160'] as const;
export const DEFAULT_CAMERA: CameraSettings = {
  name: '',
  fit: 'cover',
  mirror: false,
  resolution: 'auto',
  hidden: false,
};

const CAMERAS_KEY = 'lampstand.cameras';
let cameras: Record<string, CameraSettings> = (() => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(CAMERAS_KEY) ?? '{}');
    return raw && typeof raw === 'object' ? (raw as Record<string, CameraSettings>) : {};
  } catch {
    return {};
  }
})();
const cameraListeners = new Set<() => void>();

export const cameraSettings = (deviceId: string): CameraSettings => ({
  ...DEFAULT_CAMERA,
  ...cameras[deviceId],
});

export function setCameraSettings(deviceId: string, patch: Partial<CameraSettings>): void {
  cameras = { ...cameras, [deviceId]: { ...cameraSettings(deviceId), ...patch } };
  try {
    localStorage.setItem(CAMERAS_KEY, JSON.stringify(cameras));
  } catch {
    /* private window: just for this session */
  }
  for (const l of cameraListeners) l();
}

const subscribeCameras = (l: () => void): (() => void) => {
  cameraListeners.add(l);
  return () => cameraListeners.delete(l);
};

/** Re-render when any camera's settings change (lists that filter by them). */
export const useCameraSettingsVersion = (): Record<string, CameraSettings> =>
  useSyncExternalStore(subscribeCameras, () => cameras);

/** One camera's settings, kept up to date. */
export function useCameraSettings(deviceId: string): CameraSettings {
  const all = useSyncExternalStore(
    (l) => {
      cameraListeners.add(l);
      return () => cameraListeners.delete(l);
    },
    () => cameras,
  );
  return { ...DEFAULT_CAMERA, ...all[deviceId] };
}

/** Put a camera on screen with its settings (or take any camera off with `null`). */
export function showCamera(device: InputDevice | null): Promise<unknown> {
  if (!device) return attempt(() => cmd('live.setInput', { input: null }), 'errors.input');
  const s = cameraSettings(device.deviceId);
  return attempt(
    () =>
      cmd('live.setInput', {
        input: {
          deviceId: device.deviceId,
          label: s.name || device.label,
          fit: s.fit,
          mirror: s.mirror,
          resolution: s.resolution,
        },
      }),
    'errors.input',
  );
}

/** Change a camera's settings; if it's on screen, the screen follows straight away. */
export function updateCamera(device: InputDevice, patch: Partial<CameraSettings>): void {
  setCameraSettings(device.deviceId, patch);
  if (useStore.getState().live?.program.input?.deviceId === device.deviceId)
    void showCamera(device);
}

/**
 * The OS's camera or microphone permission (macOS and Windows ask the user once), with ways to
 * ask for it, open the privacy settings, and check again. 'granted' where the OS doesn't ask.
 */
export function useDeviceAccess(kind: 'camera' | 'microphone') {
  const [status, setStatus] = useState<DeviceAccess>('unknown');
  const run = async (action: 'status' | 'ask' | 'open'): Promise<void> => {
    try {
      const r = await q('devices.access', { kind, action });
      setStatus(r.status);
      if (r.status === 'granted') rescanDevices();
    } catch {
      setStatus('unknown');
    }
  };
  useEffect(() => {
    void q('devices.access', { kind, action: 'status' }).then(
      (r) => setStatus(r.status),
      () => setStatus('unknown'),
    );
    // Coming back from System Settings: check again.
    const onFocus = (): void => void run('status');
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `run` is stable in behaviour
  }, [kind]);
  return {
    status,
    ask: () => void run('ask'),
    openSettings: () => void run('open'),
    recheck: () => {
      void run('status');
      rescanDevices();
    },
  };
}

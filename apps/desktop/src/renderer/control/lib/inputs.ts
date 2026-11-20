import type { CameraSettings, VideoInputLayer } from '@lampstand/core';
import { saveSettings } from './actions';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
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
            // Without the USB ids the system adds ("FEELWORLD USB3.0 Capture (1e4e:710f)").
            label:
              d.label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '') ||
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
      // In decibels, as a desk's meters are: -60 dB at the left, 0 dB (full scale) at the right.
      // (A plain linear bar shows a healthy -20 dB voice at a tenth of the way: "too quiet".)
      const db = level > 0 ? 20 * Math.log10(level) : -Infinity;
      const pctNow = Math.max(0, Math.min(100, Math.round(((db + 60) / 60) * 100)));
      if (pctNow !== shown) {
        shown = pctNow;
        if (bar.current) bar.current.style.width = `${pctNow}%`;
        track.current?.setAttribute('aria-valuenow', String(pctNow));
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

/** How a camera goes on screen: kept per device in the app's settings. */
export type { CameraSettings };
export const CAMERA_FITS = ['cover', 'contain'] as const;
export const CAMERA_RESOLUTIONS = ['auto', '720', '1080', '2160'] as const;
export const DEFAULT_CAMERA: CameraSettings = {
  name: '',
  fit: 'cover',
  mirror: false,
  resolution: 'auto',
  hidden: false,
};

const NO_CAMERAS: Record<string, CameraSettings> = {};
const allCameras = (): Record<string, CameraSettings> =>
  useStore.getState().settings?.cameras ?? NO_CAMERAS;

const cameraSettings = (deviceId: string): CameraSettings => ({
  ...DEFAULT_CAMERA,
  ...allCameras()[deviceId],
});

/**
 * Change a camera's settings: shown at once, then saved. Back to the defaults removes its entry.
 */
function setCameraSettings(deviceId: string, patch: Partial<CameraSettings>): void {
  const next = { ...cameraSettings(deviceId), ...patch };
  const isDefault = JSON.stringify(next) === JSON.stringify(DEFAULT_CAMERA);
  const cameras = Object.fromEntries(
    Object.entries(allCameras()).filter(([id]) => id !== deviceId),
  );
  if (!isDefault) cameras[deviceId] = next;
  const s = useStore.getState().settings;
  if (s) useStore.setState({ settings: { ...s, cameras } });
  void saveSettings({ cameras });
}

/**
 * Before camera settings were saved with the app they lived in this computer's local storage:
 * move them over once.
 */
export function migrateLocalCameras(
  saved: Record<string, CameraSettings>,
  storage: Pick<Storage, 'getItem' | 'removeItem'> | null = (() => {
    try {
      return localStorage;
    } catch {
      return null;
    }
  })(),
): Record<string, CameraSettings> | null {
  const raw = storage?.getItem('lampstand.cameras');
  if (!raw) return null;
  storage?.removeItem('lampstand.cameras');
  if (Object.keys(saved).length) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const out: Record<string, CameraSettings> = {};
    for (const [id, v] of Object.entries(parsed as Record<string, Partial<CameraSettings>>))
      out[id] = { ...DEFAULT_CAMERA, ...v };
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/** Re-render when any camera's settings change (lists that filter by them). */
export const useCameraSettingsVersion = (): Record<string, CameraSettings> =>
  useStore((s) => s.settings?.cameras ?? NO_CAMERAS);

/** One camera's settings, kept up to date. */
export function useCameraSettings(deviceId: string): CameraSettings {
  const saved = useStore((s) => s.settings?.cameras[deviceId]);
  return { ...DEFAULT_CAMERA, ...saved };
}

/** A camera as the screen layer: the device and how it's set to show (name, fit, mirror…). */
export function inputLayerFor(device: InputDevice): VideoInputLayer {
  const s = cameraSettings(device.deviceId);
  return {
    deviceId: device.deviceId,
    label: s.name || device.label,
    fit: s.fit,
    mirror: s.mirror,
    resolution: s.resolution,
  };
}

/** Put a camera on screen with its settings (or take any camera off with `null`). */
export function showCamera(device: InputDevice | null): Promise<unknown> {
  return attempt(
    () => cmd('live.setInput', { input: device ? inputLayerFor(device) : null }),
    'errors.input',
  );
}

/** Change a camera's settings; wherever it is (on screen, Preview, PiP) follows straight away. */
export function updateCamera(device: InputDevice, patch: Partial<CameraSettings>): void {
  setCameraSettings(device.deviceId, patch);
  const live = useStore.getState().live;
  const id = device.deviceId;
  if (live?.program.input?.deviceId === id) void showCamera(device);
  if (live?.switcher.preview?.deviceId === id)
    void cmd('live.switcher', { action: 'preview', input: inputLayerFor(device) });
  const pip = live?.program.pip;
  if (pip?.deviceId === id)
    void cmd('live.switcher', { action: 'pip', pip: { ...pip, ...inputLayerFor(device) } });
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

const NO_HIDDEN: readonly string[] = Object.freeze([]);

/**
 * The audio inputs the operator chose to leave out of the lists (Audio inputs › Choose). A desk
 * can show sixteen or more; only the ones used need to be there.
 */
export function useHiddenAudioInputs(): ReadonlySet<string> {
  const hidden = useStore((s) => s.settings?.hiddenAudioInputs ?? NO_HIDDEN);
  return useMemo(() => new Set(hidden), [hidden]);
}

/** Show or leave out one audio input. */
export function setAudioInputShown(deviceId: string, shown: boolean): void {
  const hidden = useStore.getState().settings?.hiddenAudioInputs ?? [];
  const next = shown ? hidden.filter((id) => id !== deviceId) : [...new Set([...hidden, deviceId])];
  void saveSettings({ hiddenAudioInputs: next });
}

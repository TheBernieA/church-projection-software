import { useEffect, useRef, useState, type RefObject } from 'react';
import { RAW_AUDIO } from '@lampstand/renderer';

export interface InputDevice {
  deviceId: string;
  label: string;
}

/** Ask for camera/mic access once, so devices come with their real names. */
async function unlock(kind: 'videoinput' | 'audioinput'): Promise<void> {
  try {
    const s = await navigator.mediaDevices.getUserMedia(
      kind === 'videoinput' ? { video: true } : { audio: true },
    );
    for (const t of s.getTracks()) t.stop();
  } catch {
    /* refused or no device: the list just stays empty */
  }
}

/**
 * The cameras/capture cards (`videoinput`) or microphones/mixer inputs (`audioinput`) this
 * computer has, kept up to date as devices are plugged in or out.
 */
export function useInputDevices(kind: 'videoinput' | 'audioinput'): InputDevice[] | null {
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
            label: d.label || `${kind === 'videoinput' ? 'Camera' : 'Input'} ${i + 1}`,
          })),
      );
    };
    const onChange = (): void => void read();
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

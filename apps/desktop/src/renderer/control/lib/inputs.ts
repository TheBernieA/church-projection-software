import { useEffect, useState } from 'react';

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
    void unlock(kind).then(read);
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
              audio: {
                deviceId: { exact: deviceId },
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              },
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

/** How loud an audio stream is right now, 0–1 (peak), for a level meter. */
export function useLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream) return;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;
    const tick = (): void => {
      analyser.getFloatTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v));
      setLevel((prev) => Math.max(peak, prev * 0.85)); // quick attack, gentle fall
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      void ctx.close();
    };
  }, [stream]);
  return level;
}

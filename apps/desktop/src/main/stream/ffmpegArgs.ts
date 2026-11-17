/**
 * Pure helpers for the stream encoder: ffmpeg's command line, its progress lines, destination
 * URLs and recording names. No I/O here (beyond checking a name is free), so it is all
 * unit-tested.
 */
import { existsSync } from 'node:fs';

export type DestinationKind = 'youtube' | 'facebook' | 'custom';

/** Where each kind of service takes a stream (the key is appended). */
export const INGEST: Record<Exclude<DestinationKind, 'custom'>, string> = {
  // RTMPS on port 443: encrypted, and it gets through networks that block RTMP's port 1935.
  youtube: 'rtmps://a.rtmps.youtube.com:443/live2',
  facebook: 'rtmps://live-api-s.facebook.com:443/rtmp',
};

/** H.264 encoders we know how to drive, best first per platform; libx264 always works. */
export const ENCODER_PREFERENCE = [
  'h264_videotoolbox',
  'h264_nvenc',
  'h264_qsv',
  'h264_amf',
  'libx264',
] as const;
export type Encoder = (typeof ENCODER_PREFERENCE)[number];

/** Only RTMP(S) ingest addresses, with a host. */
export function isStreamUrl(url: string): boolean {
  if (!/^rtmps?:\/\/\S+$/i.test(url)) return false;
  try {
    return new URL(url).hostname.length > 0;
  } catch {
    return false;
  }
}

/** A stream key: printable, no spaces or slashes (it goes at the end of a URL). */
export const isStreamKey = (key: string): boolean =>
  /^[\x21-\x7e]{1,300}$/.test(key) && !/[/\\]/.test(key);

/**
 * A stream key as people paste it, cleaned up: line breaks, spaces and invisible characters
 * (zero-width spaces, which web pages often carry along when copied) are removed, and when the
 * whole address was pasted ("rtmp://a.rtmp.youtube.com/live2/abcd-…") only the key at its end
 * is kept.
 */
export function cleanStreamKey(input: string): string {
  let k = input.replace(/[\s\u200B-\u200D\u2060\uFEFF\u00AD]/g, '');
  if (/^rtmps?:\/\//i.test(k)) k = k.slice(k.lastIndexOf('/') + 1);
  return k;
}

/** An ffmpeg log line with any stream key hidden (the last part of an rtmp(s) address). */
export const redactKeys = (line: string): string =>
  line.replace(/(rtmps?:\/\/[^\s'"|\]]*\/)[^\s'"|\]/]+/gi, '$1•••');

/**
 * Why a destination stopped, in ffmpeg's words: the tee's own reason ("Broken pipe",
 * "Input/output error") and the RTMP server's message just before it, if any. Keys hidden.
 */
export function destinationFailure(line: string, before: readonly string[]): string {
  const after = line.split(/failed:/i)[1] ?? '';
  const own = after.split(', continuing')[0]?.trim() ?? '';
  const server = [...before]
    .reverse()
    .find(
      (l) =>
        /rtmp|server|error|denied|refused|unauthor|reset|timed out/i.test(l) && !/^frame=/.test(l),
    );
  const text = [server?.replace(/^\[[^\]]+\]\s*/, ''), own].filter(Boolean).join(' — ');
  return redactKeys(text).slice(0, 300);
}

/**
 * A second way in, tried when the first can't connect: YouTube over plain RTMP (port 1935) when
 * RTMPS on 443 fails (some older TLS setups or proxies), and the other way round.
 */
export const INGEST_FALLBACK: Partial<Record<Exclude<DestinationKind, 'custom'>, string>> = {
  youtube: 'rtmp://a.rtmp.youtube.com/live2',
};

/** The full ingest address for a destination (its fallback address with `alt`). */
export function destinationUrl(
  kind: DestinationKind,
  url: string,
  key: string | null,
  alt = false,
): string {
  const fallback = kind === 'custom' ? undefined : INGEST_FALLBACK[kind];
  const base = (kind === 'custom' ? url : alt && fallback ? fallback : INGEST[kind]).replace(
    /\/+$/,
    '',
  );
  return key ? `${base}/${key}` : base;
}

/** The best encoder this ffmpeg has (or the one asked for, if it has it). */
export function pickEncoder(available: readonly string[], wanted: string = 'auto'): Encoder {
  if (
    wanted !== 'auto' &&
    (ENCODER_PREFERENCE as readonly string[]).includes(wanted) &&
    available.includes(wanted)
  )
    return wanted as Encoder;
  return ENCODER_PREFERENCE.find((e) => available.includes(e)) ?? 'libx264';
}

/** Escape a tee slave's target: `\`, `|`, `[` and `]` are special to the tee muxer. */
export const teeEscape = (s: string): string => s.replace(/[\\|[\]]/g, (c) => `\\${c}`);

export interface EncodeOptions {
  width: number;
  height: number;
  fps: number;
  videoKbps: number;
  audioKbps: number;
  encoder: Encoder;
  /**
   * What arrives on stdin: raw BGRA frames to encode ('raw', the CPU pipeline), or H.264 already
   * encoded on the GPU ('h264'), which is only packaged (no re-encoding).
   */
  input?: 'raw' | 'h264';
  /** libx264's speed preset (from the performance mode). Hardware encoders ignore it. */
  x264Preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'faster';
  /** Full ingest URLs (keys included). */
  streams: string[];
  /** Recording file path, or null. */
  record: string | null;
}

/** VideoToolbox, NVENC and Quick Sync work in NV12. */
const takesNv12 = (e: Encoder): boolean =>
  e === 'h264_videotoolbox' || e === 'h264_nvenc' || e === 'h264_qsv';

/** Encoder settings: constant bitrate-ish, a keyframe every 2 s, no B-frame surprises. */
export function videoCodecArgs(
  o: Pick<EncodeOptions, 'encoder' | 'fps' | 'videoKbps' | 'x264Preset'>,
): string[] {
  const rate = [
    `-b:v`,
    `${o.videoKbps}k`,
    '-maxrate',
    `${o.videoKbps}k`,
    '-bufsize',
    `${o.videoKbps * 2}k`,
  ];
  const gop = ['-g', String(o.fps * 2), '-keyint_min', String(o.fps * 2)];
  switch (o.encoder) {
    case 'h264_videotoolbox':
      return [
        '-c:v',
        'h264_videotoolbox',
        '-realtime',
        '1',
        '-allow_sw',
        '1',
        '-profile:v',
        'high',
        ...rate,
        ...gop,
      ];
    case 'h264_nvenc':
      return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-tune', 'll', '-rc', 'cbr', ...rate, ...gop];
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-preset', 'veryfast', ...rate, ...gop];
    case 'h264_amf':
      return ['-c:v', 'h264_amf', '-usage', 'lowlatency', '-rc', 'cbr', ...rate, ...gop];
    case 'libx264':
      return [
        '-c:v',
        'libx264',
        '-preset',
        o.x264Preset ?? 'veryfast',
        '-tune',
        'zerolatency',
        '-profile:v',
        'high',
        '-sc_threshold',
        '0',
        ...rate,
        ...gop,
      ];
  }
}

/**
 * ffmpeg's arguments: raw BGRA frames on stdin (pipe:0), sent at a steady frame rate (the last
 * frame repeats when nothing changed), and float PCM on fd 3, timed by its sample count; encode
 * once; send to every stream (FLV, each allowed
 * to fail on its own) and to the recording (fragmented MP4, playable even after a crash).
 */
export function buildArgs(o: EncodeOptions): string[] {
  const gpu = o.input === 'h264';
  const outputs = [
    ...o.streams.map((u) => `[f=flv:onfail=ignore:flvflags=no_duration_filesize]${teeEscape(u)}`),
    ...(o.record
      ? [`[f=mp4:movflags=+frag_keyframe+empty_moov+default_base_moof]${teeEscape(o.record)}`]
      : []),
  ];
  return [
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'info',
    '-stats_period',
    '1',
    // Video: the stream window's frames (raw), or its hardware-encoded H.264.
    '-thread_queue_size',
    '512',
    ...(gpu
      ? // Start at once: the size is in the first keyframe (a still picture encodes so small
        // that ffmpeg's usual 5 MB look-ahead would take minutes to fill).
        [
          '-probesize',
          '32',
          '-analyzeduration',
          '0',
          '-fflags',
          '+genpts',
          // Raw H.264 carries no times: stamp arrivals so ffmpeg reads the sound alongside (else
          // it only ever reads video, and the sound pipe stalls). Output times come from the
          // frame count below.
          '-use_wallclock_as_timestamps',
          '1',
          '-f',
          'h264',
          '-framerate',
          String(o.fps),
          '-i',
          'pipe:0',
        ]
      : [
          '-f',
          'rawvideo',
          '-pix_fmt',
          'bgra',
          '-s',
          `${o.width}x${o.height}`,
          '-r',
          String(o.fps),
          '-i',
          'pipe:0',
        ]),
    // Sound: its mix, 48 kHz stereo float.
    '-thread_queue_size',
    '512',
    '-f',
    'f32le',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-i',
    'pipe:3',
    '-map',
    '0:v',
    '-map',
    '1:a',
    ...(gpu
      ? // Already encoded: copy it, stamping each frame's time from its number (raw H.264 has none).
        ['-c:v', 'copy', '-bsf:v', `setts=pts=N/(${o.fps}*TB):dts=N/(${o.fps}*TB)`]
      : [
          // Hardware encoders take NV12 natively (no second conversion inside the encoder).
          '-pix_fmt',
          takesNv12(o.encoder) ? 'nv12' : 'yuv420p',
          '-r',
          String(o.fps),
          '-fps_mode',
          'cfr',
          ...videoCodecArgs(o),
        ]),
    '-c:a',
    'aac',
    '-b:a',
    `${o.audioKbps}k`,
    '-ar',
    '48000',
    '-ac',
    '2',
    '-flags',
    '+global_header',
    '-f',
    'tee',
    outputs.join('|'),
  ];
}

export interface Progress {
  fps: number;
  kbps: number;
  speed: number;
  dropped: number;
  /** Seconds encoded. */
  time: number;
}

/** Read one of ffmpeg's `frame= … fps= … bitrate= … speed=` lines (null if it isn't one). */
export function parseProgress(line: string): Progress | null {
  if (!/frame=\s*\d+/.test(line)) return null;
  const num = (re: RegExp): number => {
    const m = re.exec(line);
    return m?.[1] ? Number(m[1]) : 0;
  };
  const t = /time=\s*(-?\d+):(\d\d):([\d.]+)/.exec(line);
  return {
    fps: num(/fps=\s*([\d.]+)/),
    kbps: num(/bitrate=\s*([\d.]+)kbits\/s/),
    speed: num(/speed=\s*([\d.]+)x/),
    dropped: num(/drop=\s*(\d+)/),
    time: t ? Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3]) : 0,
  };
}

/** "Lampstand 2026-11-16 20-41.mp4" (with " part 2" after a restart). */
export function recordingName(at: Date, part = 1): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())} ${p(at.getHours())}-${p(at.getMinutes())}`;
  return `Lampstand ${stamp}${part > 1 ? ` part ${part}` : ''}.mp4`;
}

/** A file name nothing else is using: "x.mp4", else "x (2).mp4", "x (3).mp4"… */
export function freeName(path: string, exists: (p: string) => boolean = existsSync): string {
  if (!exists(path)) return path;
  const dot = path.lastIndexOf('.');
  for (let n = 2; ; n++) {
    const next = `${path.slice(0, dot)} (${n})${path.slice(dot)}`;
    if (!exists(next)) return next;
  }
}

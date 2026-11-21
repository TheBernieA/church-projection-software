/**
 * Pure helpers for the stream encoder: ffmpeg's command line, its progress lines, destination
 * URLs and recording names. No I/O here (beyond checking a name is free), so it is all
 * unit-tested.
 */
import { existsSync } from 'node:fs';
import { STREAM_ENCODERS, type StreamDestination, type StreamEncoderId } from '@lampstand/core';

type DestinationKind = StreamDestination['kind'];
type ServiceKind = Exclude<DestinationKind, 'custom' | 'direct'>;

/** Where each kind of service takes a stream (the key is appended). */
const INGEST: Record<ServiceKind, string> = {
  // RTMPS on port 443: encrypted, and it gets through networks that block RTMP's port 1935.
  youtube: 'rtmps://a.rtmps.youtube.com:443/live2',
  facebook: 'rtmps://live-api-s.facebook.com:443/rtmp',
};

/** H.264 encoders we know how to drive, best first per platform; libx264 always works. */
const ENCODER_PREFERENCE = STREAM_ENCODERS;
export type Encoder = StreamEncoderId;

/** Only RTMP(S) ingest addresses, with a host. */
export function isStreamUrl(url: string): boolean {
  if (!/^rtmps?:\/\/\S+$/i.test(url)) return false;
  try {
    return new URL(url).hostname.length > 0;
  } catch {
    return false;
  }
}

/** A direct link's address: srt://host:port or udp://host:port (options may follow a "?"). */
export function isDirectUrl(url: string): boolean {
  if (!/^(srt|udp):\/\/[\x21-\x7e]+$/i.test(url)) return false;
  try {
    // Read as http so the host and port are parsed the standard way.
    const u = new URL(url.replace(/^(srt|udp):/i, 'http:'));
    const port = Number(u.port);
    return u.hostname.length > 0 && port > 0 && port < 65536 && u.pathname === '/' && !u.username;
  } catch {
    return false;
  }
}

/** Which protocol a destination address uses ('rtmp' covers rtmps). */
export const protocolOf = (url: string): 'srt' | 'udp' | 'rtmp' =>
  /^srt:/i.test(url) ? 'srt' : /^udp:/i.test(url) ? 'udp' : 'rtmp';

/**
 * A direct link's address with what a low-delay link needs, unless the address already says:
 * network packets sized for MPEG-TS, and for SRT, calling the receiver with a 120 ms window for
 * resending lost packets (ffmpeg takes it in microseconds).
 */
export function directUrl(url: string): string {
  const [base = '', query = ''] = url.trim().split('?');
  const given = new Set(query.split('&').map((p) => p.split('=')[0]));
  const wanted: [string, string][] =
    protocolOf(base) === 'srt'
      ? [
          ['mode', 'caller'],
          ['latency', '120000'],
          ['pkt_size', '1316'],
        ]
      : [['pkt_size', '1316']];
  const add = wanted.filter(([k]) => !given.has(k)).map(([k, v]) => `${k}=${v}`);
  const all = [query, ...add].filter(Boolean).join('&');
  return all ? `${base}?${all}` : base;
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
  // Keep only printable ASCII: drops spaces, line breaks, invisible characters, and anything
  // exotic a web page slipped in.
  let k = input.replace(/[^\x21-\x7e]/g, '');
  // An address (or part of one) was pasted: the key is what follows the last slash.
  if (k.includes('/')) {
    k = k.replace(/\/+$/, '');
    k = k.slice(k.lastIndexOf('/') + 1);
    // Only the server address ("…/live2", YouTube's "Stream URL"): there's no key in it.
    if (['', 'live', 'live2', 'rtmp', 'app'].includes(k.toLowerCase()) || k.includes(':'))
      return '';
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(k)) return ''; // just a host name
  }
  return k.replace(/\\/g, '');
}

/**
 * What a rejected paste looked like, without its content: letters as "a", digits as "9", other
 * characters kept (so the log can show "aaaa://a.aaaa.aaa/aaaa9" but never a key).
 */
export const pasteShape = (input: string): string =>
  input
    .slice(0, 120)
    .replace(/[a-z]/gi, 'a')
    .replace(/[0-9]/g, '9')
    .replace(/[^\x20-\x7e]/g, '?');

/**
 * Could this be a key for that service? Catches the common mix-ups (the "Stream URL" pasted as
 * the key, a few stray characters) without knowing the exact format: YouTube's keys are groups
 * of letters and digits joined by dashes, 16 characters or more.
 */
export function plausibleKey(kind: DestinationKind, key: string): boolean {
  if (kind === 'youtube') {
    const groups = key.split('-');
    return key.length >= 16 && groups.length >= 2 && groups.every((g) => /^[a-z0-9]+$/i.test(g));
  }
  if (kind === 'facebook') return key.length >= 16;
  return true;
}

/** An ffmpeg log line with any stream key hidden (the last part of an rtmp(s) address). */
export const redactKeys = (line: string): string =>
  line
    .replace(/(rtmps?:\/\/[^\s'"|\]]*\/)[^\s'"|\]/]+/gi, '$1•••')
    .replace(/((?:passphrase|streamid)=)[^\s'"|\]&]+/gi, '$1•••');

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
const INGEST_FALLBACK: Partial<Record<ServiceKind, string>> = {
  youtube: 'rtmp://a.rtmp.youtube.com/live2',
};

/** Does this kind of destination have a second address to try? */
export const hasFallbackIngest = (kind: DestinationKind): boolean =>
  kind !== 'custom' && kind !== 'direct' && !!INGEST_FALLBACK[kind];

/** The full ingest address for a destination (its fallback address with `alt`). */
export function destinationUrl(
  kind: DestinationKind,
  url: string,
  key: string | null,
  alt = false,
): string {
  if (kind === 'direct') return directUrl(url);
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

/** Escape a tee slave's target: `\`, `|`, `[`, `]` and `'` are special to the tee muxer. */
export const teeEscape = (s: string): string => s.replace(/[\\|[\]']/g, (c) => `\\${c}`);

export interface EncodeOptions {
  width: number;
  height: number;
  fps: number;
  videoKbps: number;
  audioKbps: number;
  encoder: Encoder;
  /**
   * What arrives on stdin: raw BGRA frames to encode ('raw', the CPU pipeline), or H.264 already
   * encoded on the GPU, in FLV with each frame's real timestamp ('flv'), which is only packaged
   * (no re-encoding).
   */
  input?: 'raw' | 'flv';
  /** Certificate checking for secure destinations (see TlsOptions); ffmpeg's own default if unset. */
  tls?: TlsOptions;
  /** The AAC encoder: Apple's where this ffmpeg has it (better sound), else ffmpeg's own. */
  audioEncoder?: 'aac' | 'aac_at';
  /** libx264's speed preset (from the performance mode). Hardware encoders ignore it. */
  x264Preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'faster';
  /** Full destination URLs (keys included): RTMP(S) services, and SRT/UDP direct links. */
  streams: string[];
  /** Recording file path, or null. */
  record: string | null;
}

/** VideoToolbox, NVENC, Quick Sync and Media Foundation work in NV12. */
const takesNv12 = (e: Encoder): boolean =>
  e === 'h264_videotoolbox' || e === 'h264_nvenc' || e === 'h264_qsv' || e === 'h264_mf';

/**
 * BGRA frames to the encoder's YUV, as HD colour (BT.709, limited range: what players and
 * services assume), converted accurately and labelled so. Hardware encoders take NV12 natively
 * (no second conversion inside them).
 */
export const colourFilter = (e: Encoder): string =>
  `scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd,format=${takesNv12(e) ? 'nv12' : 'yuv420p'},setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv`;

/**
 * Encoder settings: constant bitrate-ish, a keyframe every 2 s, High profile (sharper text), and
 * no B-frames or frame queueing inside the encoder (each adds delay).
 */
export function videoCodecArgs(
  o: Pick<EncodeOptions, 'encoder' | 'fps' | 'videoKbps' | 'x264Preset'>,
): string[] {
  const rate = [
    `-b:v`,
    `${o.videoKbps}k`,
    '-maxrate',
    `${o.videoKbps}k`,
    // A one-second rate buffer (as OBS uses): keyframe bursts stay small, so on an upload near
    // its limit they don't queue for long.
    '-bufsize',
    `${o.videoKbps}k`,
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
      return [
        '-c:v',
        'h264_nvenc',
        '-preset',
        'p4',
        '-tune',
        'll',
        '-rc',
        'cbr',
        '-profile:v',
        'high',
        '-bf',
        '0',
        '-zerolatency',
        '1',
        ...rate,
        ...gop,
      ];
    case 'h264_qsv':
      return [
        '-c:v',
        'h264_qsv',
        '-preset',
        'veryfast',
        '-profile:v',
        'high',
        '-bf',
        '0',
        '-async_depth',
        '1',
        ...rate,
        ...gop,
      ];
    case 'h264_amf':
      return [
        '-c:v',
        'h264_amf',
        '-usage',
        'lowlatency',
        '-rc',
        'cbr',
        '-profile:v',
        'high',
        '-bf',
        '0',
        ...rate,
        ...gop,
      ];
    case 'h264_mf':
      // Windows' Media Foundation: whatever hardware encoder the graphics driver provides (Intel,
      // AMD, NVIDIA, Qualcomm), where ffmpeg's own route to it doesn't work. Hardware only
      // (Windows' software one is poor); constant frame rate (camera_record) so it doesn't drop
      // frames; High profile by number (its own default is Baseline).
      return [
        '-c:v',
        'h264_mf',
        '-hw_encoding',
        '1',
        '-rate_control',
        'cbr',
        '-scenario',
        'camera_record',
        '-profile:v',
        '100',
        '-bf',
        '0',
        ...rate,
        ...gop,
      ];
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
 * How each kind of destination is packaged. Services take FLV over RTMP; direct links take
 * MPEG-TS (H.264 in the form it needs, timestamps only 0.1 s ahead of the clock so the receiver
 * has no reason to wait). Each may fail on its own.
 */
const STREAM_OPTIONS = {
  flv: 'f=flv:onfail=ignore:flvflags=no_duration_filesize:flush_packets=1:tcp_nodelay=1',
  // pes_payload_size=0: each sound frame goes out on its own (not gathered for up to 50 ms).
  ts: 'f=mpegts:onfail=ignore:flush_packets=1:max_delay=100000:pes_payload_size=0:bsfs/v=h264_mp4toannexb',
} as const;

/**
 * How a secure (rtmps) destination checks the server's certificate, for an ffmpeg whose TLS
 * library has no trust store of its own (mbedTLS, in Lampstand's Mac build): the trusted root
 * certificates' file, or not checking at all.
 */
export interface TlsOptions {
  caFile?: string;
  verify?: boolean;
}

/** A tee slave option's value: escaped for the option parser, then for the tee itself. */
const teeOptionValue = (s: string): string => s.replace(/[\\:'=\]]/g, (c) => `\\${c}`);

/**
 * A silent network drop (a pulled cable, Wi-Fi gone, the router down): the connection just stops
 * moving and nothing says so, so ffmpeg would wait minutes for the system to give up, the
 * stream frozen for viewers and the console still saying Live. Two limits make it a destination
 * failure within seconds (handled like any other: reconnecting quietly, the recording going on):
 * a write that waits this long fails, and the system may hold only about a second of the stream
 * (its send buffer), so a dead connection fills it quickly. A second is plenty for any upload
 * that can carry the stream at all (round trips of up to a second).
 */
export const STALLED_WRITE_US = 5_000_000;
export const sendBufferBytes = (kbps: number): number =>
  Math.max(128 * 1024, Math.round((kbps * 1000) / 8));

/** The tee options for one destination. */
function streamOptions(
  url: string,
  o: Pick<EncodeOptions, 'tls' | 'videoKbps' | 'audioKbps'>,
): string {
  if (protocolOf(url) !== 'rtmp') return STREAM_OPTIONS.ts;
  const extra = [
    `rw_timeout=${STALLED_WRITE_US}`,
    `send_buffer_size=${sendBufferBytes(o.videoKbps + o.audioKbps)}`,
    ...(o.tls && /^rtmps:/i.test(url)
      ? [
          ...(o.tls.caFile ? [`ca_file=${teeOptionValue(o.tls.caFile)}`] : []),
          ...(o.tls.verify === false ? ['tls_verify=0'] : []),
        ]
      : []),
  ];
  return [STREAM_OPTIONS.flv, ...extra].join(':');
}

/**
 * Did this encoder fail (not the stream)? Only what the encoder itself reports as an error, or
 * ffmpeg saying it couldn't open it, counts. Its name alone isn't enough: ffmpeg names it on
 * every start ("Stream #0:0 -> #0:0 (… -> h264 (h264_qsv))"), so a destination that refuses
 * the connection would otherwise get a working hardware encoder dropped for the session.
 */
export function encoderFailed(lines: readonly string[], encoder: string): boolean {
  return lines.some(
    (l) =>
      /error while opening encoder|error initializing output stream/i.test(l) ||
      (l.includes(`${encoder} @`) &&
        /error|fail|unsupported|cannot|could not|not (available|supported|found)|no device/i.test(
          l,
        )),
  );
}

/**
 * ffmpeg's arguments: raw BGRA frames on stdin (pipe:0), sent at a steady frame rate (the last
 * frame repeats when nothing changed), and float PCM on fd 3, timed by its sample count; encode
 * once; send to every stream (FLV, each allowed
 * to fail on its own) and to the recording (fragmented MP4, playable even after a crash).
 */
export function buildArgs(o: EncodeOptions): string[] {
  const gpu = o.input === 'flv';
  const outputs = [
    // Each packet goes out at once: no batching in the muxer, none in the network stack.
    ...o.streams.map((u) => `[${teeEscape(streamOptions(u, o))}]${teeEscape(u)}`),
    // The recording writes through its own queue: a slow disk never holds up the live outputs
    // (the queue waits rather than drops, so the file stays whole).
    ...(o.record
      ? [
          `[f=mp4:use_fifo=1:fifo_options=queue_size=120:movflags=+frag_keyframe+empty_moov+default_base_moof]${teeEscape(o.record)}`,
        ]
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
    // A short queue (about half a second): when a destination can't keep up, the app must feel
    // it at once and skip frames, rather than let seconds of delay pile up inside ffmpeg.
    '-thread_queue_size',
    // Raw pictures are big and already held in the pipe: a few is plenty (less delay). Encoded
    // frames are small: about half a second.
    String(gpu ? Math.max(8, Math.round(o.fps / 2)) : 8),
    ...(gpu
      ? // Encoded frames in FLV, each with its real time. Start at once (the picture size is in
        // the first tag), and don't hold packets back to study them.
        ['-probesize', '1024', '-analyzeduration', '0', '-f', 'flv', '-i', 'pipe:0']
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
    // Sound: its mix, 48 kHz stereo float (the same half-second queue).
    '-thread_queue_size',
    '24',
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
      ? // Already encoded, already timed: copy it.
        ['-c:v', 'copy']
      : [
          '-vf',
          colourFilter(o.encoder),
          '-r',
          String(o.fps),
          '-fps_mode',
          'cfr',
          ...videoCodecArgs(o),
        ]),
    ...(o.audioEncoder === 'aac_at' ? ['-c:a', 'aac_at', '-aac_at_mode', 'cbr'] : ['-c:a', 'aac']),
    '-b:a',
    `${o.audioKbps}k`,
    '-ar',
    '48000',
    '-ac',
    '2',
    '-flags',
    '+global_header',
    // Send each packet as soon as it's ready (no batching in the muxers).
    '-flush_packets',
    '1',
    '-max_interleave_delta',
    '500000',
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

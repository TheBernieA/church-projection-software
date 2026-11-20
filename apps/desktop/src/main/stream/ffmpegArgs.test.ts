import { describe, expect, it } from 'vitest';
import {
  buildArgs,
  cleanStreamKey,
  destinationFailure,
  redactKeys,
  destinationUrl,
  directUrl,
  isDirectUrl,
  freeName,
  isStreamKey,
  isStreamUrl,
  parseProgress,
  pasteShape,
  pickEncoder,
  plausibleKey,
  recordingName,
  teeEscape,
  type EncodeOptions,
} from './ffmpegArgs';

const base: EncodeOptions = {
  width: 1280,
  height: 720,
  fps: 30,
  videoKbps: 3500,
  audioKbps: 160,
  encoder: 'libx264',
  streams: [],
  record: null,
};

describe('stream encoder arguments', () => {
  it('reads frames from stdin and sound from fd 3, and keyframes every 2 s', () => {
    const a = buildArgs({ ...base, record: '/tmp/a.mp4' });
    expect(a.join(' ')).toContain('-f rawvideo -pix_fmt bgra -s 1280x720 -r 30 -i pipe:0');
    expect(a.join(' ')).toContain('-f f32le -ar 48000 -ac 2 -i pipe:3');
    expect(a[a.indexOf('-g') + 1]).toBe('60');
    // The recording writes through its own queue, so a slow disk can't hold up the stream.
    expect(a.at(-1)).toBe(
      '[f=mp4:use_fifo=1:fifo_options=queue_size=120:movflags=+frag_keyframe+empty_moov+default_base_moof]/tmp/a.mp4',
    );
  });

  it('sends to every destination, each allowed to fail alone, plus the recording', () => {
    const a = buildArgs({
      ...base,
      streams: ['rtmp://a/live2/k1', 'rtmps://b:443/rtmp/k2'],
      record: '/tmp/r.mp4',
    });
    const out = a.at(-1) ?? '';
    expect(out.split('|')).toHaveLength(3);
    expect(out).toContain(
      '[f=flv:onfail=ignore:flvflags=no_duration_filesize:flush_packets=1:tcp_nodelay=1]rtmp://a/live2/k1',
    );
  });

  it('uses Apple’s AAC encoder when ffmpeg has it', () => {
    expect(buildArgs({ ...base, audioEncoder: 'aac_at' }).join(' ')).toContain(
      '-c:a aac_at -aac_at_mode cbr',
    );
    expect(buildArgs(base).join(' ')).toContain('-c:a aac');
  });

  it('hardware encoders: High profile, no B-frames, a one-second rate buffer', () => {
    for (const encoder of ['h264_nvenc', 'h264_qsv', 'h264_amf'] as const) {
      const a = buildArgs({ ...base, encoder }).join(' ');
      expect(a).toContain('-profile:v high');
      expect(a).toContain('-bf 0');
      expect(a).toContain(`-bufsize ${base.videoKbps}k`);
    }
  });

  it('uses each hardware encoder by name', () => {
    expect(buildArgs({ ...base, encoder: 'h264_videotoolbox' })).toContain('h264_videotoolbox');
    expect(buildArgs({ ...base, encoder: 'h264_nvenc' })).toContain('h264_nvenc');
  });

  it('converts to HD colour (BT.709), labelled; NV12 for hardware, yuv420p for x264; the preset follows the mode', () => {
    const filter = (a: string[]) => a[a.indexOf('-vf') + 1] ?? '';
    const vt = buildArgs({ ...base, encoder: 'h264_videotoolbox' });
    expect(filter(vt)).toContain('out_color_matrix=bt709');
    expect(filter(vt)).toContain('format=nv12');
    expect(filter(vt)).toContain(
      'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709',
    );
    const sw = buildArgs({ ...base, encoder: 'libx264', x264Preset: 'superfast' });
    expect(filter(sw)).toContain('format=yuv420p');
    expect(sw[sw.indexOf('-preset') + 1]).toBe('superfast');
    expect(buildArgs({ ...base, width: 960, height: 540 }).join(' ')).toContain('-s 960x540');
  });

  it('packages GPU-encoded video (FLV, already timed) without re-encoding', () => {
    const a = buildArgs({ ...base, fps: 60, input: 'flv', record: '/tmp/r.mp4' }).join(' ');
    expect(a).toContain('-probesize 1024 -analyzeduration 0 -f flv -i pipe:0');
    expect(a).toContain('-c:v copy');
    expect(a).not.toContain('rawvideo');
    expect(a).not.toContain('-vf');
    expect(a).not.toContain('setts');
    expect(a).toContain('-c:a aac');
    expect(a).toContain('-flush_packets 1');
  });

  it('escapes tee specials', () => {
    expect(teeEscape('a|b[c]\\d')).toBe('a\\|b\\[c\\]\\\\d');
  });
});

describe('destination failures', () => {
  it('says why, with the key hidden', () => {
    const before = [
      'frame=  30 fps= 30 q=-1.0 size=N/A time=00:00:01.00',
      '[rtmp @ 0x1] Server error: Stream key rtmp://a.rtmp.youtube.com/live2/abcd-efgh rejected',
    ];
    const why = destinationFailure(
      '[tee @ 0x2] Slave muxer #0 failed: Input/output error, continuing with 1/2 slaves.',
      before,
    );
    expect(why).toBe(
      'Server error: Stream key rtmp://a.rtmp.youtube.com/live2/••• rejected — Input/output error',
    );
    expect(why).not.toContain('abcd-efgh');
    expect(
      redactKeys("Slave '[f=flv]rtmps://live-api-s.facebook.com:443/rtmp/FB-1?s=2' failed"),
    ).toBe("Slave '[f=flv]rtmps://live-api-s.facebook.com:443/rtmp/•••' failed");
  });
});

describe('pasted stream keys', () => {
  it('cleans up keys as people paste them', () => {
    expect(cleanStreamKey('  abcd-efgh-ijkl-mnop-qrst\n')).toBe('abcd-efgh-ijkl-mnop-qrst');
    expect(cleanStreamKey('abcd-efgh\u200B-ijkl')).toBe('abcd-efgh-ijkl');
    expect(cleanStreamKey('abcd efgh')).toBe('abcdefgh');
    expect(cleanStreamKey('rtmp://a.rtmp.youtube.com/live2/abcd-efgh-ijkl')).toBe('abcd-efgh-ijkl');
    expect(
      cleanStreamKey('rtmps://live-api-s.facebook.com:443/rtmp/FB-123-0-Ab?s_bl=1&s_psm=1'),
    ).toBe('FB-123-0-Ab?s_bl=1&s_psm=1');
    expect(isStreamKey(cleanStreamKey('FB-123-0-Ab?s_bl=1&s_psm=1'))).toBe(true);
    // Odd pastes still give the key: part of an address, smart quotes, a backslash.
    expect(cleanStreamKey('live2/abcd-efgh-ijkl-mnop')).toBe('abcd-efgh-ijkl-mnop');
    expect(cleanStreamKey('“abcd-efgh-ijkl-mnop”')).toBe('abcd-efgh-ijkl-mnop');
    expect(cleanStreamKey('a.rtmp.youtube.com/live2')).toBe('');
    expect(cleanStreamKey('rtmp://a.rtmp.youtube.com')).toBe('');
    expect(pasteShape('rtmp://a.b.com/live2/ab12-cd34')).toBe('aaaa://a.a.aaa/aaaa9/aa99-aa99');
    // The "Stream URL" alone is not a key.
    expect(cleanStreamKey('rtmp://a.rtmp.youtube.com/live2')).toBe('');
    expect(cleanStreamKey('rtmps://a.rtmps.youtube.com:443/live2/')).toBe('');
    expect(plausibleKey('youtube', 'abcd-efgh-ijkl-mnop-qrst')).toBe(true);
    expect(plausibleKey('youtube', 'live2')).toBe(false);
    expect(plausibleKey('youtube', 'abcdefgh')).toBe(false);
    expect(plausibleKey('custom', 'x')).toBe(true);
  });
});

describe('recording names', () => {
  it('never overwrites an earlier recording from the same minute', () => {
    const taken = new Set(['/r/a.mp4', '/r/a (2).mp4']);
    expect(freeName('/r/b.mp4', (p) => taken.has(p))).toBe('/r/b.mp4');
    expect(freeName('/r/a.mp4', (p) => taken.has(p))).toBe('/r/a (3).mp4');
  });
});

describe('encoder choice', () => {
  it('prefers hardware, falls back to libx264, honours a choice it can do', () => {
    expect(pickEncoder(['libx264', 'h264_videotoolbox'])).toBe('h264_videotoolbox');
    expect(pickEncoder(['libx264'])).toBe('libx264');
    expect(pickEncoder([])).toBe('libx264');
    expect(pickEncoder(['libx264', 'h264_videotoolbox'], 'libx264')).toBe('libx264');
    expect(pickEncoder(['libx264'], 'h264_nvenc')).toBe('libx264');
  });
});

describe('destinations', () => {
  it('builds ingest URLs', () => {
    expect(destinationUrl('youtube', '', 'abc-123')).toBe(
      'rtmps://a.rtmps.youtube.com:443/live2/abc-123',
    );
    expect(destinationUrl('facebook', '', 'FB1')).toBe(
      'rtmps://live-api-s.facebook.com:443/rtmp/FB1',
    );
    expect(destinationUrl('custom', 'rtmp://host/app/', 'k')).toBe('rtmp://host/app/k');
    expect(destinationUrl('custom', 'rtmp://host/app/stream', null)).toBe('rtmp://host/app/stream');
  });

  it('accepts only RTMP(S) URLs and plain keys', () => {
    expect(isStreamUrl('rtmp://a.rtmp.youtube.com/live2')).toBe(true);
    expect(isStreamUrl('rtmps://x:443/rtmp')).toBe(true);
    expect(isStreamUrl('https://evil.example')).toBe(false);
    expect(isStreamUrl('rtmp:// spaced')).toBe(false);
    expect(isStreamKey('abcd-1234-efgh')).toBe(true);
    expect(isStreamKey('with space')).toBe(false);
    expect(isStreamKey('a/b')).toBe(false);
  });
});

describe('progress and names', () => {
  it('reads ffmpeg progress lines', () => {
    const p = parseProgress(
      'frame=  123 fps= 30 q=23.0 size=    1024KiB time=00:01:04.10 bitrate=2046.5kbits/s dup=0 drop=3 speed=1.01x',
    );
    expect(p).toEqual({ fps: 30, kbps: 2046.5, speed: 1.01, dropped: 3, time: 64.1 });
    expect(parseProgress('Input #0, rawvideo')).toBeNull();
  });

  it('names recordings by date, with parts after a restart', () => {
    const at = new Date(2026, 10, 16, 9, 5);
    expect(recordingName(at)).toBe('Lampstand 2026-11-16 09-05.mp4');
    expect(recordingName(at, 2)).toBe('Lampstand 2026-11-16 09-05 part 2.mp4');
  });
});

describe('direct links', () => {
  it('accepts SRT and UDP addresses with a host and port', () => {
    expect(isDirectUrl('srt://192.168.1.50:9000')).toBe(true);
    expect(isDirectUrl('udp://overflow.local:5000?ttl=4')).toBe(true);
    expect(isDirectUrl('srt://192.168.1.50')).toBe(false);
    expect(isDirectUrl('rtmp://a/live')).toBe(false);
    expect(isDirectUrl('udp://host:99999')).toBe(false);
    expect(isDirectUrl('srt://host:9000 extra')).toBe(false);
  });

  it('adds low-delay options, keeping what the address already says', () => {
    expect(directUrl('udp://10.0.0.2:9000')).toBe('udp://10.0.0.2:9000?pkt_size=1316');
    expect(directUrl('srt://10.0.0.2:9000')).toBe(
      'srt://10.0.0.2:9000?mode=caller&latency=120000&pkt_size=1316',
    );
    expect(directUrl('srt://10.0.0.2:9000?latency=400000&passphrase=secretsecret')).toBe(
      'srt://10.0.0.2:9000?latency=400000&passphrase=secretsecret&mode=caller&pkt_size=1316',
    );
    expect(destinationUrl('direct', 'udp://10.0.0.2:9000', 'ignored')).toBe(
      'udp://10.0.0.2:9000?pkt_size=1316',
    );
  });

  it('packages a direct link as MPEG-TS, beside an RTMP service', () => {
    const args = buildArgs({
      width: 1280,
      height: 720,
      fps: 30,
      videoKbps: 3500,
      audioKbps: 160,
      encoder: 'libx264',
      streams: ['rtmp://a/live2/k1', 'udp://10.0.0.2:9000?pkt_size=1316'],
      record: null,
    });
    const tee = args.at(-1) ?? '';
    expect(tee.split('|')[0]).toMatch(/^\[f=flv:/);
    expect(tee.split('|')[1]).toBe(
      '[f=mpegts:onfail=ignore:flush_packets=1:max_delay=100000:pes_payload_size=0:bsfs/v=h264_mp4toannexb]udp://10.0.0.2:9000?pkt_size=1316',
    );
  });

  it('hides an SRT passphrase in log lines', () => {
    expect(redactKeys('srt://h:9000?passphrase=secretsecret&mode=caller')).toBe(
      'srt://h:9000?passphrase=•••&mode=caller',
    );
  });
});

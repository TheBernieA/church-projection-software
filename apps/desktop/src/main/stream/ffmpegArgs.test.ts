import { describe, expect, it } from 'vitest';
import {
  buildArgs,
  cleanStreamKey,
  destinationUrl,
  freeName,
  isStreamKey,
  isStreamUrl,
  parseProgress,
  pickEncoder,
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
    expect(a.at(-1)).toBe('[f=mp4:movflags=+frag_keyframe+empty_moov+default_base_moof]/tmp/a.mp4');
  });

  it('sends to every destination, each allowed to fail alone, plus the recording', () => {
    const a = buildArgs({
      ...base,
      streams: ['rtmp://a/live2/k1', 'rtmps://b:443/rtmp/k2'],
      record: '/tmp/r.mp4',
    });
    const out = a.at(-1) ?? '';
    expect(out.split('|')).toHaveLength(3);
    expect(out).toContain('[f=flv:onfail=ignore:flvflags=no_duration_filesize]rtmp://a/live2/k1');
  });

  it('uses each hardware encoder by name', () => {
    expect(buildArgs({ ...base, encoder: 'h264_videotoolbox' })).toContain('h264_videotoolbox');
    expect(buildArgs({ ...base, encoder: 'h264_nvenc' })).toContain('h264_nvenc');
  });

  it('feeds hardware encoders NV12 and software yuv420p; the preset follows the mode', () => {
    const vt = buildArgs({ ...base, encoder: 'h264_videotoolbox' });
    expect(vt[vt.lastIndexOf('-pix_fmt') + 1]).toBe('nv12');
    const sw = buildArgs({ ...base, encoder: 'libx264', x264Preset: 'superfast' });
    expect(sw[sw.lastIndexOf('-pix_fmt') + 1]).toBe('yuv420p');
    expect(sw[sw.indexOf('-preset') + 1]).toBe('superfast');
    expect(buildArgs({ ...base, width: 960, height: 540 }).join(' ')).toContain('-s 960x540');
  });

  it('packages GPU-encoded H.264 without re-encoding, timed by frame number', () => {
    const a = buildArgs({ ...base, fps: 60, input: 'h264', record: '/tmp/r.mp4' }).join(' ');
    expect(a).toContain('-use_wallclock_as_timestamps 1 -f h264 -framerate 60 -i pipe:0');
    expect(a).toContain('-probesize 32 -analyzeduration 0');
    expect(a).toContain('-c:v copy -bsf:v setts=pts=N/(60*TB):dts=N/(60*TB)');
    expect(a).not.toContain('rawvideo');
    expect(a).not.toContain('-pix_fmt');
    expect(a).toContain('-c:a aac');
  });

  it('escapes tee specials', () => {
    expect(teeEscape('a|b[c]\\d')).toBe('a\\|b\\[c\\]\\\\d');
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
      'rtmp://a.rtmp.youtube.com/live2/abc-123',
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

import { describe, expect, it } from 'vitest';
import {
  buildArgs,
  destinationUrl,
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

  it('escapes tee specials', () => {
    expect(teeEscape('a|b[c]\\d')).toBe('a\\|b\\[c\\]\\\\d');
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

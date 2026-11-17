import { test } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addSeedClip,
  launch,
  SEED_CLIP_LIVE,
  setStream,
  tempLibrary,
  toneWav,
  waitLive,
} from './streamHarness';

/**
 * Sending latency (not part of the normal run): LAMPSTAND_LATENCY=1.
 * Streams to a local RTMP server and compares when each video frame and each piece of sound
 * arrives with when it was made: (arrival time − stream start) − the packet's timestamp. A
 * healthy sender stays within a few hundred ms and doesn't grow.
 */
test.skip(!process.env.LAMPSTAND_LATENCY, 'set LAMPSTAND_LATENCY=1 to measure');
test.setTimeout(240_000);

const SECONDS = Number(process.env.LAMPSTAND_LATENCY_SECONDS ?? 40);

test('livestream sending latency to a local RTMP server', async () => {
  const lib = tempLibrary('lat');
  const dir = lib.dir;
  addSeedClip(lib);
  // A 90 s tone for the Audio tab, so the stream has real sound to carry.
  lib.add(
    { id: 'tone', name: 'Tone', kind: 'audio', fileName: 'tone.wav', mimeType: 'audio/wav' },
    toneWav(90),
  );
  // The server: ffmpeg receives RTMP and hands the FLV straight on; we time each tag's arrival.
  const port = 19360;
  const server = spawn('ffmpeg', [
    '-v',
    'error',
    '-fflags',
    'nobuffer',
    '-analyzeduration',
    '1000000',
    '-listen',
    '1',
    '-i',
    `rtmp://127.0.0.1:${port}/live/test`,
    '-c',
    'copy',
    '-flush_packets',
    '1',
    '-f',
    'flv',
    'pipe:1',
  ]);
  const tags: { at: number; type: number; ts: number }[] = [];
  let buf = Buffer.alloc(0);
  let header = false;
  server.stdout.on('data', (d: Buffer) => {
    const at = Date.now();
    buf = Buffer.concat([buf, d]);
    if (!header) {
      if (buf.length < 13) return;
      buf = buf.subarray(13);
      header = true;
    }
    while (buf.length >= 11) {
      const size = buf.readUIntBE(1, 3);
      if (buf.length < 11 + size + 4) break;
      const ts = buf.readUIntBE(4, 3) | (buf[7]! << 24);
      tags.push({ at, type: buf[0]!, ts });
      buf = buf.subarray(11 + size + 4);
    }
  });
  await new Promise((r) => setTimeout(r, 800));

  const l = await launch(lib, [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ]);
  const { app, control, cmd } = l;
  await setStream(control, {
    custom: process.env.LAMPSTAND_PERF_CUSTOM ?? '1080x60',
    videoKbps: 6000,
    recordWhileStreaming: true,
    destinations: [
      {
        id: 'd1',
        kind: 'custom',
        name: 'Local',
        url: `rtmp://127.0.0.1:${port}/live/test`,
        enabled: true,
      },
    ],
  });
  await cmd('live.goLive', SEED_CLIP_LIVE);
  await cmd('live.audio', { action: 'play', mediaId: 'tone' });
  await cmd('stream.start', { stream: true });
  await waitLive(l);
  if (process.env.LAMPSTAND_LATENCY_STALL) {
    // A stalled upload: the server stops reading for 4 s, 12 s in, then carries on.
    await control.waitForTimeout(12_000);
    server.kill('SIGSTOP');
    await control.waitForTimeout(4_000);
    server.kill('SIGCONT');
    await control.waitForTimeout((SECONDS - 16) * 1000);
  } else await control.waitForTimeout(SECONDS * 1000);
  const status = await control.evaluate(async () => {
    const r = await window.lampstand.query('stream.status');
    return r.ok ? { pipeline: r.value.pipeline, fps: r.value.fps, dropped: r.value.dropped } : null;
  });
  await cmd('stream.stop', { stream: true, record: true });
  await control.waitForTimeout(1500);
  await app.close();
  server.kill();

  // Stream start: the first video tag's arrival stands for timestamp 0 (so the figure is the
  // delay that builds up after the start, plus jitter; a constant first-packet delay cancels).
  const video = tags.filter((t) => t.type === 9);
  const audio = tags.filter((t) => t.type === 8);
  console.log(
    'TAGS',
    JSON.stringify({ video: video.length, audio: audio.length, all: tags.length }),
  );
  const t0 = video[0]!.at - video[0]!.ts;
  const lat = (list: typeof tags, from: number, to: number) => {
    const l = list
      .filter((t) => t.ts >= from * 1000 && t.ts < to * 1000)
      .map((t) => t.at - t0 - t.ts);
    if (!l.length) return null;
    l.sort((a, b) => a - b);
    return { median: l[Math.floor(l.length / 2)], max: l[l.length - 1], n: l.length };
  };
  const result = {
    status,
    seconds: SECONDS,
    videoTags: video.length,
    audioTags: audio.length,
    video_2_10s: lat(video, 2, 10),
    video_last10s: lat(video, SECONDS - 12, SECONDS - 2),
    audio_2_10s: lat(audio, 2, 10),
    audio_last10s: lat(audio, SECONDS - 12, SECONDS - 2),
    // Sound against picture at the end: last audio timestamp vs last video timestamp.
    endAudioMinusVideoMs: (audio.at(-1)?.ts ?? 0) - (video.at(-1)?.ts ?? 0),
  };
  // How evenly video arrives: gaps between arrivals (a smooth 60 fps stream has ~17 ms gaps).
  const gaps = video.slice(1).map((t, i) => t.at - video[i]!.at);
  const sorted = [...gaps].sort((a, b) => a - b);
  const at = (re: RegExp) => {
    const l = log.find((x) => re.test(x));
    return l ? Date.parse(/"t":"([^"]+)"/.exec(l)?.[1] ?? '') : 0;
  };
  // The worst lateness in each 5 s window (to see whether hiccups repeat or grow).
  const windows: number[] = [];
  for (let w = 0; w + 5 <= SECONDS; w += 5) windows.push(lat(video, w, w + 5)?.max ?? -1);
  const log = readFileSync(join(dir, 'user', 'logs', 'lampstand.log'), 'utf8').split('\n');
  // The sound that went out: its loudness in the recording (a silent stream reads about -91 dB).
  const rec = join(dir, 'recordings');
  const file = join(
    rec,
    readdirSync(rec).find((f) => f.endsWith('.mp4'))!,
  );
  const vol = spawnSync(
    'ffmpeg',
    ['-v', 'info', '-i', file, '-af', 'volumedetect', '-vn', '-f', 'null', '-'],
    {
      encoding: 'utf8',
    },
  ).stderr;
  const health = log.filter((l) => l.includes('stream health')).at(-1) ?? '';
  const extra = {
    meanVolume: /mean_volume: ([-\d.]+) dB/.exec(vol)?.[1],
    audioPaddedMs: /"audioPaddedMs":(\d+)/.exec(health)?.[1],
    audioDroppedMs: /"audioDroppedMs":(\d+)/.exec(health)?.[1],
    pcmSeen: /"pcmSeen":(\d+)/.exec(health)?.[1],
    windows,
    gapP50: sorted[Math.floor(sorted.length * 0.5)],
    gapP99: sorted[Math.floor(sorted.length * 0.99)],
    gapMax: sorted.at(-1),
    gapsOver150ms: gaps.filter((g) => g > 150).length,
    // From the encoder's first frame to the server's first video packet.
    startDelayMs: video[0]!.at - at(/first encoded chunk/),
    encoderStartToFirstChunkMs: at(/first encoded chunk/) - at(/encoder started/),
  };
  console.log('LATENCY', JSON.stringify({ ...result, ...extra }));
});

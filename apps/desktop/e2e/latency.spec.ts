import { _electron as electron, expect, test } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  const dir = mkdtempSync(join(tmpdir(), 'lampstand-lat-'));
  const media = join(dir, 'library', 'media');
  mkdirSync(join(media, '.meta'), { recursive: true });
  const clip = readFileSync(join(__dirname, 'fixtures', 'clip.mp4'));
  writeFileSync(join(media, 'seed-clip.mp4'), clip);
  const now = new Date().toISOString();
  writeFileSync(
    join(media, '.meta', 'seed-clip.media.json'),
    JSON.stringify({
      id: 'seed-clip',
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      name: 'Seed clip',
      kind: 'video',
      fileName: 'seed-clip.mp4',
      mimeType: 'video/mp4',
      sizeBytes: clip.length,
      hasThumbnail: false,
      isBackground: false,
      tags: [],
    }),
  );
  // A 90 s tone for the Audio tab, so the stream has real sound to carry.
  {
    const rate = 8000;
    const n = rate * 90;
    const wav = Buffer.alloc(44 + n * 2);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + n * 2, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(rate, 24);
    wav.writeUInt32LE(rate * 2, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++)
      wav.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), 44 + i * 2);
    writeFileSync(join(media, 'tone.wav'), wav);
    writeFileSync(
      join(media, '.meta', 'tone.media.json'),
      JSON.stringify({
        id: 'tone',
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        name: 'Tone',
        kind: 'audio',
        fileName: 'tone.wav',
        mimeType: 'audio/wav',
        sizeBytes: wav.length,
        hasThumbnail: false,
        isBackground: false,
        tags: [],
      }),
    );
  }
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

  const env = {
    ...process.env,
    LAMPSTAND_USER_DATA: join(dir, 'user'),
    LAMPSTAND_LIBRARY: join(dir, 'library'),
    LAMPSTAND_RECORDINGS: join(dir, 'recordings'),
    NODE_ENV: 'test',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  const app = await electron.launch({
    args: ['.', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    cwd: join(__dirname, '..'),
    env,
  });
  const control = await app.firstWindow();
  await control.waitForLoadState('domcontentloaded');
  const cmd = (type: string, payload: unknown) =>
    control.evaluate(([t, p]) => window.lampstand.command({ type: t, payload: p }), [
      type,
      payload,
    ] as const);
  await expect
    .poll(async () => (await control.evaluate(() => window.lampstand.query('settings.get'))).ok)
    .toBe(true);
  const custom = process.env.LAMPSTAND_PERF_CUSTOM ?? '1080x60';
  await control.evaluate(
    async ([c, p]) => {
      const r = await window.lampstand.query('settings.get');
      if (!r.ok) return;
      const [h, f] = c.split('x').map(Number);
      await window.lampstand.command({
        type: 'settings.update',
        payload: {
          patch: {
            windowMode: true,
            stream: {
              ...r.value.stream,
              performance: 'custom',
              quality: { ...r.value.stream.quality, height: h, fps: f, videoKbps: 6000 },
              recording: { ...r.value.stream.recording, recordWhileStreaming: true },
              destinations: [
                {
                  id: 'd1',
                  kind: 'custom',
                  name: 'Local',
                  url: `rtmp://127.0.0.1:${p}/live/test`,
                  enabled: true,
                },
              ],
            },
          },
        },
      });
    },
    [custom, port] as const,
  );
  await cmd('live.goLive', {
    media: {
      mediaId: 'seed-clip',
      kind: 'video',
      fit: 'cover',
      loop: true,
      muted: false,
      volume: 1,
      playing: true,
      position: 0,
    },
  });
  await cmd('live.audio', { action: 'play', mediaId: 'tone' });
  await cmd('stream.start', { stream: true });
  await expect
    .poll(
      async () => {
        const r = await control.evaluate(() => window.lampstand.query('stream.status'));
        return r.ok ? r.value.state : null;
      },
      { timeout: 20_000 },
    )
    .toBe('live');
  await control.waitForTimeout(SECONDS * 1000);
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

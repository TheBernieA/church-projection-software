import { _electron as electron, expect, test } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Glass-to-glass sending delay (not part of the normal run): LAMPSTAND_GLASS=1.
 * A white picture is live; the black mask is switched on and off. A local RTMP server decodes
 * the stream as it arrives and notes when each frame turns dark or bright. The delay is from the
 * command to the first decoded frame that shows it: drawing, capture, encoding, packaging, sending, decoding. This
 * is everything Lampstand adds before a streaming service's own delay.
 */
test.skip(!process.env.LAMPSTAND_GLASS, 'set LAMPSTAND_GLASS=1 to measure');
test.setTimeout(240_000);

const FLIPS = Number(process.env.LAMPSTAND_GLASS_FLIPS ?? 20);
/** 'rtmp' (as to a streaming service) or 'udp' (a direct link). */
const LINK = process.env.LAMPSTAND_GLASS_LINK === 'udp' ? 'udp' : 'rtmp';

test('livestream glass-to-glass delay to a local RTMP server', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lampstand-glass-'));
  const media = join(dir, 'library', 'media');
  mkdirSync(join(media, '.meta'), { recursive: true });
  const white = join(media, 'white.png');
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=white:s=64x64',
    '-frames:v',
    '1',
    white,
  ]);
  const now = new Date().toISOString();
  writeFileSync(
    join(media, '.meta', 'white.media.json'),
    JSON.stringify({
      id: 'white',
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      name: 'White',
      kind: 'image',
      fileName: 'white.png',
      mimeType: 'image/png',
      sizeBytes: statSync(white).size,
      hasThumbnail: false,
      isBackground: false,
      tags: [],
    }),
  );
  // The server: decodes each frame the moment it arrives, down to 2×2 grey pixels.
  // A port of its own each run (the last run's receiver may not have let go of its port yet).
  const port = 19361 + Math.floor(Math.random() * 500);
  const address = LINK === 'udp' ? `udp://127.0.0.1:${port}` : `rtmp://127.0.0.1:${port}/live/test`;
  const server = spawn('ffmpeg', [
    '-v',
    'warning',
    '-fflags',
    'nobuffer',
    '-flags',
    'low_delay',
    '-probesize',
    LINK === 'udp' ? '1000000' : '32768',
    '-analyzeduration',
    LINK === 'udp' ? '1000000' : '0',
    '-threads',
    '1',
    ...(LINK === 'udp' ? [] : ['-listen', '1']),
    '-i',
    address,
    '-an',
    '-vf',
    'scale=2:2,format=gray',
    '-fps_mode',
    'passthrough',
    '-flush_packets',
    '1',
    '-f',
    'rawvideo',
    'pipe:1',
  ]);
  const frames: { at: number; mean: number }[] = [];
  let rest = Buffer.alloc(0);
  server.stdout.on('data', (d: Buffer) => {
    const at = Date.now();
    rest = Buffer.concat([rest, d]);
    while (rest.length >= 4) {
      const mean = (rest[0]! + rest[1]! + rest[2]! + rest[3]!) / 4;
      frames.push({ at, mean });
      rest = rest.subarray(4);
    }
  });
  const serverLog: string[] = [];
  server.stderr.on('data', (d: Buffer) => serverLog.push(d.toString()));
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
  const app = await electron.launch({ args: ['.'], cwd: join(__dirname, '..'), env });
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
  const custom = process.env.LAMPSTAND_PERF_CUSTOM ?? '1080x30';
  await control.evaluate(
    async ([c, url, link]) => {
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
              destinations: [
                {
                  id: 'd1',
                  kind: link === 'udp' ? 'direct' : 'custom',
                  name: 'Local',
                  url,
                  enabled: true,
                },
              ],
            },
          },
        },
      });
    },
    [custom, address, LINK] as const,
  );
  await cmd('live.goLive', {
    media: {
      mediaId: 'white',
      kind: 'image',
      fit: 'cover',
      loop: false,
      muted: true,
      volume: 1,
      playing: false,
      position: 0,
    },
  });
  await cmd('stream.start', { stream: true });
  const status = async () => {
    const r = await control.evaluate(() => window.lampstand.query('stream.status'));
    return r.ok ? r.value : null;
  };
  await expect.poll(async () => (await status())?.state, { timeout: 20_000 }).toBe('live');
  await control.waitForTimeout(5000);

  const flips: { at: number; bright: boolean }[] = [];
  for (let i = 0; i < FLIPS; i++) {
    const dark = i % 2 === 0;
    const at = Date.now();
    await cmd('live.setMask', { mask: 'black', value: dark });
    flips.push({ at, bright: !dark });
    await control.waitForTimeout(1500 + Math.round(Math.random() * 300));
  }
  const last = await status();
  await cmd('stream.stop', { stream: true });
  await control.waitForTimeout(1500);
  await app.close();
  server.kill('SIGKILL');

  // Each flip: the first frame after the command whose brightness has started to move (the
  // black-out is a 300 ms fade, so its first step is what's timed, not its end).
  const delays = flips
    .map((f) => {
      const before = frames.findLast((x) => x.at < f.at)?.mean;
      if (before === undefined) return null;
      const hit = frames.find((x) => x.at >= f.at && Math.abs(x.mean - before) > 6);
      return hit ? hit.at - f.at : null;
    })
    .filter((x): x is number => x !== null);
  const sorted = [...delays].sort((a, b) => a - b);
  const result = {
    link: LINK,
    size: custom,
    pipeline: last?.pipeline,
    frames: frames.length,
    flips: flips.length,
    seen: delays.length,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    minMs: sorted[0],
    maxMs: sorted.at(-1),
    delays,
  };
  console.log('GLASS', JSON.stringify(result));
  if (!frames.length) console.log('RECEIVER', serverLog.join('').slice(0, 1500));
  expect(delays.length).toBeGreaterThan(FLIPS / 2);
});

import { _electron as electron, expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Livestream performance measurement (not part of the normal run): LAMPSTAND_PERF=1.
 * Records 30 s of a playing video with a camera picture-in-picture over it, and reports the
 * encoder's and Lampstand's CPU and memory, frames dropped, and how far sound and picture drift
 * apart. Results: test-results/perf.json.
 */
test.skip(!process.env.LAMPSTAND_PERF, 'set LAMPSTAND_PERF=1 to measure');
test.setTimeout(180_000);

const SECONDS = Number(process.env.LAMPSTAND_PERF_SECONDS ?? 30);

test('livestream performance: 720p30 recording of a video with a camera', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lampstand-perf-'));
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
  const status = () =>
    control.evaluate(async () => {
      const r = await window.lampstand.query('stream.status');
      return r.ok ? r.value : null;
    });
  await expect
    .poll(async () => (await control.evaluate(() => window.lampstand.query('settings.get'))).ok)
    .toBe(true);
  await cmd('settings.update', { patch: { windowMode: true } });
  // The same size every run (Auto would pick for this computer).
  const mode = process.env.LAMPSTAND_PERF_MODE ?? 'balanced';
  const custom = process.env.LAMPSTAND_PERF_CUSTOM; // e.g. "1080x60"
  await control.evaluate(
    async ([m, c]) => {
      const r = await window.lampstand.query('settings.get');
      if (!r.ok) return;
      const [h, f] = (c ?? '').split('x').map(Number);
      const stream = c
        ? {
            ...r.value.stream,
            performance: 'custom',
            quality: {
              ...r.value.stream.quality,
              height: h,
              fps: f,
              videoKbps: h >= 1080 ? 9000 : 4500,
            },
          }
        : { ...r.value.stream, performance: m };
      await window.lampstand.command({ type: 'settings.update', payload: { patch: { stream } } });
    },
    [mode, custom ?? null] as const,
  );
  // A looping video on screen, with the fake camera picture-in-picture over it.
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
  const camera = await control.evaluate(async () => {
    await navigator.mediaDevices.getUserMedia({ video: true });
    const d = (await navigator.mediaDevices.enumerateDevices()).find(
      (x) => x.kind === 'videoinput',
    );
    return d?.deviceId ?? null;
  });
  if (camera)
    await cmd('live.switcher', {
      action: 'pip',
      pip: {
        deviceId: camera,
        label: 'cam',
        fit: 'cover',
        mirror: false,
        resolution: 'auto',
        corner: 'br',
        size: 0.3,
      },
    });
  await cmd('stream.start', { record: true });
  await expect.poll(async () => (await status())?.state, { timeout: 20_000 }).toBe('live');

  const samples: {
    ffCpu: number;
    ffRss: number;
    appCpu: number;
    appMem: number;
    fps: number;
    speed: number;
  }[] = [];
  const end = Date.now() + SECONDS * 1000;
  while (Date.now() < end) {
    await control.waitForTimeout(2000);
    const ps = execFileSync('ps', ['-axo', 'pid=,%cpu=,rss=,command='], { encoding: 'utf8' })
      .split('\n')
      .find((l) => /\/ffmpeg\s/.test(l) && /pipe:0/.test(l));
    const [, cpu, rss] = ps?.trim().split(/\s+/) ?? [];
    const metrics = await app.evaluate(({ app: a }) =>
      a.getAppMetrics().map((m) => ({ cpu: m.cpu.percentCPUUsage, mem: m.memory.workingSetSize })),
    );
    const s = await status();
    samples.push({
      ffCpu: Number(cpu ?? 0),
      ffRss: Number(rss ?? 0) / 1024,
      appCpu: metrics.reduce((a, m) => a + m.cpu, 0),
      appMem: metrics.reduce((a, m) => a + m.mem, 0) / 1024,
      fps: s?.fps ?? 0,
      speed: s?.speed ?? 0,
    });
  }
  const last = await status();
  await cmd('stream.stop', { record: true });
  await expect.poll(async () => (await status())?.state, { timeout: 15_000 }).toBe('idle');
  const folder = join(dir, 'recordings');
  const file = join(
    folder,
    readdirSync(folder).find((f) => f.endsWith('.mp4'))!,
  );
  const dur = (sel: string) =>
    Number(
      execFileSync(
        'ffprobe',
        [
          '-v',
          'error',
          '-select_streams',
          sel,
          '-show_entries',
          'stream=duration',
          '-of',
          'csv=p=0',
          file,
        ],
        { encoding: 'utf8' },
      ).trim() || 0,
    );
  const frames = Number(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v',
        '-count_packets',
        '-show_entries',
        'stream=nb_read_packets',
        '-of',
        'csv=p=0',
        file,
      ],
      { encoding: 'utf8' },
    ).trim(),
  );
  const avg = (k: keyof (typeof samples)[number]) =>
    Math.round((samples.reduce((a, s) => a + s[k], 0) / samples.length) * 10) / 10;
  const peak = (k: keyof (typeof samples)[number]) =>
    Math.round(Math.max(...samples.map((s) => s[k])));
  const result = {
    seconds: SECONDS,
    pipeline: last?.pipeline,
    mode: last?.profile.mode,
    size: `${last?.profile.height}p${last?.profile.fps}`,
    ffmpegCpuAvg: avg('ffCpu'),
    ffmpegMemMB: peak('ffRss'),
    lampstandCpuAvg: avg('appCpu'),
    lampstandMemPeakMB: peak('appMem'),
    fpsAvg: avg('fps'),
    speedAvg: avg('speed'),
    dropped: last?.dropped ?? 0,
    framesInFile: frames,
    videoSeconds: dur('v'),
    audioSeconds: dur('a'),
    avDriftMs: Math.round((dur('a') - dur('v')) * 1000),
  };
  console.log('PERF', JSON.stringify(result));
  writeFileSync(
    join(__dirname, '..', 'test-results', 'perf.json'),
    JSON.stringify(result, null, 2),
  );
  await app.close();
});

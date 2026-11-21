import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addSeedClip,
  launch,
  SEED_CLIP_LIVE,
  setStream,
  tempLibrary,
  waitLive,
} from './streamHarness';

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
  const lib = tempLibrary('perf');
  addSeedClip(lib);
  const dir = lib.dir;
  const l = await launch(lib, [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ]);
  const { app, control, cmd, status } = l;
  // The same size every run (Auto would pick for this computer).
  await setStream(control, {
    custom: process.env.LAMPSTAND_PERF_CUSTOM ?? null, // e.g. "1080x60"
    mode: process.env.LAMPSTAND_PERF_MODE ?? 'balanced',
  });
  // A looping video on screen, with the fake camera picture-in-picture over it.
  await cmd('live.goLive', SEED_CLIP_LIVE);
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
  await waitLive(l);

  const samples: {
    ffCpu: number;
    ffRss: number;
    appCpu: number;
    appMem: number;
    fps: number;
    speed: number;
  }[] = [];
  const byKind = new Map<string, number[]>();
  const end = Date.now() + SECONDS * 1000;
  while (Date.now() < end) {
    await control.waitForTimeout(2000);
    const ps = execFileSync('ps', ['-axo', 'pid=,%cpu=,rss=,command='], { encoding: 'utf8' })
      .split('\n')
      .find((l) => /\/ffmpeg\s/.test(l) && /pipe:0/.test(l));
    const [, cpu, rss] = ps?.trim().split(/\s+/) ?? [];
    const metrics = await app.evaluate(({ app: a, webContents }) => {
      // Which window each renderer is (control, output, stream…), to see where the time goes.
      const pages = new Map(
        webContents.getAllWebContents().map((w) => [w.getOSProcessId(), w.getURL()]),
      );
      return a.getAppMetrics().map((m) => {
        const url = pages.get(m.pid) ?? '';
        const page = /\/(control|output|stream|multiview|live|stage)\//.exec(url)?.[1];
        return {
          cpu: m.cpu.percentCPUUsage,
          mem: m.memory.workingSetSize,
          kind: page ? `renderer:${page}` : m.type,
        };
      });
    });
    for (const m of metrics) byKind.set(m.kind, [...(byKind.get(m.kind) ?? []), m.cpu]);
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
    // Average CPU per kind of process (several of one kind are added up per sample).
    cpuByProcess: Object.fromEntries(
      [...byKind].map(([k, v]) => [
        k,
        Math.round((v.reduce((a, x) => a + x, 0) / samples.length) * 10) / 10,
      ]),
    ),
  };
  console.log('PERF', JSON.stringify(result));
  writeFileSync(
    join(__dirname, '..', 'test-results', 'perf.json'),
    JSON.stringify(result, null, 2),
  );
  await app.close();
});

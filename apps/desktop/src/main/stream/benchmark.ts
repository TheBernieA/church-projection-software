import { execFile } from 'node:child_process';
import type { PerformanceMode } from '@lampstand/core';
import { performanceProfile } from '@lampstand/core';
import { parseProgress, videoCodecArgs, type Encoder } from './ffmpegArgs';

/** One mode tried: how fast this computer encoded it (1 = just real time). */
export interface BenchmarkRun {
  mode: PerformanceMode;
  speed: number;
}

/**
 * Speed needed to call a mode safe. The real stream also draws the picture and copies frames,
 * so the encoder alone must be comfortably faster than real time.
 */
const HEADROOM: Record<PerformanceMode, number> = { quality: 2.2, balanced: 1.7, light: 0 };

/** The best mode this computer managed with room to spare (Light always works). */
export function pickBenchmarkMode(runs: readonly BenchmarkRun[]): PerformanceMode {
  for (const mode of ['quality', 'balanced'] as const) {
    const run = runs.find((r) => r.mode === mode);
    if (run && run.speed >= HEADROOM[mode]) return mode;
  }
  return 'light';
}

/** ffmpeg's arguments to encode a generated test picture for `seconds`, as a mode would. */
export function benchmarkArgs(mode: PerformanceMode, encoder: Encoder, seconds = 4): string[] {
  const p = performanceProfile(mode);
  const width = Math.round((p.height * 16) / 9);
  const hw = encoder !== 'libx264' && encoder !== 'h264_amf';
  return [
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'info',
    '-stats_period',
    '0.5',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=${width}x${p.height}:rate=${p.fps}`,
    '-t',
    String(seconds),
    // The stream's frames arrive as BGRA: convert from it, as the real thing does.
    '-vf',
    'format=bgra',
    '-pix_fmt',
    hw ? 'nv12' : 'yuv420p',
    ...videoCodecArgs({ encoder, fps: p.fps, videoKbps: p.videoKbps, x264Preset: p.x264Preset }),
    '-f',
    'null',
    '-',
  ];
}

/** Encode the test picture as `mode` would; resolves the speed it managed (0 if it failed). */
export function runBenchmark(
  ffmpeg: string,
  mode: PerformanceMode,
  encoder: Encoder,
): Promise<number> {
  return new Promise((resolve) => {
    execFile(ffmpeg, benchmarkArgs(mode, encoder), { timeout: 30_000 }, (_err, _out, stderr) => {
      let speed = 0;
      for (const line of stderr.split(/\r|\n/)) {
        const p = parseProgress(line);
        if (p && p.speed > 0) speed = p.speed;
      }
      resolve(speed);
    });
  });
}

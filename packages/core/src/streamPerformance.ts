import { recommendedKbps, type StreamSettings } from './schemas/stream';

export type PerformanceMode = 'light' | 'balanced' | 'quality';

/** What the computer is: decides what Auto picks. */
export interface MachineInfo {
  cores: number;
  memoryGB: number;
  /** A hardware H.264 encoder is available (VideoToolbox, NVENC, Quick Sync, AMF). */
  hardwareEncoder: boolean;
}

/** Everything a performance mode decides about a stream. */
export interface StreamProfile {
  mode: PerformanceMode | 'custom';
  height: 540 | 720 | 1080;
  fps: 30 | 60;
  videoKbps: number;
  audioKbps: 128 | 160 | 192;
  /** libx264's speed preset (hardware encoders ignore it). */
  x264Preset: 'ultrafast' | 'superfast' | 'veryfast' | 'faster';
  /** Live console preview frames per second. */
  previewFps: number;
  /** The stream picture may be prepared before going live (costs a little while waiting). */
  allowReady: boolean;
}

const PROFILES: Record<PerformanceMode, StreamProfile> = {
  light: {
    mode: 'light',
    height: 540,
    fps: 30,
    videoKbps: 2000,
    audioKbps: 128,
    x264Preset: 'superfast',
    previewFps: 1,
    allowReady: false,
  },
  balanced: {
    mode: 'balanced',
    height: 720,
    fps: 30,
    videoKbps: 3500,
    audioKbps: 160,
    x264Preset: 'veryfast',
    previewFps: 3,
    allowReady: true,
  },
  quality: {
    mode: 'quality',
    height: 1080,
    fps: 30,
    videoKbps: recommendedKbps(1080, 30),
    audioKbps: 160,
    x264Preset: 'faster',
    previewFps: 4,
    allowReady: true,
  },
};

/** What Auto picks for a computer: its benchmark if it has one, else its cores and memory. */
export function autoMode(m: MachineInfo, benchmark: StreamSettings['benchmark']): PerformanceMode {
  if (benchmark) return benchmark.mode;
  if (m.memoryGB <= 8.5 || (!m.hardwareEncoder && m.cores <= 4)) return 'light';
  if (m.hardwareEncoder && m.cores >= 8 && m.memoryGB >= 15.5) return 'quality';
  return 'balanced';
}

/** The stream's size, rate and encoder effort for these settings on this computer. */
export function resolvePerformance(s: StreamSettings, m: MachineInfo): StreamProfile {
  if (s.performance === 'custom') {
    const q = s.quality;
    return {
      mode: 'custom',
      height: q.height,
      fps: q.fps,
      videoKbps: q.videoKbps,
      audioKbps: q.audioKbps,
      x264Preset: q.height >= 1080 || q.fps > 30 ? 'superfast' : 'veryfast',
      previewFps: 3,
      allowReady: true,
    };
  }
  const mode = s.performance === 'auto' ? autoMode(m, s.benchmark) : s.performance;
  return PROFILES[mode];
}

/** The profile a mode stands for (Settings shows what each one means). */
export const performanceProfile = (mode: PerformanceMode): StreamProfile => PROFILES[mode];

/** The size of a 16:9 stream picture of this height (the stream, NDI feeds, the benchmark). */
export const streamSize = (height: number): { width: number; height: number } => ({
  width: Math.round((height * 16) / 9),
  height,
});

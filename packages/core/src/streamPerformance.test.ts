import { describe, expect, it } from 'vitest';
import { StreamSettingsSchema } from './schemas/stream';
import {
  autoMode,
  lighterProfile,
  performanceProfile,
  resolvePerformance,
} from './streamPerformance';

const settings = (patch: object = {}) => ({ ...StreamSettingsSchema.parse({}), ...patch });
const machine = (cores: number, memoryGB: number, hardwareEncoder: boolean) => ({
  cores,
  memoryGB,
  hardwareEncoder,
});

describe('stream performance', () => {
  it('Auto suits the computer', () => {
    expect(autoMode(machine(4, 8, true), null)).toBe('light');
    expect(autoMode(machine(4, 16, false), null)).toBe('light');
    expect(autoMode(machine(6, 16, false), null)).toBe('balanced');
    expect(autoMode(machine(8, 16, true), null)).toBe('quality');
    expect(autoMode(machine(10, 32, false), null)).toBe('balanced');
  });

  it('a benchmark result beats guessing', () => {
    const bench = { at: '2026-11-17', mode: 'quality' as const, encoder: 'libx264' };
    expect(autoMode(machine(4, 8, false), bench)).toBe('quality');
  });

  it('Light is small and cheap; Custom uses the values as set', () => {
    const light = resolvePerformance(settings({ performance: 'light' }), machine(16, 64, true));
    expect(light).toMatchObject({ height: 540, x264Preset: 'superfast', previewFps: 1 });
    expect(light.allowReady).toBe(false);
    const custom = resolvePerformance(
      settings({
        performance: 'custom',
        quality: { height: 1080, fps: 60, videoKbps: 9000, audioKbps: 192, encoder: 'auto' },
      }),
      machine(4, 8, false),
    );
    expect(custom).toMatchObject({ mode: 'custom', height: 1080, fps: 60, videoKbps: 9000 });
  });

  it('defaults to Auto', () => {
    expect(settings().performance).toBe('auto');
    expect(resolvePerformance(settings(), machine(6, 16, true)).mode).toBe('balanced');
  });
});

describe('H.264 level for the stream size', async () => {
  const { avcCodecFor } = await import('./frameClock');
  it('picks the smallest level that fits', () => {
    expect(avcCodecFor(960, 540, 30)).toBe('avc1.64001f');
    expect(avcCodecFor(1280, 720, 30)).toBe('avc1.64001f');
    expect(avcCodecFor(1280, 720, 60)).toBe('avc1.640020');
    expect(avcCodecFor(1920, 1080, 30)).toBe('avc1.640028');
    expect(avcCodecFor(1920, 1080, 60)).toBe('avc1.64002a');
  });
});

describe("a lighter stream for a computer that can't keep up", () => {
  it('steps Quality → Balanced → Light, then stops', () => {
    const balanced = lighterProfile(performanceProfile('quality'));
    expect(balanced?.mode).toBe('balanced');
    const light = balanced && lighterProfile(balanced);
    expect(light).toMatchObject({ mode: 'light', height: 540 });
    expect(light && lighterProfile(light)).toBeNull();
  });

  it('a custom stream drops 60 fps first, then the size, capping the bitrate', () => {
    const custom = resolvePerformance(
      StreamSettingsSchema.parse({
        performance: 'custom',
        quality: { height: 1080, fps: 60, videoKbps: 9000 },
      }),
      { cores: 8, memoryGB: 16, hardwareEncoder: true },
    );
    const a = lighterProfile(custom);
    expect(a).toMatchObject({ height: 1080, fps: 30, videoKbps: 6000 });
    const b = a && lighterProfile(a);
    expect(b).toMatchObject({ height: 720, fps: 30, videoKbps: 3500 });
    const c = b && lighterProfile(b);
    expect(c).toMatchObject({ height: 540, videoKbps: 2000, x264Preset: 'superfast' });
    expect(c && lighterProfile(c)).toBeNull();
  });
});

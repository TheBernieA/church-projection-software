import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { controlWindow } from './controlWindow';

/**
 * Shared set-up for the livestream measurements (perf, latency, glass-to-glass): a throwaway
 * library with media in it, Lampstand launched against it, and short ways to drive it.
 */
export interface TempLibrary {
  dir: string;
  /** Where the media files go. */
  media: string;
  /** Put a file in the media library (with the record the app keeps beside it). */
  add: (
    item: {
      id: string;
      name: string;
      kind: 'video' | 'audio' | 'image';
      fileName: string;
      mimeType: string;
    },
    bytes: Buffer,
  ) => void;
}

export function tempLibrary(name: string): TempLibrary {
  const dir = mkdtempSync(join(tmpdir(), `lampstand-${name}-`));
  const media = join(dir, 'library', 'media');
  mkdirSync(join(media, '.meta'), { recursive: true });
  const now = new Date().toISOString();
  return {
    dir,
    media,
    add: (item, bytes) => {
      writeFileSync(join(media, item.fileName), bytes);
      writeFileSync(
        join(media, '.meta', `${item.id}.media.json`),
        JSON.stringify({
          ...item,
          schemaVersion: 1,
          createdAt: now,
          updatedAt: now,
          sizeBytes: bytes.length,
          hasThumbnail: false,
          isBackground: false,
          tags: [],
        }),
      );
    },
  };
}

/** The 6-second test video, in the library as "seed-clip". */
export function addSeedClip(lib: TempLibrary): void {
  lib.add(
    {
      id: 'seed-clip',
      name: 'Seed clip',
      kind: 'video',
      fileName: 'seed-clip.mp4',
      mimeType: 'video/mp4',
    },
    readFileSync(join(__dirname, 'fixtures', 'clip.mp4')),
  );
}

/** A looping video on screen: the seed clip, playing with its sound. */
export const SEED_CLIP_LIVE = {
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
} as const;

/** A sine tone as a 16-bit mono WAV file. */
export function toneWav(seconds: number, hz = 440, rate = 8000): Buffer {
  const n = Math.round(rate * seconds);
  const wav = Buffer.alloc(44 + n * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + n * 2, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    wav.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 8000), 44 + i * 2);
  return wav;
}

export interface Launched {
  app: ElectronApplication;
  control: Page;
  cmd: (type: string, payload: unknown) => Promise<unknown>;
  /** The stream's status (null if it couldn't be read). */
  status: () => Promise<Awaited<ReturnType<typeof readStatus>>>;
}

const readStatus = (control: Page) =>
  control.evaluate(async () => {
    const r = await window.lampstand.query('stream.status');
    return r.ok ? r.value : null;
  });

/** Start Lampstand on a temp library, in window mode, ready for commands. */
export async function launch(
  lib: TempLibrary,
  args: string[] = [],
  extraEnv: Record<string, string> = {},
): Promise<Launched> {
  const env = {
    ...process.env,
    ...extraEnv,
    LAMPSTAND_USER_DATA: join(lib.dir, 'user'),
    LAMPSTAND_LIBRARY: join(lib.dir, 'library'),
    LAMPSTAND_RECORDINGS: join(lib.dir, 'recordings'),
    NODE_ENV: 'test',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  const app = await electron.launch({ args: ['.', ...args], cwd: join(__dirname, '..'), env });
  const control = await controlWindow(app);
  await control.waitForLoadState('domcontentloaded');
  await expect
    .poll(async () => (await control.evaluate(() => window.lampstand.query('settings.get'))).ok)
    .toBe(true);
  const cmd: Launched['cmd'] = (type, payload) =>
    control.evaluate(([t, p]) => window.lampstand.command({ type: t, payload: p }), [
      type,
      payload,
    ] as const);
  await cmd('settings.update', { patch: { windowMode: true } });
  return { app, control, cmd, status: () => readStatus(control) };
}

/** "1080x60" → the stream's size and rate by hand (Custom mode), plus anything else to set. */
export async function setStream(
  control: Page,
  o: {
    /** e.g. "1080x60"; leave out to use a performance mode. */
    custom?: string | null;
    mode?: string;
    videoKbps?: number;
    recordWhileStreaming?: boolean;
    destinations?: { id: string; kind: string; name: string; url: string; enabled: boolean }[];
  },
): Promise<void> {
  await control.evaluate(async (opts) => {
    const r = await window.lampstand.query('settings.get');
    if (!r.ok) return;
    const s = r.value.stream;
    const [h, f] = (opts.custom ?? '').split('x').map(Number);
    const stream = {
      ...s,
      ...(opts.custom
        ? {
            performance: 'custom',
            quality: {
              ...s.quality,
              height: h,
              fps: f,
              videoKbps: opts.videoKbps ?? ((h ?? 0) >= 1080 ? 9000 : 4500),
            },
          }
        : opts.mode
          ? { performance: opts.mode }
          : {}),
      ...(opts.recordWhileStreaming === undefined
        ? {}
        : { recording: { ...s.recording, recordWhileStreaming: opts.recordWhileStreaming } }),
      ...(opts.destinations ? { destinations: opts.destinations } : {}),
    };
    await window.lampstand.command({ type: 'settings.update', payload: { patch: { stream } } });
  }, o);
}

/** Wait until the stream (or recording) is running. */
export const waitLive = (l: Launched): Promise<void> =>
  expect.poll(async () => (await l.status())?.state, { timeout: 20_000 }).toBe('live');

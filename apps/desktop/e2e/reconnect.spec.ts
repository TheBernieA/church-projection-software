import { spawn, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launch, setStream, tempLibrary, waitLive, type Launched } from './streamHarness';

/**
 * A network drop mid-stream: the stream stays on and reconnects by itself once the server is
 * back, instead of ending. A local RTMP server stands in for YouTube; stopping it is the outage.
 */

const PORT = 19361;

/**
 * An always-on stand-in server (as YouTube's is): ffmpeg listens for one connection at a time,
 * so it's started again whenever it stops, until the test takes it down.
 */
function standInServer(dir: string): { stop: () => void } {
  let proc: ChildProcess | null = null;
  let up = true;
  let n = 0;
  const start = (): void => {
    if (!up) return;
    proc = spawn('ffmpeg', [
      '-v',
      'error',
      '-listen',
      '1',
      '-i',
      `rtmp://127.0.0.1:${PORT}/live/test`,
      '-c',
      'copy',
      '-y',
      join(dir, `got-${++n}.flv`),
    ]);
    proc.once('exit', () => setTimeout(start, 200));
  };
  start();
  return {
    stop: () => {
      up = false;
      proc?.kill('SIGKILL');
    },
  };
}

let l: Launched;
let server: { stop: () => void } | null = null;
const lib = tempLibrary('reconnect');

test.afterAll(async () => {
  server?.stop();
  await l.app.close().catch(() => undefined);
  rmSync(lib.dir, { recursive: true, force: true });
});

test('a network drop: the stream stays on, reconnects quietly, and is live again', async () => {
  test.setTimeout(120_000);
  server = standInServer(lib.dir);
  l = await launch(lib);
  await setStream(l.control, {
    mode: 'light',
    recordWhileStreaming: false,
    destinations: [
      {
        id: 'local',
        kind: 'custom',
        name: 'Stand-in',
        url: `rtmp://127.0.0.1:${PORT}/live/test`,
        enabled: true,
      },
    ],
  });
  await l.cmd('stream.start', { stream: true });
  await waitLive(l);
  await expect
    .poll(async () => (await l.status())?.destinations[0]?.state, { timeout: 20_000 })
    .toBe('ok');

  // The outage: the server goes away.
  server.stop();
  await expect
    .poll(async () => (await l.status())?.error, { timeout: 20_000 })
    .toBe('reconnecting');
  // It stays on (not ended) while the network is down.
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 2_000));
    const s = await l.status();
    expect(s?.state).not.toBe('idle');
    expect(s?.streaming).toBe(true);
  }

  // The network comes back: it reconnects by itself and goes on.
  server = standInServer(lib.dir);
  await expect
    .poll(
      async () => {
        const s = await l.status();
        return s ? `${s.state} ${s.destinations[0]?.state} ${s.error ?? ''}` : '';
      },
      { timeout: 45_000, intervals: [1_000] },
    )
    .toBe('live ok ');

  await l.cmd('stream.stop', { stream: true });
  await expect.poll(async () => (await l.status())?.state, { timeout: 15_000 }).toBe('idle');
});

test('recording too: the recording carries on through the drop; the stream comes back', async () => {
  test.setTimeout(120_000);
  server = standInServer(lib.dir);
  await setStream(l.control, { recordWhileStreaming: true });
  await l.cmd('stream.start', { stream: true });
  await waitLive(l);
  await expect
    .poll(async () => (await l.status())?.destinations.find((d) => d.id === 'local')?.state, {
      timeout: 20_000,
    })
    .toBe('ok');
  server.stop();
  await expect
    .poll(async () => (await l.status())?.error, { timeout: 20_000 })
    .toBe('reconnecting');
  // Still recording and still streaming (waiting to reconnect) while the network is down.
  await new Promise((r) => setTimeout(r, 4_000));
  const during = await l.status();
  expect(during?.recording).toBe(true);
  expect(during?.streaming).toBe(true);
  server = standInServer(lib.dir);
  await expect
    .poll(
      async () => {
        const s = await l.status();
        const d = s?.destinations.find((x) => x.id === 'local');
        return s ? `${s.state} ${d?.state} ${s.error ?? ''} ${s.recording}` : '';
      },
      { timeout: 45_000, intervals: [1_000] },
    )
    .toBe('live ok  true');
  await l.cmd('stream.stop', { stream: true, record: true });
  await expect.poll(async () => (await l.status())?.state, { timeout: 15_000 }).toBe('idle');
});

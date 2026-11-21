import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { connect, createServer as createNetServer, type Socket } from 'node:net';
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

let l: Launched | undefined;
let server: { stop: () => void } | null = null;

/** The stand-in server comes up (any previous one is taken down first: one per port). */
function serverUp(): void {
  server?.stop();
  server = standInServer(lib.dir);
}

/** The outage: the stand-in server goes away. */
function serverDown(): void {
  server?.stop();
  server = null;
}
const lib = tempLibrary('reconnect');

/** The recording files made so far. */
const recordings = (): string[] => {
  const folder = join(lib.dir, 'recordings');
  return existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith('.mp4')) : [];
};

test.afterAll(async () => {
  server?.stop();
  await l?.app.close().catch(() => undefined);
  rmSync(lib.dir, { recursive: true, force: true });
});

test('a network drop: the stream stays on, reconnects quietly, and is live again', async () => {
  test.setTimeout(120_000);
  serverUp();
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
  serverDown();
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
  serverUp();
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
  serverDown();
});

test('recording too: the recording carries on through the drop; the stream comes back', async () => {
  test.setTimeout(120_000);
  serverUp();
  await setStream(l.control, { recordWhileStreaming: true });
  await l.cmd('stream.start', { stream: true });
  await waitLive(l);
  await expect
    .poll(async () => (await l.status())?.destinations.find((d) => d.id === 'local')?.state, {
      timeout: 20_000,
    })
    .toBe('ok');
  serverDown();
  await expect
    .poll(async () => (await l.status())?.error, { timeout: 20_000 })
    .toBe('reconnecting');
  // Still recording and still streaming (waiting to reconnect) while the network is down, and
  // the recording isn't split while it waits.
  await new Promise((r) => setTimeout(r, 4_000));
  expect(recordings()).toHaveLength(1);
  const during = await l.status();
  expect(during?.recording).toBe(true);
  expect(during?.streaming).toBe(true);
  serverUp();
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
  // Split once, when the stream came back (part 2), not once per attempt.
  expect(recordings()).toHaveLength(2);
  await l.cmd('stream.stop', { stream: true, record: true });
  await expect.poll(async () => (await l.status())?.state, { timeout: 15_000 }).toBe('idle');
  serverDown();
});

test('two destinations: one drops; the other streams on untouched, and the first comes back', async () => {
  test.setTimeout(120_000);
  // A second stand-in that never goes down.
  const steady = spawnSteady(lib.dir);
  try {
    serverUp();
    await setStream(l.control, {
      recordWhileStreaming: false,
      destinations: [
        {
          id: 'local',
          kind: 'custom',
          name: 'Drops',
          url: `rtmp://127.0.0.1:${PORT}/live/test`,
          enabled: true,
        },
        {
          id: 'steady',
          kind: 'custom',
          name: 'Steady',
          url: `rtmp://127.0.0.1:${STEADY_PORT}/live/test`,
          enabled: true,
        },
      ],
    });
    await l.cmd('stream.start', { stream: true });
    await waitLive(l);
    const states = async () => {
      const s = await l.status();
      return Object.fromEntries((s?.destinations ?? []).map((d) => [d.id, d.state]));
    };
    await expect.poll(states, { timeout: 20_000 }).toEqual({ local: 'ok', steady: 'ok' });
    const restartsBefore = steady.connections();
    serverDown();
    await expect
      .poll(async () => (await l.status())?.error, { timeout: 20_000 })
      .toBe('reconnecting');
    // While the first is down, the encoder isn't restarted: the steady one is never cut off.
    await new Promise((r) => setTimeout(r, 6_000));
    expect((await states()).steady).toBe('ok');
    expect(steady.connections()).toBe(restartsBefore);
    serverUp();
    await expect
      .poll(states, { timeout: 45_000, intervals: [1_000] })
      .toEqual({ local: 'ok', steady: 'ok' });
    await l.cmd('stream.stop', { stream: true });
    await expect.poll(async () => (await l.status())?.state, { timeout: 15_000 }).toBe('idle');
  } finally {
    steady.stop();
    serverDown();
  }
});

const STEADY_PORT = 19362;

/** An always-on stand-in on another port, counting the connections it takes (each restart is one). */
function spawnSteady(dir: string): { stop: () => void; connections: () => number } {
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
      `rtmp://127.0.0.1:${STEADY_PORT}/live/test`,
      '-c',
      'copy',
      '-y',
      join(dir, `steady-${++n}.flv`),
    ]);
    proc.once('exit', () => setTimeout(start, 200));
  };
  start();
  return {
    stop: () => {
      up = false;
      proc?.kill('SIGKILL');
    },
    connections: () => n,
  };
}

test('after the reconnect window: the stream stops and says why; a recording carries on', async () => {
  test.setTimeout(120_000);
  // A second app with a short window (the real one is 10 minutes).
  const lib2 = tempLibrary('reconnect-giveup');
  const app2 = await launch(lib2, [], { LAMPSTAND_RECONNECT_WINDOW_MS: '6000' });
  try {
    serverUp();
    await setStream(app2.control, {
      mode: 'light',
      recordWhileStreaming: true,
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
    await app2.cmd('stream.start', { stream: true });
    await waitLive(app2);
    await expect
      .poll(async () => (await app2.status())?.destinations[0]?.state, { timeout: 20_000 })
      .toBe('ok');
    serverDown();
    await expect
      .poll(async () => (await app2.status())?.error, { timeout: 20_000 })
      .toBe('reconnecting');
    // Gave up: no longer streaming, the reason shown, the recording still going.
    await expect
      .poll(
        async () => {
          const s = await app2.status();
          return s ? `${s.error} ${s.streaming} ${s.recording} ${s.state}` : '';
        },
        { timeout: 30_000, intervals: [1_000] },
      )
      .toBe('reconnectFailed false true live');
    await app2.cmd('stream.stop', { record: true });
    await expect.poll(async () => (await app2.status())?.state, { timeout: 15_000 }).toBe('idle');
  } finally {
    serverDown();
    await app2.app.close().catch(() => undefined);
    rmSync(lib2.dir, { recursive: true, force: true });
  }
});

/**
 * A silent drop (a pulled cable, Wi-Fi gone): unlike a server that closes the connection, the
 * connection just stops moving and nothing says so. A proxy in front of the stand-in server
 * freezes the open connection and refuses new ones (the network is down), then lets them
 * through again (it's back).
 */
const PROXY_PORT = 19363;

function freezingProxy(target: number): {
  freeze: () => void;
  restore: () => void;
  close: () => void;
} {
  const live = new Set<Socket>();
  /** The stand-in takes one connection at a time and restarts between them: wait for it, as a
   *  real (always-on) server would just answer. */
  const dial = (client: Socket, tries = 30): void => {
    const up = connect(target, '127.0.0.1');
    up.once('error', () => {
      up.destroy();
      if (tries > 0 && !client.destroyed) setTimeout(() => dial(client, tries - 1), 100);
      else client.destroy();
    });
    up.once('connect', () => {
      client.pipe(up);
      up.pipe(client);
      client.resume();
      for (const s of [client, up]) {
        live.add(s);
        s.on('error', () => undefined);
        s.on('close', () => live.delete(s));
      }
    });
  };
  const server = createNetServer((client) => {
    client.pause();
    client.on('error', () => undefined);
    dial(client);
  });
  server.listen(PROXY_PORT, '127.0.0.1');
  return {
    // The network goes: the open connection stops moving (nothing is closed, no one hears about
    // it) and new connections are refused.
    freeze: () => {
      server.close();
      for (const s of live) {
        s.unpipe();
        s.pause();
      }
    },
    // It's back: the frozen connection is long dead (the server gave up on it).
    restore: () => {
      for (const s of live) s.destroy();
      live.clear();
      server.listen(PROXY_PORT, '127.0.0.1');
    },
    close: () => {
      for (const s of live) s.destroy();
      server.close();
    },
  };
}

for (const pipeline of ['gpu', 'cpu'] as const) {
  test(`a silent drop (${pipeline} pipeline): noticed, waited out, live again; the recording goes on`, async () => {
    test.setTimeout(180_000);
    const lib3 = tempLibrary(`silent-${pipeline}`);
    const app3 = await launch(
      lib3,
      [],
      pipeline === 'cpu' ? { LAMPSTAND_STREAM_PIPELINE: 'cpu' } : {},
    );
    const proxy = freezingProxy(PORT);
    try {
      serverUp();
      await setStream(app3.control, {
        mode: 'light',
        recordWhileStreaming: true,
        destinations: [
          {
            id: 'local',
            kind: 'custom',
            name: 'Stand-in',
            url: `rtmp://127.0.0.1:${PROXY_PORT}/live/test`,
            enabled: true,
          },
        ],
      });
      await app3.cmd('stream.start', { stream: true });
      await waitLive(app3);
      await expect
        .poll(async () => (await app3.status())?.destinations[0]?.state, { timeout: 20_000 })
        .toBe('ok');
      const recordingBytes = (): number => {
        const folder = join(lib3.dir, 'recordings');
        if (!existsSync(folder)) return 0;
        return readdirSync(folder)
          .filter((f) => f.endsWith('.mp4'))
          .reduce((n, f) => n + statSync(join(folder, f)).size, 0);
      };
      await new Promise((r) => setTimeout(r, 3_000));
      proxy.freeze();
      const frozenAt = Date.now();
      // Noticed within a short while, and it stays on (reconnecting, not ended).
      await expect
        .poll(async () => (await app3.status())?.error, { timeout: 90_000, intervals: [500] })
        .toBe('reconnecting');
      console.log(`[${pipeline}] noticed after ${Math.round((Date.now() - frozenAt) / 1000)} s`);
      const before = recordingBytes();
      await new Promise((r) => setTimeout(r, 8_000));
      const s = await app3.status();
      expect(s?.state).not.toBe('idle');
      expect(s?.streaming).toBe(true);
      expect(s?.recording).toBe(true);
      // The recording kept going while the network was down.
      expect(recordingBytes()).toBeGreaterThan(before);
      // The network is back: live again by itself.
      proxy.restore();
      await expect
        .poll(
          async () => {
            const x = await app3.status();
            return x ? `${x.state} ${x.destinations[0]?.state} ${x.error ?? ''}` : '';
          },
          { timeout: 60_000, intervals: [1_000] },
        )
        .toBe('live ok ');
      await app3.cmd('stream.stop', { stream: true, record: true });
      await expect.poll(async () => (await app3.status())?.state, { timeout: 15_000 }).toBe('idle');
    } finally {
      proxy.close();
      serverDown();
      await app3.app.close().catch(() => undefined);
      if (process.env.KEEP_LOG) console.log(`[log] ${lib3.dir}`);
      else rmSync(lib3.dir, { recursive: true, force: true });
    }
  });
}

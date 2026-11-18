import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultMixer,
  defaultSettings,
  parseMidi,
  type LiveState,
  type SurfaceBinding,
  type SurfaceMessage,
} from '@lampstand/core';
import { dbToTravel, travelToDb } from '@lampstand/ui';

const calls = vi.hoisted(() => ({
  actions: [] as string[],
  mixerLive: [] as unknown[],
  mixerCmd: [] as unknown[],
  tbar: [] as (number | 'release')[],
  osc: [] as { address: string; args: unknown[] }[],
  preview: [] as number[],
}));

vi.mock('./shortcuts', () => ({ runShowAction: (a: string) => calls.actions.push(a) }));
vi.mock('./mixer', () => ({
  mixerLive: (a: unknown) => calls.mixerLive.push(a),
  mixerCmd: (a: unknown) => {
    calls.mixerCmd.push(a);
    return Promise.resolve();
  },
}));
vi.mock('./switcher', () => ({
  tbar: (p: number) => calls.tbar.push(p),
  tbarRelease: () => calls.tbar.push('release'),
  switcherSource: (n: number) => ({ deviceId: `cam${n}`, label: `Camera ${n}` }),
  previewSource: (d: { deviceId: string }) => {
    calls.preview.push(Number(d.deviceId.slice(3)));
    return Promise.resolve();
  },
  take: () => Promise.resolve(),
}));
vi.mock('./api', () => ({
  api: {
    onOsc: () => () => {},
    oscSend: (address: string, args: unknown[]) => calls.osc.push({ address, args }),
  },
}));
vi.mock('./store', async () => {
  const { create } = await import('zustand');
  return { useStore: create(() => ({ settings: null, live: null, stream: null })) };
});

const { useStore } = await import('./store');
const { deskEvents, handleSurfaceMessage, installSurfaces, learnControl } =
  await import('./surfaces');

const cc = (number: number, value: number): SurfaceMessage => parseMidi([0xb0, number, value])!;
const note = (number: number, on: boolean): SurfaceMessage =>
  parseMidi([on ? 0x90 : 0x80, number, on ? 100 : 0])!;

function use(bindings: SurfaceBinding[], cues = defaultSettings().surfaces.cues): void {
  const s = defaultSettings();
  const mixer = defaultMixer();
  useStore.setState({
    settings: { ...s, surfaces: { ...s.surfaces, midi: false, bindings, cues } },
    live: { mixer, program: { masks: {} } } as unknown as LiveState,
  });
}

const midi = (type: 'cc' | 'note', number: number) =>
  ({ kind: 'midi', device: '', type, channel: 1, number }) as const;

beforeEach(() => {
  for (const list of Object.values(calls)) list.length = 0;
});

describe('control surface engine', () => {
  it('runs a show action once per button press', () => {
    use([{ id: 'b1', source: midi('note', 36), target: { kind: 'action', action: 'next' } }]);
    handleSurfaceMessage(note(36, true));
    handleSurfaceMessage(note(36, false));
    handleSurfaceMessage(note(36, true));
    handleSurfaceMessage(note(37, true)); // another key: nothing
    expect(calls.actions).toEqual(['next', 'next']);
  });

  it('moves a mixer fader with the desk fader, on the same curve as the screen', () => {
    use([
      {
        id: 'f1',
        source: midi('cc', 7),
        target: { kind: 'fader', bus: 'channel', channelId: 'tracks' },
      },
      { id: 'f2', source: midi('cc', 8), target: { kind: 'fader', bus: 'stream' } },
    ]);
    handleSurfaceMessage(cc(7, 127));
    handleSurfaceMessage(cc(8, 64));
    expect(calls.mixerLive).toEqual([
      { action: 'channel', id: 'tracks', patch: { gainDb: 12 } },
      { action: 'bus', bus: 'stream', patch: { gainDb: travelToDb(64 / 127) } },
    ]);
  });

  it('toggles a mute on each press', () => {
    use([
      { id: 'm1', source: midi('note', 1), target: { kind: 'mute', bus: 'room', mode: 'toggle' } },
    ]);
    handleSurfaceMessage(note(1, true));
    expect(calls.mixerCmd).toEqual([{ action: 'bus', bus: 'room', patch: { mute: true } }]);
  });

  it('follows an X32-style on switch (0 is muted), and ignores a repeat of the same state', () => {
    use([
      {
        id: 'x',
        source: { kind: 'osc', address: '/ch/05/mix/on' },
        target: { kind: 'mute', bus: 'channel', channelId: 'video', mode: 'on' },
      },
    ]);
    const on = (v: number): SurfaceMessage => ({
      source: { kind: 'osc', address: '/ch/05/mix/on' },
      value: v,
      trigger: false,
    });
    handleSurfaceMessage(on(0)); // switched off on the desk: muted
    handleSurfaceMessage(on(1)); // the mixer here still says unmuted: nothing to change
    expect(calls.mixerCmd).toEqual([{ action: 'channel', id: 'video', patch: { mute: true } }]);
  });

  it('puts camera n on Preview', () => {
    use([{ id: 'c', source: midi('note', 5), target: { kind: 'camera', n: 2, take: false } }]);
    handleSurfaceMessage(note(5, true));
    expect(calls.preview).toEqual([2]);
  });

  it('drives the T-bar down for one take and back up for the next', () => {
    use([{ id: 't', source: midi('cc', 20), target: { kind: 'tbar' } }]);
    for (const v of [0, 30, 64, 100, 127, 127]) handleSurfaceMessage(cc(20, v));
    expect(calls.tbar.at(-1)).toBe('release');
    expect(calls.tbar.filter((x) => x === 'release')).toHaveLength(1);
    calls.tbar.length = 0;
    // The bar now rests at the bottom: pushing it back up is the next take.
    for (const v of [127, 90, 40, 0]) handleSurfaceMessage(cc(20, v));
    expect(calls.tbar[0]).toBeCloseTo(1 - 90 / 127, 3);
    expect(calls.tbar.at(-1)).toBe('release');
  });

  it('learns the next control touched instead of acting on it', () => {
    use([{ id: 'b1', source: midi('note', 36), target: { kind: 'action', action: 'next' } }]);
    const learned: unknown[] = [];
    const cancel = learnControl((s) => learned.push(s));
    handleSurfaceMessage(note(36, false)); // a release isn't a touch
    handleSurfaceMessage(note(36, true));
    handleSurfaceMessage(note(36, false));
    handleSurfaceMessage(note(36, true)); // after learning, it acts again
    cancel();
    expect(learned).toEqual([midi('note', 36)]);
    expect(calls.actions).toEqual(['next']);
  });

  it('sends positions back when the mixer moves on screen (not while the desk moves it)', () => {
    const stop = installSurfaces();
    use([
      {
        id: 'o1',
        source: { kind: 'osc', address: '/ch/01/mix/fader' },
        target: { kind: 'fader', bus: 'channel', channelId: 'tracks' },
      },
    ]);
    calls.osc.length = 0;
    const live = useStore.getState().live!;
    const moved = (gainDb: number) => ({
      ...live.mixer,
      channels: live.mixer.channels.map((c) => (c.id === 'tracks' ? { ...c, gainDb } : c)),
    });
    useStore.setState({ live: { ...live, mixer: moved(-10) } });
    expect(calls.osc).toEqual([
      { address: '/ch/01/mix/fader', args: [{ type: 'f', value: dbToTravel(-10) }] },
    ]);
    // The desk's own fader moves it: nothing is echoed back (no fighting the hand on it).
    handleSurfaceMessage({
      source: { kind: 'osc', address: '/ch/01/mix/fader' },
      value: 0.3,
      trigger: false,
    });
    useStore.setState({ live: { ...useStore.getState().live!, mixer: moved(travelToDb(0.3)) } });
    expect(calls.osc).toHaveLength(1);
    stop();
  });

  it('fires desk cues when a video starts and stops, and when a camera goes on', () => {
    const program = (p: Partial<LiveState['program']>) =>
      ({
        program: {
          masks: { black: false },
          content: null,
          media: null,
          input: null,
          background: null,
          ...p,
        },
      }) as unknown as LiveState;
    const video = { kind: 'video', playing: true } as unknown as LiveState['program']['media'];
    expect(deskEvents(program({}), program({ media: video }))).toEqual(['videoPlay']);
    expect(deskEvents(program({ media: video }), program({}))).toEqual(['videoStop', 'clearAll']);
    expect(
      deskEvents(program({}), program({ input: {} as LiveState['program']['input'] })),
    ).toEqual(['cameraOn']);
    expect(deskEvents(program({}), program({ masks: { black: true } } as never))).toEqual([
      'black',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CommandBus,
  EventBus,
  LiveStateStore,
  STARTER_THEMES,
  ThemeSchema,
  BUILT_IN_BACKGROUNDS,
  BackgroundRefSchema,
  standbyKey,
  clearLayer,
  initialLiveState,
  migrate,
  parseBibleMarkup,
  registerLiveCommands,
  resolveLogo,
  resolveStandby,
  defaultSettings,
  stripBibleMarkup,
  formatTimer,
  makeScene,
  secondsUntilTime,
  timerSeconds,
  type ContentLayer,
  type LiveTimer,
} from './index';

const theme = STARTER_THEMES[0]!;
const content = (key: string): ContentLayer => ({
  key,
  kind: 'lyrics',
  theme,
  blocks: [{ spans: [{ text: key }] }],
});

describe('CommandBus', () => {
  it('validates payloads and reports unknown commands', async () => {
    const bus = new CommandBus();
    bus.register({
      type: 'x',
      schema: z.object({ n: z.number() }),
      undoable: false,
      handle: (p) => ({ result: p.n * 2 }),
    });
    expect(await bus.dispatch({ type: 'x', payload: { n: 2 }, source: 'ui' })).toEqual({
      ok: true,
      value: 4,
    });
    expect((await bus.dispatch({ type: 'x', payload: { n: 'a' }, source: 'ui' })).ok).toBe(false);
    const r = await bus.dispatch({ type: 'nope', payload: {}, source: 'ui' });
    expect(!r.ok && r.error.code).toBe('unknown-command');
  });

  it('undo/redo via inverse commands', async () => {
    const bus = new CommandBus();
    let value = 0;
    bus.register({
      type: 'set',
      schema: z.object({ v: z.number() }),
      undoable: true,
      handle: ({ v }) => {
        const prev = value;
        value = v;
        return { result: v, undo: { type: 'set', payload: { v: prev } } };
      },
    });
    await bus.dispatch({ type: 'set', payload: { v: 1 }, source: 'ui' });
    await bus.dispatch({ type: 'set', payload: { v: 2 }, source: 'ui' });
    await bus.undo();
    expect(value).toBe(1);
    await bus.undo();
    expect(value).toBe(0);
    expect(bus.canUndo()).toBe(false);
    await bus.redo();
    expect(value).toBe(1);
    await bus.dispatch({ type: 'set', payload: { v: 9 }, source: 'ui' });
    expect(bus.canRedo()).toBe(false);
  });

  it('runs commands strictly in order and never leaks error details', async () => {
    const bus = new CommandBus();
    const order: number[] = [];
    bus.register({
      type: 'slow',
      schema: z.object({ i: z.number() }),
      undoable: false,
      handle: async ({ i }) => {
        await new Promise((r) => setTimeout(r, 10 - i));
        order.push(i);
        return { result: i };
      },
    });
    bus.register({
      type: 'boom',
      schema: z.object({}),
      undoable: false,
      handle: () => {
        throw new Error('/secret/path');
      },
    });
    await Promise.all(
      [1, 2, 3].map((i) => bus.dispatch({ type: 'slow', payload: { i }, source: 'ui' })),
    );
    expect(order).toEqual([1, 2, 3]);
    const r = await bus.dispatch({ type: 'boom', payload: {}, source: 'ui' });
    expect(JSON.stringify(r)).not.toContain('/secret');
  });

  it('emits an audit trail with the source', async () => {
    const bus = new CommandBus();
    const store = new LiveStateStore();
    registerLiveCommands(bus, store);
    const audit: string[] = [];
    bus.onAudit((e) => audit.push(`${e.type}:${e.source}`));
    await bus.dispatch({ type: 'live.clearLayer', payload: { layer: 'all' }, source: 'shortcut' });
    expect(audit).toEqual(['live.clearLayer:shortcut']);
  });
});

describe('live commands', () => {
  const setup = () => {
    const bus = new CommandBus();
    const store = new LiveStateStore();
    registerLiveCommands(bus, store, () => '2026-01-01T00:00:00Z');
    return {
      bus,
      store,
      run: (type: string, payload: unknown) => bus.dispatch({ type, payload, source: 'ui' }),
    };
  };

  it('preview → program, keeping background continuity', async () => {
    const { store, run } = setup();
    const bg = { ref: { kind: 'color' as const, color: '#112233' } };
    await run('live.goLive', { content: content('a'), background: bg });
    await run('live.setPreview', { content: content('b'), background: null });
    expect(store.get().program.content?.key).toBe('a');
    await run('live.goLive', {});
    expect(store.get().program.content?.key).toBe('b');
    expect(store.get().program.background).toEqual(bg);
    expect(store.get().revision).toBe(3);
  });

  it('going live lifts black/logo masks', async () => {
    const { store, run } = setup();
    await run('live.setMask', { mask: 'black' });
    expect(store.get().program.masks.black).toBe(true);
    await run('live.goLive', { content: content('x') });
    expect(store.get().program.masks.black).toBe(false);
  });

  it('panic clears everything but the background', () => {
    const s = initialLiveState().program;
    const full = {
      ...s,
      content: content('x'),
      background: { ref: { kind: 'color' as const, color: '#000' } },
      overlays: [{ id: '1', kind: 'ticker' as const, text: 't' }],
    };
    const after = clearLayer(full, 'panic');
    expect(after.content).toBeNull();
    expect(after.overlays).toEqual([]);
    expect(after.background).not.toBeNull();
    expect(clearLayer(full, 'all').background).toBeNull();
  });

  it('a cleared layer can be brought back, and only once', async () => {
    const { store, run } = setup();
    const bg = { ref: { kind: 'color' as const, color: '#112233' } };
    await run('live.goLive', { content: content('verse'), background: bg });
    await run('live.clearLayer', { layer: 'content' });
    expect(store.get().program.content).toBeNull();
    expect(store.get().cleared.content?.content?.key).toBe('verse');
    await run('live.restoreLayer', { layer: 'content' });
    expect(store.get().program.content?.key).toBe('verse');
    expect(store.get().cleared.content).toBeUndefined();
    // Nothing remembered any more: restoring again changes nothing on screen.
    await run('live.restoreLayer', { layer: 'content' });
    expect(store.get().program.content?.key).toBe('verse');
    // Turn off live remembers every layer; each comes back on its own.
    await run('live.clearLayer', { layer: 'all' });
    expect(store.get().program.background).toBeNull();
    await run('live.restoreLayer', { layer: 'background' });
    expect(store.get().program.background).toEqual(bg);
    expect(store.get().program.content).toBeNull();
    await run('live.restoreLayer', { layer: 'content' });
    expect(store.get().program.content?.key).toBe('verse');
  });

  it('after Turn off live, restoreAll brings every layer back in one step', async () => {
    const { store, run } = setup();
    const bg = { ref: { kind: 'color' as const, color: '#112233' } };
    const msg = { id: 'm', kind: 'lower-third' as const, text: 'Parent of 12' };
    await run('live.goLive', { content: content('verse'), background: bg });
    await run('live.setOverlays', { overlays: [msg] });
    await run('live.clearLayer', { layer: 'all' });
    expect(store.get().cleared.off?.layers).toEqual(['background', 'content', 'messages']);
    await run('live.restoreAll', {});
    const p = store.get().program;
    expect(p.content?.key).toBe('verse');
    expect(p.background).toEqual(bg);
    expect(p.overlays.map((o) => o.id)).toEqual(['m']);
    expect(store.get().cleared.off).toBeUndefined();
  });

  it('anything new going live cancels "bring it all back"', async () => {
    const { store, run } = setup();
    await run('live.goLive', { content: content('old') });
    await run('live.clearLayer', { layer: 'all' });
    expect(store.get().cleared.off).toBeDefined();
    await run('live.goLive', { content: content('new') });
    expect(store.get().cleared.off).toBeUndefined();
    // The slide button can still bring back the old slide on its own.
    expect(store.get().cleared.content?.content?.key).toBe('old');
  });

  it('a clear group clears its layers in one step and each can be brought back', async () => {
    const { store, run } = setup();
    const bg = { ref: { kind: 'color' as const, color: '#112233' } };
    await run('live.goLive', { content: content('verse'), background: bg });
    const before = store.get().revision;
    await run('live.clearLayers', { layers: ['content', 'props'] });
    expect(store.get().revision).toBe(before + 1);
    expect(store.get().program.content).toBeNull();
    expect(store.get().program.background).toEqual(bg);
    await run('live.restoreLayer', { layer: 'content' });
    expect(store.get().program.content?.key).toBe('verse');
  });

  it('the announcements layer runs alongside the slide, and clears on its own', async () => {
    const { store, run } = setup();
    await run('live.goLive', { content: content('verse') });
    await run('live.setAnnouncement', { content: content('welcome') });
    // A new slide doesn't touch the announcements layer.
    await run('live.goLive', { content: content('verse2') });
    expect(store.get().program.announcement?.key).toBe('welcome');
    await run('live.clearLayer', { layer: 'announcements' });
    expect(store.get().program.announcement).toBeNull();
    expect(store.get().program.content?.key).toBe('verse2');
    await run('live.restoreLayer', { layer: 'announcements' });
    expect(store.get().program.announcement?.key).toBe('welcome');
  });

  it('a cleared camera comes back with the media layer', async () => {
    const { store, run } = setup();
    const cam = { deviceId: 'cam1', label: 'Camera', fit: 'cover' as const };
    await run('live.setInput', { input: cam });
    await run('live.clearLayer', { layer: 'media' });
    expect(store.get().program.input).toBeNull();
    expect(store.get().cleared.input?.deviceId).toBe('cam1');
    await run('live.restoreLayer', { layer: 'media' });
    expect(store.get().program.input?.deviceId).toBe('cam1');
    expect(store.get().cleared.input).toBeUndefined();
  });

  it('a slide going live replaces a camera, unless cameras stay under the words', async () => {
    const { store, run } = setup();
    const cam = { deviceId: 'cam1', label: 'Camera', fit: 'cover' as const };
    await run('live.setInput', { input: cam });
    await run('live.goLive', { content: content('welcome') });
    expect(store.get().program.input).toBeNull();
    await run('live.setInput', { input: cam });
    await run('live.goLive', { content: content('lyrics'), keepInput: true });
    expect(store.get().program.input?.deviceId).toBe('cam1');
    expect(store.get().program.content?.key).toBe('lyrics');
  });

  it('play during a fade-out cancels the fade', async () => {
    const { store, run } = setup();
    await run('live.audio', { action: 'play', mediaId: 'song' });
    await run('live.audio', { action: 'fadeOut', sec: 3 });
    expect(store.get().audio?.fade).toBeDefined();
    await run('live.audio', { action: 'pause' });
    await run('live.audio', { action: 'play' });
    expect(store.get().audio?.fade).toBeUndefined();
    expect(store.get().audio?.playing).toBe(true);
  });

  it('clearing an empty layer keeps what can still be brought back', async () => {
    const { store, run } = setup();
    await run('live.goLive', { content: content('a') });
    await run('live.clearLayer', { layer: 'content' });
    await run('live.clearLayer', { layer: 'all' });
    expect(store.get().cleared.content?.content?.key).toBe('a');
  });

  it('brought-back messages keep the props that are showing', async () => {
    const { store, run } = setup();
    const msg = { id: 'm', kind: 'lower-third' as const, text: 'Parent of 12' };
    const prop = { id: 'b', kind: 'logo-bug' as const, text: 'L' };
    await run('live.setOverlays', { overlays: [msg, prop] });
    await run('live.clearLayer', { layer: 'messages' });
    expect(store.get().program.overlays.map((o) => o.id)).toEqual(['b']);
    await run('live.restoreLayer', { layer: 'messages' });
    expect(store.get().program.overlays.map((o) => o.id)).toEqual(['b', 'm']);
  });

  it('subscriber errors never break delivery', async () => {
    const { store, run } = setup();
    let got = 0;
    store.subscribe(() => {
      throw new Error('bad');
    });
    store.subscribe(() => {
      got++;
    });
    await run('live.clearLayer', { layer: 'content' });
    expect(got).toBe(1);
  });
});

describe('Bible markup', () => {
  it('parses wj/add/nd into spans without HTML', () => {
    expect(parseBibleMarkup('And <nd>LORD</nd> said, <wj>Follow <add>thou</add> me</wj>.')).toEqual(
      [
        { text: 'And ' },
        { text: 'LORD', style: 'nd' },
        { text: ' said, ' },
        { text: 'Follow ', style: 'wj' },
        { text: 'thou', style: 'add' },
        { text: ' me', style: 'wj' },
        { text: '.' },
      ],
    );
    expect(parseBibleMarkup('<script>x</script>')).toEqual([{ text: '<script>x</script>' }]);
    expect(stripBibleMarkup('<wj>Hi</wj>')).toBe('Hi');
  });
});

describe('misc', () => {
  it('starter themes are valid', () => {
    for (const t of STARTER_THEMES) expect(ThemeSchema.safeParse(t).success).toBe(true);
  });
  it('migrations run step by step', () => {
    const r = migrate({ schemaVersion: 1, a: 1 }, 3, {
      1: (o) => ({ ...o, b: 2 }),
      2: (o) => ({ ...o, c: 3 }),
    });
    expect(r).toEqual({ value: { schemaVersion: 3, a: 1, b: 2, c: 3 }, migrated: true });
    expect(() => migrate({ schemaVersion: 1 }, 2, {})).toThrow();
  });
  it('event bus isolates listener errors', () => {
    const bus = new EventBus<{ a: number }>();
    let n = 0;
    bus.on('a', () => {
      throw new Error('x');
    });
    const off = bus.on('a', (v) => {
      n += v;
    });
    bus.emit('a', 2);
    off();
    bus.emit('a', 2);
    expect(n).toBe(2);
  });
});

describe('shared helpers', () => {
  it('formatClock: mm:ss, h:mm:ss, fixed-width hours', async () => {
    const { formatClock, secondsSince } = await import('./index');
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(3661)).toBe('1:01:01');
    expect(formatClock(5, { hours: 'always' })).toBe('00:00:05');
    expect(formatClock(-3)).toBe('00:00');
    expect(secondsSince('1970-01-01T00:00:10Z', 15_000)).toBe(5);
    expect(secondsSince('1970-01-01T00:00:10Z', 0)).toBe(0);
  });
  it('makeScene fills empty layers; content vs visible', async () => {
    const { makeScene, sceneHasContent, sceneIsVisible, EMPTY_SCENE } = await import('./index');
    expect(makeScene()).toEqual(EMPTY_SCENE);
    const bgOnly = makeScene({ background: { ref: { kind: 'color', color: '#000' } } });
    expect(sceneHasContent(bgOnly)).toBe(false);
    expect(sceneIsVisible(bgOnly)).toBe(true);
    expect(
      sceneHasContent(
        makeScene({
          media: {
            mediaId: 'm',
            kind: 'image',
            loop: false,
            muted: false,
            fit: 'cover',
            playing: true,
            position: 0,
            volume: 1,
          },
        }),
      ),
    ).toBe(true);
  });
});

describe('CommandBus history notifications', () => {
  it('notifies history listeners on undo and redo, not just on new steps', async () => {
    const bus = new CommandBus();
    let v = 0;
    bus.register({
      type: 'set',
      schema: z.object({ v: z.number() }),
      undoable: true,
      handle: ({ v: next }) => {
        const prev = v;
        v = next;
        return { result: v, undo: { type: 'set', payload: { v: prev } } };
      },
    });
    const states: string[] = [];
    bus.onHistoryChange(() => states.push(`${bus.canUndo()}/${bus.canRedo()}`));
    await bus.dispatch({ type: 'set', payload: { v: 1 }, source: 'ui' });
    await bus.undo();
    await bus.redo();
    expect(states).toEqual(['true/false', 'false/true', 'false/true', 'true/false', 'true/false']);
    expect(v).toBe(1);
  });
});

describe('media in preview / program', () => {
  const video = {
    mediaId: 'vid-1',
    kind: 'video' as const,
    loop: true,
    muted: false,
    fit: 'contain' as const,
  };
  const setup = () => {
    const bus = new CommandBus();
    const store = new LiveStateStore();
    registerLiveCommands(bus, store);
    return {
      store,
      run: (type: string, payload: unknown) => bus.dispatch({ type, payload, source: 'ui' }),
    };
  };

  it('a media item can sit in preview and go live from it', async () => {
    const { store, run } = setup();
    await run('live.setPreview', { content: null, background: null, media: video });
    expect(store.get().preview.media).toMatchObject(video);
    expect(store.get().program.media).toBeNull(); // nothing on screen yet
    await run('live.goLive', {});
    expect(store.get().program.media).toMatchObject(video);
  });

  it('text and full-screen media replace each other; the background stays', async () => {
    const { store, run } = setup();
    const bg = { ref: { kind: 'color' as const, color: '#101010' } };
    await run('live.goLive', { content: content('verse'), background: bg });
    await run('live.goLive', { media: video, content: null });
    expect(store.get().program.content).toBeNull(); // the verse is not left on top of the video
    expect(store.get().program.media).toMatchObject(video);
    expect(store.get().program.background).toEqual(bg);
    await run('live.goLive', { content: content('lyrics') });
    expect(store.get().program.media).toBeNull();
    expect(store.get().program.content?.key).toBe('lyrics');
    expect(store.get().program.background).toEqual(bg);
  });
});

describe('live video transport', () => {
  const clip = {
    mediaId: 'v',
    kind: 'video' as const,
    loop: false,
    muted: false,
    fit: 'contain' as const,
    playing: true,
    position: 0,
    volume: 1,
  };
  it('pause/seek/play/restart re-anchor the shared timeline', async () => {
    let t = Date.parse('2026-01-01T00:00:00Z');
    const nowIso = () => new Date(t).toISOString();
    const bus = new CommandBus();
    const store = new LiveStateStore();
    registerLiveCommands(bus, store, nowIso);
    const run = (type: string, payload: unknown) => bus.dispatch({ type, payload, source: 'ui' });
    const { mediaPositionAt } = await import('./index');
    const m = () => store.get().program.media!;

    await run('live.goLive', { media: clip, content: null });
    expect(m().syncedAt).toBe(nowIso());
    t += 10_000;
    expect(mediaPositionAt(m(), t)).toBe(10);
    await run('live.media', { action: 'pause' });
    expect(m().playing).toBe(false);
    expect(m().position).toBeCloseTo(10, 1);
    t += 5_000;
    expect(mediaPositionAt(m(), t)).toBeCloseTo(10, 1); // paused: time doesn't advance
    await run('live.media', { action: 'seek', position: 42 });
    expect(mediaPositionAt(m(), t)).toBe(42);
    await run('live.media', { action: 'play', volume: 0.5, loop: true });
    t += 2_000;
    expect(mediaPositionAt(m(), t)).toBeCloseTo(44, 1);
    expect(m().volume).toBe(0.5);
    expect(mediaPositionAt(m(), t, 40)).toBeCloseTo(4, 1); // looping wraps
    await run('live.media', { action: 'restart' });
    expect(mediaPositionAt(m(), t)).toBe(0);
  });
  it('a finished non-looping video clamps at its end', async () => {
    const { mediaPositionAt } = await import('./index');
    const media = { ...clip, syncedAt: '2026-01-01T00:00:00Z' };
    expect(mediaPositionAt(media, Date.parse('2026-01-01T00:10:00Z'), 30)).toBe(30);
  });
});

describe('video cues: autoplay, preview playback, trim and fades', () => {
  const clip = {
    mediaId: 'v',
    kind: 'video' as const,
    loop: false,
    muted: false,
    fit: 'contain' as const,
    playing: true,
    position: 0,
    volume: 1,
  };
  const setup = () => {
    let t = Date.parse('2026-01-01T00:00:00Z');
    const bus = new CommandBus();
    const store = new LiveStateStore();
    registerLiveCommands(bus, store, () => new Date(t).toISOString());
    return {
      store,
      tick: (ms: number) => (t += ms),
      now: () => t,
      run: (type: string, payload: unknown) => bus.dispatch({ type, payload, source: 'ui' }),
    };
  };

  it('going live with autoplay off waits on the first frame', async () => {
    const { store, run } = setup();
    await run('live.goLive', { media: clip, content: null, autoplay: false });
    expect(store.get().program.media?.playing).toBe(false);
    await run('live.goLive', { media: clip, content: null });
    expect(store.get().program.media?.playing).toBe(true);
  });

  it('the transport can play the video waiting in Preview without touching the screen', async () => {
    const { store, run, tick, now } = setup();
    const { mediaPositionAt } = await import('./index');
    await run('live.setPreview', {
      content: null,
      background: null,
      media: { ...clip, playing: false },
    });
    await run('live.media', { action: 'play', target: 'preview' });
    tick(3_000);
    expect(mediaPositionAt(store.get().preview.media!, now())).toBeCloseTo(3, 1);
    expect(store.get().program.media).toBeNull();
    // Going live always starts from the beginning.
    await run('live.goLive', {});
    expect(store.get().program.media?.position).toBe(0);
  });

  it('trimmed clips start at the in-point, stop or loop at the out-point', async () => {
    const { mediaPositionAt, mediaEnd, startMedia } = await import('./index');
    const t0 = Date.parse('2026-01-01T00:00:00Z');
    const trimmed = startMedia({ ...clip, start: 5, end: 15 }, '2026-01-01T00:00:00Z');
    expect(trimmed.position).toBe(5);
    expect(mediaEnd(trimmed, 60)).toBe(15);
    expect(mediaPositionAt(trimmed, t0 + 30_000, 60)).toBe(15); // stops at the out-point
    const looping = { ...trimmed, loop: true };
    expect(mediaPositionAt(looping, t0 + 12_000, 60)).toBeCloseTo(7, 1); // 5 + (17-5) % 10
  });

  it('fades follow the in- and out-points', async () => {
    const { mediaFadeAt } = await import('./index');
    const faded = { ...clip, start: 2, end: 12, fadeIn: 2, fadeOut: 4 };
    expect(mediaFadeAt(faded, 2, 60)).toBe(0);
    expect(mediaFadeAt(faded, 3, 60)).toBeCloseTo(0.5);
    expect(mediaFadeAt(faded, 6, 60)).toBe(1);
    expect(mediaFadeAt(faded, 10, 60)).toBeCloseTo(0.5);
    expect(mediaFadeAt(faded, 12, 60)).toBe(0);
  });
});

describe('looks', () => {
  it('a look keeps only the layers it lists; masks always apply', async () => {
    const { applyLook, makeScene } = await import('./index');
    const scene = makeScene({
      background: { ref: { kind: 'color', color: '#000' } },
      overlays: [
        { id: 'm', kind: 'lower-third', text: 'Parent of 12' },
        { id: 'b', kind: 'logo-bug', text: 'L' },
      ],
      masks: { black: true, logo: false, freeze: false },
    });
    const lobby = applyLook(scene, ['background', 'props']);
    expect(lobby.background).not.toBeNull();
    expect(lobby.overlays.map((o) => o.id)).toEqual(['b']);
    expect(lobby.masks.black).toBe(true);
    expect(applyLook(scene, null)).toBe(scene);
  });

  it('switching looks is a live command', async () => {
    const bus = new CommandBus();
    const store = new LiveStateStore();
    registerLiveCommands(bus, store, () => '2026-01-01T00:00:00Z');
    const look = { id: 'l', name: 'Lobby', main: ['content' as const], secondary: [] };
    await bus.dispatch({ type: 'live.setLook', payload: { look }, source: 'ui' });
    expect(store.get().look?.name).toBe('Lobby');
    await bus.dispatch({ type: 'live.setLook', payload: { look: null }, source: 'ui' });
    expect(store.get().look).toBeNull();
  });
});

describe('logo and off-air screen', () => {
  const kinds: Record<string, string> = { pic: 'image', clip: 'video', song: 'audio' };
  const kindOf = (id: string): string | undefined => kinds[id];
  const logo = defaultSettings().logo;
  it('defaults to the Lampstand logo card, also as the off-air screen', () => {
    expect(resolveLogo(logo, kindOf)).toEqual({ kind: 'logo', text: 'Lampstand', style: 'halo' });
    expect(resolveStandby(defaultSettings().offAir, logo, kindOf)).toEqual({
      kind: 'logo',
      text: 'Lampstand',
      style: 'halo',
    });
  });
  it('carries the card look and tagline, and they change its identity', () => {
    const card = resolveLogo(
      { kind: 'text', text: 'Grace', style: 'gold', tagline: '  Welcome home ' },
      kindOf,
    );
    expect(card).toEqual({ kind: 'logo', text: 'Grace', style: 'gold', tagline: 'Welcome home' });
    expect(standbyKey(card)).not.toBe(
      standbyKey({ kind: 'logo', text: 'Grace', style: 'rays', tagline: 'Welcome home' }),
    );
    expect(standbyKey(card)).not.toBe(standbyKey({ kind: 'logo', text: 'Grace', style: 'gold' }));
  });
  it('every built-in background is valid, and starter themes use them', () => {
    for (const b of BUILT_IN_BACKGROUNDS)
      expect(BackgroundRefSchema.safeParse(b.ref).success).toBe(true);
    expect(new Set(BUILT_IN_BACKGROUNDS.map((b) => b.name)).size).toBe(BUILT_IN_BACKGROUNDS.length);
    expect(new Set(STARTER_THEMES.map((t) => t.id)).size).toBe(STARTER_THEMES.length);
  });
  it('the logo can be a church name, an image or a video', () => {
    expect(resolveLogo({ kind: 'text', text: 'Grace Church' }, kindOf)).toEqual({
      kind: 'logo',
      text: 'Grace Church',
    });
    expect(resolveLogo({ kind: 'media', text: 'x', mediaId: 'pic' }, kindOf)).toEqual({
      kind: 'image',
      mediaId: 'pic',
    });
    expect(resolveLogo({ kind: 'media', text: 'x', mediaId: 'clip' }, kindOf)).toEqual({
      kind: 'video',
      mediaId: 'clip',
    });
    // Blank name or a deleted/audio pick → the name card, never a broken frame.
    expect(resolveLogo({ kind: 'text', text: '  ' }, kindOf)).toEqual({
      kind: 'logo',
      text: 'Lampstand',
    });
    expect(resolveLogo({ kind: 'media', text: 'Grace', mediaId: 'song' }, kindOf)).toEqual({
      kind: 'logo',
      text: 'Grace',
    });
  });
  it('off-air "Logo" follows the logo setting; black and pictures resolve directly', () => {
    const picLogo = { kind: 'media' as const, text: 'x', mediaId: 'pic' };
    expect(resolveStandby({ kind: 'logo' }, picLogo, kindOf)).toEqual({
      kind: 'image',
      mediaId: 'pic',
    });
    expect(resolveStandby({ kind: 'black' }, picLogo, kindOf)).toEqual({ kind: 'black' });
    expect(resolveStandby({ kind: 'media', mediaId: 'clip' }, logo, kindOf)).toEqual({
      kind: 'video',
      mediaId: 'clip',
    });
    for (const mediaId of ['gone', 'song', undefined])
      expect(resolveStandby({ kind: 'media', mediaId }, logo, kindOf).kind).toBe('logo');
  });
});

describe('timers', () => {
  const run = (over: Partial<LiveTimer>): LiveTimer => ({
    id: 't',
    name: 'T',
    kind: 'countdown',
    durationSec: 300,
    running: false,
    startedAt: null,
    accumulatedSec: 0,
    ...over,
  });
  it('countdowns count down and overrun into negatives', () => {
    const start = Date.parse('2026-01-01T10:00:00Z');
    const t = run({ running: true, startedAt: new Date(start).toISOString() });
    expect(timerSeconds(t, start + 60_000)).toBe(240);
    expect(formatTimer(timerSeconds(t, start + 60_000))).toBe('04:00');
    expect(formatTimer(timerSeconds(t, start + 312_000))).toBe('-00:12');
  });
  it('elapsed timers keep their time across stop/start', () => {
    const start = Date.parse('2026-01-01T10:00:00Z');
    const t = run({
      kind: 'elapsed',
      accumulatedSec: 90,
      running: true,
      startedAt: new Date(start).toISOString(),
    });
    expect(formatTimer(timerSeconds(t, start + 30_500), 'elapsed')).toBe('02:00');
    expect(timerSeconds({ ...t, running: false, startedAt: null }, start + 999_000)).toBe(90);
  });
  it('to-time counts down to a time of day', () => {
    const now = new Date(2026, 0, 1, 10, 55, 0).getTime();
    expect(secondsUntilTime('11:00', now)).toBe(300);
    expect(secondsUntilTime('10:50', now)).toBe(-300); // just passed: overrun
    expect(secondsUntilTime('08:00', new Date(2026, 0, 1, 20, 0).getTime())).toBe(12 * 3600); // tomorrow
  });
  it('start / stop / reset commands drive live timers', async () => {
    const store = new LiveStateStore();
    const bus = new CommandBus();
    registerLiveCommands(bus, store);
    const def = { id: 'sermon', name: 'Sermon', kind: 'elapsed' as const };
    await bus.dispatch({ type: 'timer.start', payload: { timer: def }, source: 'ui' });
    expect(store.get().timers).toHaveLength(1);
    expect(store.get().timers[0]?.running).toBe(true);
    await bus.dispatch({ type: 'timer.stop', payload: { id: 'sermon' }, source: 'ui' });
    expect(store.get().timers[0]?.running).toBe(false);
    await bus.dispatch({ type: 'timer.start', payload: { timer: def }, source: 'ui' });
    expect(store.get().timers).toHaveLength(1); // restarted, not duplicated
    await bus.dispatch({ type: 'timer.reset', payload: { id: 'sermon' }, source: 'ui' });
    expect(store.get().timers).toHaveLength(0);
  });
});

describe('messages and props clear separately', () => {
  it('clearLayer messages keeps props, and vice versa', () => {
    const scene = makeScene({
      overlays: [
        { id: 'm', kind: 'lower-third', text: 'Parent of 12' },
        { id: 't', kind: 'ticker', text: 'Car' },
        {
          id: 'p',
          kind: 'prop',
          text: '',
          mediaId: 'logo',
          mediaKind: 'image',
          position: 'top-right',
        },
        { id: 'b', kind: 'logo-bug', text: 'L' },
      ],
    });
    expect(clearLayer(scene, 'messages').overlays.map((o) => o.id)).toEqual(['p', 'b']);
    expect(clearLayer(scene, 'props').overlays.map((o) => o.id)).toEqual(['m', 't']);
  });
});

describe('web pages', () => {
  it('a web page replaces the slide, a slide replaces the page, and clearing removes it', async () => {
    const store = new LiveStateStore();
    const bus = new CommandBus();
    registerLiveCommands(bus, store);
    const web = { key: 'w1', url: 'https://example.com/give' };
    await bus.dispatch({
      type: 'live.goLive',
      payload: { content: content('verse') },
      source: 'ui',
    });
    await bus.dispatch({ type: 'live.goLive', payload: { web, content: null }, source: 'ui' });
    expect(store.get().program.web).toEqual(web);
    expect(store.get().program.content).toBeNull();
    await bus.dispatch({
      type: 'live.goLive',
      payload: { content: content('next') },
      source: 'ui',
    });
    expect(store.get().program.web).toBeNull();
    await bus.dispatch({ type: 'live.goLive', payload: { web }, source: 'ui' });
    await bus.dispatch({ type: 'live.clearLayer', payload: { layer: 'content' }, source: 'ui' });
    expect(store.get().program.web).toBeNull();
  });

  it('only secure https addresses are accepted', async () => {
    const store = new LiveStateStore();
    const bus = new CommandBus();
    registerLiveCommands(bus, store);
    for (const url of [
      'http://example.com',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'https://u:p@x.com',
    ]) {
      const r = await bus.dispatch({
        type: 'live.goLive',
        payload: { web: { key: 'w', url } },
        source: 'ui',
      });
      expect(r.ok).toBe(false);
    }
  });
});

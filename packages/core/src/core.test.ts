import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CommandBus,
  EventBus,
  LiveStateStore,
  STARTER_THEMES,
  ThemeSchema,
  clearLayer,
  initialLiveState,
  migrate,
  parseBibleMarkup,
  registerLiveCommands,
  resolveLogo,
  resolveStandby,
  defaultSettings,
  stripBibleMarkup,
  type ContentLayer,
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

describe('logo and off-air screen', () => {
  const kinds: Record<string, string> = { pic: 'image', clip: 'video', song: 'audio' };
  const kindOf = (id: string): string | undefined => kinds[id];
  const logo = defaultSettings().logo;
  it('defaults to the Lampstand logo card, also as the off-air screen', () => {
    expect(resolveLogo(logo, kindOf)).toEqual({ kind: 'logo', text: 'Lampstand' });
    expect(resolveStandby(defaultSettings().offAir, logo, kindOf)).toEqual({
      kind: 'logo',
      text: 'Lampstand',
    });
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

import { z } from 'zod';
import {
  BackgroundLayerSchema,
  ContentLayerSchema,
  MediaLayerSchema,
  WebLayerSchema,
  OverlaySchema,
  SceneSchema,
  type BackgroundLayer,
  type ContentLayer,
  type MediaLayer,
  type WebLayer,
  type Scene,
} from './schemas/scene';
import { TransitionSpecSchema } from './schemas/theme';
import { LiveTimerSchema, TimerDefSchema, type LiveTimer } from './schemas/timers';
import type { CommandBus } from './commands';
import { mediaPositionAt, mediaStart, startMedia } from './utils/mediaPlayback';
import { EMPTY_MASKS, makeScene, overlayGroup } from './utils/scene';

export const DetectionModeSchema = z.enum(['off', 'suggest', 'approve', 'auto']);
export type DetectionMode = z.infer<typeof DetectionModeSchema>;

export const PreviewSchema = z.object({
  content: ContentLayerSchema.nullable(),
  background: BackgroundLayerSchema.nullable(),
  /** Full-screen media (video/image item) waiting in preview. */
  media: MediaLayerSchema.nullable().optional(),
  /** Slide shown after this one — fed to the stage display when this goes live. */
  next: ContentLayerSchema.nullable().optional(),
  /** A web page waiting in preview. */
  web: WebLayerSchema.nullable().optional(),
});
export type Preview = z.infer<typeof PreviewSchema>;

/**
 * What the last clear took off each layer, so the operator can bring it back with one click
 * (the layer buttons beside the monitor become "restore" while the layer is empty).
 */
export const ClearedLayersSchema = z.object({
  content: z
    .object({
      content: ContentLayerSchema.nullable(),
      web: WebLayerSchema.nullable(),
      next: ContentLayerSchema.nullable(),
    })
    .optional(),
  /** Paused-in-time copy: `position` is where the video was when it was cleared. */
  media: MediaLayerSchema.optional(),
  background: BackgroundLayerSchema.optional(),
  messages: z.array(OverlaySchema).max(10).optional(),
  props: z.array(OverlaySchema).max(10).optional(),
  /**
   * Set by Turn off live: when, and which layers it took off, so the power button can bring
   * them all back. Dropped as soon as anything new goes on screen.
   */
  off: z
    .object({
      at: z.string().max(40),
      layers: z.array(z.enum(['content', 'media', 'background', 'messages', 'props'])).max(5),
    })
    .optional(),
});
export type ClearedLayers = z.infer<typeof ClearedLayersSchema>;

export const RestorableLayerSchema = z.enum([
  'content',
  'media',
  'background',
  'messages',
  'props',
]);
export type RestorableLayer = z.infer<typeof RestorableLayerSchema>;

export const LiveStateSchema = z.object({
  revision: z.number().int(),
  preview: PreviewSchema,
  program: SceneSchema,
  /** Next slide for the stage display. */
  next: ContentLayerSchema.nullable(),
  programSince: z.string().nullable(),
  testPatterns: z.array(z.string()),
  stageMessage: z
    .object({ text: z.string().max(300), flash: z.boolean(), sentAt: z.string() })
    .nullable(),
  detection: z.object({ mode: DetectionModeSchema }),
  stream: z.object({ status: z.enum(['idle', 'live', 'error']) }),
  /** Timers that have been started (shown in the Timers bin and on the stage display). */
  timers: z.array(LiveTimerSchema).max(20).default([]),
  cleared: ClearedLayersSchema.default({}),
});
export type LiveState = z.infer<typeof LiveStateSchema>;

export function initialLiveState(): LiveState {
  return {
    revision: 0,
    preview: { content: null, background: null, media: null, next: null },
    program: makeScene(),
    next: null,
    programSince: null,
    testPatterns: [],
    stageMessage: null,
    detection: { mode: 'off' },
    stream: { status: 'idle' },
    timers: [],
    cleared: {},
  };
}

/**
 * Single source of truth for what is on every output (§3.2). Lives in the main process;
 * outputs receive snapshots. Pure — no Electron.
 */
export class LiveStateStore {
  private state: LiveState;
  private listeners = new Set<(s: LiveState) => void>();

  constructor(initial: LiveState = initialLiveState()) {
    this.state = initial;
  }

  get(): LiveState {
    return this.state;
  }

  update(mutate: (s: LiveState) => Omit<LiveState, 'revision'>): LiveState {
    const next = mutate(this.state);
    this.state = { ...next, revision: this.state.revision + 1 };
    for (const l of [...this.listeners]) {
      try {
        l(this.state);
      } catch {
        /* never let one subscriber break output delivery */
      }
    }
    return this.state;
  }

  subscribe(l: (s: LiveState) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export const LayerSchema = z.enum([
  'content',
  'media',
  'background',
  'overlays',
  'messages',
  'props',
  'all',
  'panic',
]);
export type Layer = z.infer<typeof LayerSchema>;

export function clearLayer(scene: Scene, layer: Layer): Scene {
  switch (layer) {
    case 'content':
      // The web page counts as "the slide" too.
      return { ...scene, content: null, web: null };
    case 'media':
      return { ...scene, media: null };
    case 'background':
      return { ...scene, background: null };
    case 'overlays':
      return { ...scene, overlays: [] };
    case 'messages':
    case 'props':
      return { ...scene, overlays: scene.overlays.filter((o) => overlayGroup(o) !== layer) };
    case 'all':
      return makeScene();
    case 'panic':
      // Clear everything except the background so the room never goes to a jarring black.
      return {
        ...scene,
        media: null,
        content: null,
        web: null,
        overlays: [],
        masks: EMPTY_MASKS,
      };
  }
}

/** The layers a clear empties (`overlays` = messages and props). */
const CLEARS: Record<Layer, RestorableLayer[]> = {
  content: ['content'],
  media: ['media'],
  background: ['background'],
  overlays: ['messages', 'props'],
  messages: ['messages'],
  props: ['props'],
  all: ['content', 'media', 'background', 'messages', 'props'],
  panic: ['content', 'media', 'messages', 'props'],
};

/**
 * Remember what a clear is about to remove. Only layers that have something are remembered, so
 * clearing an already-empty layer never forgets what could still be brought back.
 */
export function rememberCleared(s: LiveState, layer: Layer, nowMs: number): ClearedLayers {
  const p = s.program;
  const out = withoutOff(s.cleared);
  const taken: RestorableLayer[] = [];
  for (const l of CLEARS[layer]) {
    if (l === 'content' && (p.content || p.web)) {
      out.content = { content: p.content, web: p.web ?? null, next: s.next };
      taken.push(l);
    }
    if (l === 'media' && p.media) {
      out.media = { ...p.media, position: mediaPositionAt(p.media, nowMs) };
      taken.push(l);
    }
    if (l === 'background' && p.background) {
      out.background = p.background;
      taken.push(l);
    }
    if (l === 'messages' || l === 'props') {
      const group = p.overlays.filter((o) => overlayGroup(o) === l);
      if (group.length) {
        out[l] = group;
        taken.push(l);
      }
    }
  }
  if (layer === 'all' && taken.length)
    out.off = { at: new Date(nowMs).toISOString(), layers: taken };
  // Turning off an already-empty screen keeps the earlier "bring it all back".
  else if (layer === 'all' && s.cleared.off) out.off = s.cleared.off;
  return out;
}

/** The cleared layers without the Turn-off-live marker (something new is on screen). */
export function withoutOff(c: ClearedLayers): ClearedLayers {
  if (!c.off) return c;
  return Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'off'));
}

/** Power button after Turn off live: put back every layer it took off, in one step. */
export function restoreAll(s: LiveState, nowIso: string): LiveState {
  const layers = s.cleared.off?.layers ?? [];
  let next: LiveState = { ...s, cleared: withoutOff(s.cleared) };
  // Background first, so the words never flash up on black.
  for (const l of ['background', 'media', 'content', 'messages', 'props'] as const)
    if (layers.includes(l)) next = restoreLayer(next, l, nowIso);
  return next;
}

/** Put a remembered layer back on screen (and forget it). Unchanged if nothing is remembered. */
export function restoreLayer(s: LiveState, layer: RestorableLayer, nowIso: string): LiveState {
  const c = s.cleared;
  // Forget the layer once it's back; the screen isn't "off" any more either.
  const cleared = Object.fromEntries(
    Object.entries(c).filter(([k]) => k !== layer && k !== 'off'),
  ) as ClearedLayers;
  const program = s.program;
  switch (layer) {
    case 'content':
      if (!c.content) return s;
      // Text and full-screen media are both "the slide": bringing one back replaces the other.
      return {
        ...s,
        cleared,
        next: c.content.next,
        program: { ...program, content: c.content.content, web: c.content.web, media: null },
      };
    case 'media':
      if (!c.media) return s;
      return {
        ...s,
        cleared,
        // It carries on from where it was cleared.
        program: { ...program, media: { ...c.media, syncedAt: nowIso }, content: null, web: null },
      };
    case 'background':
      if (!c.background) return s;
      return { ...s, cleared, program: { ...program, background: c.background } };
    case 'messages':
    case 'props': {
      const back = c[layer];
      if (!back) return s;
      const ids = new Set(back.map((o) => o.id));
      const overlays = [...program.overlays.filter((o) => !ids.has(o.id)), ...back].slice(-10);
      return { ...s, cleared, program: { ...program, overlays } };
    }
  }
}

const SetPreviewSchema = PreviewSchema;
const GoLiveSchema = z.object({
  /** If omitted, the current preview goes live. */
  content: ContentLayerSchema.nullable().optional(),
  background: BackgroundLayerSchema.nullable().optional(),
  /** Full-screen media item. If omitted with no content either, the preview's media goes live. */
  media: MediaLayerSchema.nullable().optional(),
  /** A web page; like media, it replaces the slide text while it shows. */
  web: WebLayerSchema.nullable().optional(),
  next: ContentLayerSchema.nullable().optional(),
  transition: TransitionSpecSchema.optional(),
  /** Video going live: start playing at once (default) or wait on the first frame for Play. */
  autoplay: z.boolean().optional(),
});

/** Registers every live-output command. Pure logic; the main process wires it to IPC. */
export function registerLiveCommands(
  bus: CommandBus,
  store: LiveStateStore,
  now = () => new Date().toISOString(),
): void {
  bus.register({
    type: 'live.setPreview',
    schema: SetPreviewSchema,
    undoable: false,
    handle: (p) => {
      store.update((s) => ({
        ...s,
        preview: {
          content: p.content,
          background: p.background,
          media: p.media ?? null,
          next: p.next ?? null,
          web: p.web ?? null,
        },
      }));
      return { result: null };
    },
  });

  bus.register({
    type: 'live.goLive',
    schema: GoLiveSchema,
    undoable: false,
    handle: (p) => {
      store.update((s) => {
        const explicit = p.content !== undefined || p.media !== undefined || p.web !== undefined;
        const web: WebLayer | null =
          p.web !== undefined ? p.web : explicit ? null : (s.preview.web ?? null);
        const content: ContentLayer | null =
          p.content !== undefined ? p.content : explicit ? null : s.preview.content;
        const picked: MediaLayer | null =
          p.media !== undefined ? p.media : explicit ? null : (s.preview.media ?? null);
        // Media that goes live starts from the top, stamped so every output plays in sync.
        const media = picked
          ? { ...startMedia(picked, now()), playing: p.autoplay !== false }
          : null;
        const bgFromPayload: BackgroundLayer | null | undefined =
          p.background !== undefined ? p.background : s.preview.background;
        const next = p.next !== undefined ? p.next : (s.preview.next ?? null);
        // Background continuity: only replace the background if a new one was provided.
        const background = bgFromPayload ?? s.program.background;
        // Text and full-screen media are both "the slide": whichever goes live replaces the other,
        // so a verse never stays on top of a video (backgrounds sit behind and are untouched).
        const program: Scene = {
          ...s.program,
          content,
          media,
          web,
          background,
          // Going live with new content lifts black/logo masks — the operator intends to show it.
          masks: { ...s.program.masks, black: false, logo: false },
        };
        if (p.transition) program.transition = p.transition;
        else delete program.transition;
        return { ...s, program, next, programSince: now(), cleared: withoutOff(s.cleared) };
      });
      return { result: null };
    },
  });

  bus.register({
    // Refresh the slide on screen in place (e.g. transposed chords for the stage), without
    // counting it as a new go-live. Ignored if a different slide has gone live since.
    type: 'live.updateContent',
    schema: z.object({ content: ContentLayerSchema }),
    undoable: false,
    handle: (p) => {
      store.update((s) =>
        s.program.content?.key === p.content.key
          ? { ...s, program: { ...s.program, content: p.content } }
          : s,
      );
      return { result: null };
    },
  });

  bus.register({
    type: 'live.clearLayer',
    schema: z.object({ layer: LayerSchema }),
    undoable: false,
    handle: (p) => {
      store.update((s) => ({
        ...s,
        cleared: rememberCleared(s, p.layer, Date.parse(now())),
        program: clearLayer(s.program, p.layer),
        next: p.layer === 'content' || p.layer === 'all' || p.layer === 'panic' ? null : s.next,
      }));
      return { result: null };
    },
  });

  bus.register({
    type: 'live.restoreLayer',
    schema: z.object({ layer: RestorableLayerSchema }),
    undoable: false,
    handle: (p) => {
      store.update((s) => restoreLayer(s, p.layer, now()));
      return { result: null };
    },
  });

  bus.register({
    type: 'live.restoreAll',
    schema: z.object({}),
    undoable: false,
    handle: () => {
      store.update((s) => restoreAll(s, now()));
      return { result: null };
    },
  });

  bus.register({
    type: 'live.setMask',
    schema: z.object({ mask: z.enum(['black', 'logo', 'freeze']), value: z.boolean().optional() }),
    undoable: false,
    handle: (p) => {
      store.update((s) => {
        const masks = { ...s.program.masks };
        masks[p.mask] = p.value ?? !masks[p.mask];
        return { ...s, program: { ...s.program, masks } };
      });
      return { result: null };
    },
  });

  bus.register({
    type: 'live.setBackground',
    schema: z.object({ background: BackgroundLayerSchema.nullable() }),
    undoable: false,
    handle: (p) => {
      store.update((s) => ({ ...s, program: { ...s.program, background: p.background } }));
      return { result: null };
    },
  });

  bus.register({
    type: 'live.setMedia',
    schema: z.object({ media: MediaLayerSchema.nullable() }),
    undoable: false,
    handle: (p) => {
      store.update((s) => ({
        ...s,
        program: { ...s.program, media: p.media ? startMedia(p.media, now()) : null },
      }));
      return { result: null };
    },
  });

  bus.register({
    // Transport for the live video: play/pause/seek/restart, volume, mute and loop (§12).
    type: 'live.media',
    schema: z.object({
      action: z.enum(['play', 'pause', 'toggle', 'seek', 'restart', 'set']),
      /** Which video: the one on screen (default) or the one waiting in Preview. */
      target: z.enum(['program', 'preview']).optional(),
      position: z.number().min(0).max(86_400).optional(),
      volume: z.number().min(0).max(1).optional(),
      muted: z.boolean().optional(),
      loop: z.boolean().optional(),
    }),
    undoable: false,
    handle: (p) => {
      store.update((s) => {
        const preview = p.target === 'preview';
        const m = preview ? s.preview.media : s.program.media;
        if (!m) return s;
        const nowIso = now();
        // Re-anchor the timeline at "now" so the change applies from this instant on every output.
        const here = mediaPositionAt(m, Date.parse(nowIso));
        const playing =
          p.action === 'play' || p.action === 'restart'
            ? true
            : p.action === 'pause'
              ? false
              : p.action === 'toggle'
                ? !m.playing
                : m.playing;
        const position =
          p.action === 'restart'
            ? mediaStart(m)
            : p.action === 'seek'
              ? (p.position ?? here)
              : here;
        const media: MediaLayer = {
          ...m,
          playing,
          position,
          syncedAt: nowIso,
          ...(p.volume !== undefined ? { volume: p.volume } : {}),
          ...(p.muted !== undefined ? { muted: p.muted } : {}),
          ...(p.loop !== undefined ? { loop: p.loop } : {}),
        };
        return preview
          ? { ...s, preview: { ...s.preview, media } }
          : { ...s, program: { ...s.program, media } };
      });
      return { result: null };
    },
  });

  bus.register({
    type: 'live.setOverlays',
    schema: z.object({ overlays: z.array(OverlaySchema).max(10) }),
    undoable: false,
    handle: (p) => {
      store.update((s) => ({
        ...s,
        program: { ...s.program, overlays: p.overlays },
        cleared: p.overlays.length ? withoutOff(s.cleared) : s.cleared,
      }));
      return { result: null };
    },
  });

  bus.register({
    type: 'live.testPattern',
    schema: z.object({ outputId: z.string().max(100), on: z.boolean() }),
    undoable: false,
    handle: (p) => {
      store.update((s) => {
        const set = new Set(s.testPatterns);
        if (p.on) set.add(p.outputId);
        else set.delete(p.outputId);
        return { ...s, testPatterns: [...set] };
      });
      return { result: null };
    },
  });

  bus.register({
    type: 'stage.message',
    schema: z.object({ text: z.string().max(300), flash: z.boolean().default(false) }),
    undoable: false,
    handle: (p) => {
      store.update((s) => ({
        ...s,
        stageMessage: p.text.trim() ? { text: p.text, flash: p.flash, sentAt: now() } : null,
      }));
      return { result: null };
    },
  });

  // Timers (Timers bin): start/stop/reset by id; the definition travels with the start so the
  // stage display can show names and kinds without reading settings.
  bus.register({
    type: 'timer.start',
    schema: z.object({ timer: TimerDefSchema }),
    undoable: false,
    handle: (p) => {
      store.update((s) => {
        const at = now();
        const existing = s.timers.find((t) => t.id === p.timer.id);
        const started: LiveTimer = existing
          ? { ...existing, ...p.timer, running: true, startedAt: at }
          : { ...p.timer, running: true, startedAt: at, accumulatedSec: 0 };
        return {
          ...s,
          timers: existing
            ? s.timers.map((t) => (t.id === started.id ? started : t))
            : [...s.timers, started].slice(-20),
        };
      });
      return { result: null };
    },
  });

  bus.register({
    type: 'timer.stop',
    schema: z.object({ id: z.string().max(64) }),
    undoable: false,
    handle: (p) => {
      store.update((s) => ({
        ...s,
        timers: s.timers.map((t) =>
          t.id === p.id && t.running
            ? {
                ...t,
                running: false,
                startedAt: null,
                accumulatedSec:
                  t.accumulatedSec +
                  (t.startedAt ? (Date.parse(now()) - Date.parse(t.startedAt)) / 1000 : 0),
              }
            : t,
        ),
      }));
      return { result: null };
    },
  });

  bus.register({
    // Reset puts a timer back to its start and takes it off the stage display.
    type: 'timer.reset',
    schema: z.object({ id: z.string().max(64) }),
    undoable: false,
    handle: (p) => {
      store.update((s) => ({ ...s, timers: s.timers.filter((t) => t.id !== p.id) }));
      return { result: null };
    },
  });

  bus.register({
    type: 'detection.setMode',
    schema: z.object({ mode: DetectionModeSchema }),
    undoable: false,
    handle: (p) => {
      store.update((s) => ({ ...s, detection: { mode: p.mode } }));
      return { result: null };
    },
  });
}

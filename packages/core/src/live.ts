import { z } from 'zod';
import {
  BackgroundLayerSchema,
  ContentLayerSchema,
  EMPTY_MASKS,
  makeScene,
  MediaLayerSchema,
  OverlaySchema,
  overlayGroup,
  SceneSchema,
  type BackgroundLayer,
  type ContentLayer,
  type MediaLayer,
  type Scene,
} from './schemas/scene';
import { TransitionSpecSchema } from './schemas/theme';
import { LiveTimerSchema, TimerDefSchema, type LiveTimer } from './timers';
import type { CommandBus } from './commands';
import { mediaPositionAt, startMedia } from './media-playback';

export const DetectionModeSchema = z.enum(['off', 'suggest', 'approve', 'auto']);
export type DetectionMode = z.infer<typeof DetectionModeSchema>;

export const PreviewSchema = z.object({
  content: ContentLayerSchema.nullable(),
  background: BackgroundLayerSchema.nullable(),
  /** Full-screen media (video/image item) waiting in preview. */
  media: MediaLayerSchema.nullable().optional(),
  /** Slide shown after this one — fed to the stage display when this goes live. */
  next: ContentLayerSchema.nullable().optional(),
});
export type Preview = z.infer<typeof PreviewSchema>;

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
      return { ...scene, content: null };
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
      return { ...scene, media: null, content: null, overlays: [], masks: EMPTY_MASKS };
  }
}

const SetPreviewSchema = PreviewSchema;
const GoLiveSchema = z.object({
  /** If omitted, the current preview goes live. */
  content: ContentLayerSchema.nullable().optional(),
  background: BackgroundLayerSchema.nullable().optional(),
  /** Full-screen media item. If omitted with no content either, the preview's media goes live. */
  media: MediaLayerSchema.nullable().optional(),
  next: ContentLayerSchema.nullable().optional(),
  transition: TransitionSpecSchema.optional(),
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
        const explicit = p.content !== undefined || p.media !== undefined;
        const content: ContentLayer | null =
          p.content !== undefined ? p.content : explicit ? null : s.preview.content;
        const picked: MediaLayer | null =
          p.media !== undefined ? p.media : explicit ? null : (s.preview.media ?? null);
        // Media that goes live starts from the top, stamped so every output plays in sync.
        const media = picked ? startMedia(picked, now()) : null;
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
          background,
          // Going live with new content lifts black/logo masks — the operator intends to show it.
          masks: { ...s.program.masks, black: false, logo: false },
        };
        if (p.transition) program.transition = p.transition;
        else delete program.transition;
        return { ...s, program, next, programSince: now() };
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
        program: clearLayer(s.program, p.layer),
        next: p.layer === 'content' || p.layer === 'all' || p.layer === 'panic' ? null : s.next,
      }));
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
      position: z.number().min(0).max(86_400).optional(),
      volume: z.number().min(0).max(1).optional(),
      muted: z.boolean().optional(),
      loop: z.boolean().optional(),
    }),
    undoable: false,
    handle: (p) => {
      store.update((s) => {
        const m = s.program.media;
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
          p.action === 'restart' ? 0 : p.action === 'seek' ? (p.position ?? here) : here;
        const media: MediaLayer = {
          ...m,
          playing,
          position,
          syncedAt: nowIso,
          ...(p.volume !== undefined ? { volume: p.volume } : {}),
          ...(p.muted !== undefined ? { muted: p.muted } : {}),
          ...(p.loop !== undefined ? { loop: p.loop } : {}),
        };
        return { ...s, program: { ...s.program, media } };
      });
      return { result: null };
    },
  });

  bus.register({
    type: 'live.setOverlays',
    schema: z.object({ overlays: z.array(OverlaySchema).max(10) }),
    undoable: false,
    handle: (p) => {
      store.update((s) => ({ ...s, program: { ...s.program, overlays: p.overlays } }));
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

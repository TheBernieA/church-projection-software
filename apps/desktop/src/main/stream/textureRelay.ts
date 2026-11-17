import { sharedTexture, webContents } from 'electron';
import { type Logger } from '../types';

/** A Live console that is watching the stream picture. */
export interface Watcher {
  fps: number;
  ready: boolean;
  until: number;
  /** When it was last sent a GPU frame (to keep to its rate). */
  lastFrame: number;
}

/** The stream page's encoder, as a receiver (window ids are positive). */
const ENCODER_TARGET = -1;
/** Consoles never get more frames than this (15 in Light mode). */
const PREVIEW_FPS_CAP = 30;
const PREVIEW_FPS_CAP_LIGHT = 15;

interface Held {
  imported: Electron.SharedTextureImported;
  done: () => void;
}

/** Can this Electron share the offscreen picture as GPU textures? */
export const sharedTexturesAvailable = (): boolean => !!sharedTexture;

/**
 * The GPU pipeline's hand-off: each new stream picture arrives as a GPU texture and goes to the
 * stream page's encoder and to each watching Live console (at the rate it asked for), then is
 * let go. Nothing is copied to the CPU. Every receiver takes one frame at a time: a slow console
 * only skips its own frames, and the encoder always gets the newest picture.
 */
export class TextureRelay {
  /** Receivers with a frame on its way. */
  private readonly pending = new Set<number>();
  /** The newest picture waiting for the stream page (one at most). */
  private held: Held | null = null;
  /** Hand-off counts, for the debug log. */
  readonly stats = { paints: 0, sent: 0, done: 0, failed: 0, toEncoder: 0 };

  constructor(
    private readonly d: {
      log: Logger;
      /** The stream page's frame while its window is open on the GPU pipeline, else null. */
      pageFrame: () => Electron.WebFrameMain | null;
      light: () => boolean;
      debug: boolean;
    },
  ) {}

  onTexture(tex: Electron.OffscreenSharedTexture | null, watchers: Map<number, Watcher>): void {
    if (!tex) return;
    this.stats.paints += 1;
    const targets = this.dueWatchers(watchers);
    // The stream page always gets the picture (even before going live): the window paints only
    // on change, so its encoder must already hold the latest one when encoding starts.
    const toPage = !!this.d.pageFrame();
    if (!targets.length && !toPage) {
      tex.release();
      return;
    }
    let imported: Electron.SharedTextureImported;
    try {
      imported = sharedTexture.importSharedTexture({
        textureInfo: tex.textureInfo,
        allReferencesReleased: () => tex.release(),
      });
    } catch (err) {
      tex.release();
      this.d.log.warn('gpu texture import failed', { err: String(err) });
      return;
    }
    let refs = targets.length + (toPage ? 1 : 0);
    const done = (): void => {
      if (--refs === 0) imported.release();
    };
    for (const t of targets) this.send(t.id, t.frame, imported, done);
    if (!toPage) return;
    if (!this.pending.has(ENCODER_TARGET)) this.sendToPage({ imported, done });
    else {
      // Busy: keep only the newest picture, and send it as soon as the last one arrives.
      this.held?.done();
      this.held = { imported, done };
    }
  }

  /** The window is closing: let go of the picture that was waiting for it. */
  release(): void {
    this.held?.done();
    this.held = null;
  }

  /** The consoles whose next frame is due (each marked as sent now). */
  private dueWatchers(
    watchers: Map<number, Watcher>,
  ): { id: number; frame: Electron.WebFrameMain }[] {
    const now = Date.now();
    const cap = this.d.light() ? PREVIEW_FPS_CAP_LIGHT : PREVIEW_FPS_CAP;
    const due: { id: number; frame: Electron.WebFrameMain }[] = [];
    for (const [id, w] of watchers) {
      const fps = Math.min(w.fps, cap);
      if (fps <= 0 || this.pending.has(id) || now - w.lastFrame < 1000 / fps - 4) continue;
      const wc = webContents.fromId(id);
      if (!wc || wc.isDestroyed()) continue;
      w.lastFrame = now;
      due.push({ id, frame: wc.mainFrame });
    }
    return due;
  }

  private sendToPage(p: Held): void {
    const frame = this.d.pageFrame();
    if (!frame) return p.done();
    this.stats.toEncoder += 1;
    this.send(ENCODER_TARGET, frame, p.imported, () => {
      p.done();
      const next = this.held;
      this.held = null;
      if (next) this.sendToPage(next);
    });
  }

  private send(
    id: number,
    frame: Electron.WebFrameMain,
    imported: Electron.SharedTextureImported,
    done: () => void,
  ): void {
    this.pending.add(id);
    this.stats.sent += 1;
    void sharedTexture
      .sendSharedTexture({ frame, importedSharedTexture: imported })
      .then(
        () => void (this.stats.done += 1),
        (err: unknown) => {
          this.stats.failed += 1;
          if (this.d.debug) this.d.log.info('gpu send failed', { err: String(err), to: id });
        },
      )
      .finally(() => {
        this.pending.delete(id);
        done();
      });
  }
}

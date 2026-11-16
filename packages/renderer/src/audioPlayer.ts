import { audioFadeAt, audioPositionAt, type AudioCue } from '@lampstand/core';
import { safePlay } from './dom';

/**
 * Plays the live audio cue (walk-in music, sound cues) in one window: the main output, or the
 * control window when there's no output. It follows the shared timeline like live video, and
 * ramps the volume through a fade-out.
 */
export class AudioPlayer {
  private readonly el: HTMLAudioElement;
  private cue: AudioCue | null = null;
  private raf = 0;

  constructor(
    doc: Document,
    private readonly mediaUrl: (id: string) => string,
  ) {
    this.el = doc.createElement('audio');
    this.el.preload = 'auto';
  }

  sync(cue: AudioCue | null): void {
    const prev = this.cue;
    this.cue = cue;
    const a = this.el;
    if (!cue) {
      a.pause();
      a.removeAttribute('src');
      a.load();
      this.stopRamp();
      return;
    }
    if (prev?.mediaId !== cue.mediaId) a.src = this.mediaUrl(cue.mediaId);
    a.loop = cue.loop;
    const apply = (): void => {
      const target = audioPositionAt(cue, Date.now());
      const duration = Number.isFinite(a.duration) ? a.duration : undefined;
      const pos = cue.loop && duration ? target % duration : target;
      if (Math.abs(a.currentTime - pos) > 0.3) a.currentTime = pos;
      // play() on an ended track would restart it from 0: a finished track stays finished.
      const finished = !cue.loop && duration !== undefined && target >= duration - 0.05;
      if (cue.playing && !finished) safePlay(a);
      else a.pause();
    };
    if (a.readyState >= 1) apply();
    else a.addEventListener('loadedmetadata', apply, { once: true });
    this.startRamp();
  }

  /** Volume each frame: the cue's volume, times the fade-out when one runs. */
  private startRamp(): void {
    if (this.raf) return;
    const win = this.el.ownerDocument.defaultView;
    if (!win) return;
    const tick = (): void => {
      const cue = this.cue;
      if (!cue) {
        this.raf = 0;
        return;
      }
      this.el.volume = Math.max(0, Math.min(1, cue.volume * audioFadeAt(cue, Date.now())));
      this.raf = win.requestAnimationFrame(tick);
    };
    this.raf = win.requestAnimationFrame(tick);
  }

  private stopRamp(): void {
    if (this.raf) this.el.ownerDocument.defaultView?.cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy(): void {
    this.sync(null);
  }
}

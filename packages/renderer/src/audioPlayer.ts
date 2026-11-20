import { audioFadeAt, audioPositionAt, type AudioCue, type Mixer } from '@lampstand/core';
import { MixerEngine } from './mixer';
import { safePlay, trySetSink } from './dom';

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
    // Read with permission (CORS): a mixer gets silence from media it may only play.
    this.el.crossOrigin = 'anonymous';
    this.el.preload = 'auto';
  }

  /** Its audio element (the stream window routes it into the stream's sound mix). */
  get element(): HTMLAudioElement {
    return this.el;
  }

  /** Where it plays ('' = this window's default output); a device that's gone keeps the default. */
  setSink(sinkId: string): void {
    trySetSink(this.el, sinkId);
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
    // Volume: set once; only a fade-out needs a per-frame ramp.
    a.volume = cue.volume;
    if (cue.fade) this.startRamp();
    else this.stopRamp();
  }

  /** While a fade-out runs: volume each frame, the cue's volume times the fade. */
  private startRamp(): void {
    if (this.raf) return;
    const win = this.el.ownerDocument.defaultView;
    if (!win) return;
    const tick = (): void => {
      const cue = this.cue;
      if (!cue?.fade) {
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

/**
 * The room's sound in one window (the main output, or the control window with no output): the
 * Audio tab's track, the sound of videos and the live inputs, through the room mix.
 */
export class RoomAudio {
  private readonly player: AudioPlayer;
  readonly mixer: MixerEngine;

  constructor(win: Window, mediaUrl: (id: string) => string) {
    this.player = new AudioPlayer(win.document, mediaUrl);
    this.mixer = new MixerEngine(win, { bus: 'room', speakers: true, openAllInputs: true });
    this.mixer.attach('tracks', this.player.element);
  }

  /** The speakers or desk the room hears (Settings › Audio); '' = the default output. */
  setSink(sinkId: string): void {
    this.mixer.setSink(sinkId);
  }

  /** A video's sound joins the room mix (pass to SceneRenderer's `audioTap`). */
  readonly tapVideo = (v: HTMLMediaElement): void => this.mixer.attach('video', v);

  sync(audio: AudioCue | null, mixer: Mixer): void {
    this.player.sync(audio);
    this.mixer.sync(mixer);
  }

  destroy(): void {
    this.player.destroy();
    this.mixer.destroy();
  }
}

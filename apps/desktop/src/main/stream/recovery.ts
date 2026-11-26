import { isKeepingUp, isStruggling, type HealthSample } from './health';

/** Lighten by itself (setting on): still struggling this long after the warning… */
export const AUTO_LIGHTEN_AFTER_MS = 30_000;
/** …and never change the stream's mode twice within this (each change is a short pause). */
export const CHANGE_GAP_MS = 60_000;
/** Lightened: steady this long (and at least since the last change) before going back up. */
export const RESTORE_AFTER_MS = 120_000;
/** Samples (2 s each) that must be clean before going back up: the last 2 minutes. */
export const RESTORE_SAMPLES = 60;
/** Struggling again this soon after going back up: that mode is too much for this stream. */
export const RESTORE_HELD_MS = 5 * 60_000;

export type RecoveryAction =
  /** Warn that this computer can't keep up (and ease off the control window). */
  | 'advise'
  /** Keeping up again: clear the warning (and bring the control window back unless it's latched). */
  | 'clear'
  /** Restart one mode lighter (auto-lighten). */
  | 'lighten'
  /** Restart one mode heavier, back towards the settings (auto-lighten). */
  | 'restore'
  /** Steady while lightened: offer to go back (auto-lighten off: the creator decides). */
  | 'offerRestore'
  | null;

export interface RecoveryInput {
  now: number;
  /** The upload, not the computer, is the bottleneck (the bitrate guard handles that). */
  uploadBound: boolean;
  /** A lighter mode exists. */
  canLighten: boolean;
  /** Steps the stream is lighter than its settings (0: as set). */
  lightened: number;
}

/**
 * What to do about a computer that can't keep up, and when to undo it. Every step back is
 * earned, and nothing flip-flops:
 * - The studio eases off at the first warning and comes back after 30 s of keeping up; a
 *   second struggle in the same session keeps it eased off for the rest of it.
 * - A lightened stream goes back up one mode after 2 minutes steady (by itself with
 *   auto-lighten, else offered); if it struggles again within 5 minutes of going back up, it
 *   stays at the lighter mode for the rest of the session.
 */
export class Recovery {
  /** The warning is showing. */
  advised = false;
  /** The control window is eased off (its previews slowed). */
  easeOff = false;
  /** Going back up didn't hold: stay at the lighter mode. */
  stayLight = false;
  private struggles = 0;
  private advisedAt = 0;
  private lastChange = 0;
  private restoredAt: number | null = null;
  private offered = false;

  /** Lighten (and come back) by itself; the creator can switch it while live. */
  constructor(public autoLighten: boolean) {}

  /** The encoder restarted (samples start again; the warning is re-earned). */
  restarted(): void {
    this.advised = false;
  }

  /** Going back up is on offer now (it survives restarts such as reconnects). */
  get offering(): boolean {
    return this.offered && !this.advised;
  }

  /**
   * The mode changed (either way, by the creator or by Lampstand: its own steps from next() are
   * already recorded, and recording one twice changes nothing).
   */
  changed(now: number, direction: 'lighter' | 'heavier'): void {
    this.lastChange = now;
    this.offered = false;
    if (direction === 'heavier') this.restoredAt = now;
  }

  next(samples: readonly HealthSample[], o: RecoveryInput): RecoveryAction {
    return (
      this.struggling(samples, o) ??
      this.keepingUp(samples) ??
      this.lighter(samples, o) ??
      this.heavier(samples, o)
    );
  }

  private struggling(samples: readonly HealthSample[], o: RecoveryInput): RecoveryAction {
    if (this.advised || o.uploadBound || !isStruggling(samples)) return null;
    this.advised = true;
    this.advisedAt = o.now;
    // A new struggle only after having come back (one that goes on through a restart is one).
    if (!this.easeOff) this.struggles += 1;
    this.easeOff = true;
    // Going back up is offered again once it's earned again.
    this.offered = false;
    if (this.restoredAt !== null && o.now - this.restoredAt < RESTORE_HELD_MS)
      this.stayLight = true;
    return 'advise';
  }

  private keepingUp(samples: readonly HealthSample[]): RecoveryAction {
    const latched = this.struggles >= 2;
    if (!(this.advised || (this.easeOff && !latched)) || !isKeepingUp(samples)) return null;
    this.advised = false;
    if (!latched) this.easeOff = false;
    return 'clear';
  }

  private lighter(samples: readonly HealthSample[], o: RecoveryInput): RecoveryAction {
    const due =
      this.advised &&
      this.autoLighten &&
      o.canLighten &&
      !o.uploadBound &&
      o.now - this.advisedAt >= AUTO_LIGHTEN_AFTER_MS &&
      o.now - this.lastChange >= CHANGE_GAP_MS;
    if (!due || !isStruggling(samples)) return null;
    this.changed(o.now, 'lighter');
    return 'lighten';
  }

  private heavier(samples: readonly HealthSample[], o: RecoveryInput): RecoveryAction {
    const steady =
      o.lightened > 0 &&
      !this.advised &&
      // Still recovering (a latched ease-off after a second struggle doesn't hold this back).
      !(this.easeOff && this.struggles < 2) &&
      !this.stayLight &&
      !o.uploadBound &&
      o.now - this.lastChange >= RESTORE_AFTER_MS;
    if (!steady || !isKeepingUp(samples, RESTORE_SAMPLES)) return null;
    if (this.autoLighten) {
      this.changed(o.now, 'heavier');
      return 'restore';
    }
    if (this.offered) return null;
    this.offered = true;
    return 'offerRestore';
  }
}
